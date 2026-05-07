import { useCallback, useEffect, useRef, useState } from 'react';
import { Editor } from './components/Editor';
import { Sidebar } from './components/Sidebar';
import { Backlinks } from './components/Backlinks';
import { useHashRoute } from './hooks/useHashRoute';
import { useTree } from './hooks/useTree';
import { useDebouncedEffect } from './hooks/useDebouncedEffect';
import { useWatch, WatchEvent } from './hooks/useWatch';
import { buildTree, todayDailyPath, todayHeading } from './utils/tree';
import { resolveWikiTarget } from './utils/wikiLink';
import {
  getFile,
  putFile,
  deleteFile,
  moveFile,
  fileExists,
  FileApiError,
  FileMeta
} from './api/client';

const SAVE_DEBOUNCE_MS = 500;
const TREE_RELOAD_DEBOUNCE_MS = 250;
const BACKLINK_REFRESH_DEBOUNCE_MS = 1000;
const DEFAULT_NEW_NOTE_PATH = 'pages/untitled.md';

type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

interface ConflictState {
  newContent: string;
  newMtime: number;
}

export function App() {
  const [path, navigate] = useHashRoute();
  const { entries, error: treeError, reload: reloadTree } = useTree();

  const [content, setContent] = useState<string>('');
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<ConflictState | null>(null);
  const [backlinkRefreshKey, setBacklinkRefreshKey] = useState(0);
  const [pendingTreeReload, setPendingTreeReload] = useState(0);
  const [pendingBacklinkBump, setPendingBacklinkBump] = useState(0);

  // Track which path the in-memory `content` belongs to. Without this,
  // a hash change can fire a stale debounced save against the new path.
  const loadedPathRef = useRef<string | null>(null);
  // Last known mtime per path. Used to distinguish our own writes from
  // external edits when a 'modified' watch event arrives.
  const lastMtimeRef = useRef<Map<string, number>>(new Map());

  // Refs that the SSE handler reads at event time to avoid stale closures.
  const pathRef = useRef(path);
  pathRef.current = path;
  const saveStatusRef = useRef(saveStatus);
  saveStatusRef.current = saveStatus;

  // First-load default: navigate to today's daily note.
  useEffect(() => {
    if (path === '') navigate(todayDailyPath());
    // Only on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load the file whenever the path changes.
  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    setLoaded(false);
    setLoadError(null);
    setSaveStatus('idle');
    setConflict(null);
    (async () => {
      try {
        const { content: c, mtime } = await getFile(path);
        if (cancelled) return;
        loadedPathRef.current = path;
        lastMtimeRef.current.set(path, mtime);
        setContent(c);
        setLoaded(true);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof FileApiError && err.status === 404) {
          const seed = path === todayDailyPath() ? todayHeading() : '';
          loadedPathRef.current = path;
          setContent(seed);
          setLoaded(true);
          if (seed !== '') setSaveStatus('pending');
        } else {
          setLoadError(err instanceof Error ? err.message : String(err));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [path]);

  const handleChange = useCallback((next: string) => {
    setContent(next);
    setSaveStatus('pending');
  }, []);

  useDebouncedEffect(
    () => {
      if (!loaded || saveStatus !== 'pending') return;
      const targetPath = loadedPathRef.current;
      if (!targetPath || targetPath !== path) return;
      let cancelled = false;
      const wasNew = entries?.some((e) => e.path === targetPath) === false;
      (async () => {
        setSaveStatus('saving');
        try {
          const result = await putFile(targetPath, content);
          if (cancelled) return;
          lastMtimeRef.current.set(targetPath, result.mtime);
          setSaveStatus('saved');
          setSaveError(null);
          if (wasNew) reloadTree();
        } catch (err) {
          if (cancelled) return;
          setSaveStatus('error');
          setSaveError(err instanceof Error ? err.message : String(err));
        }
      })();
      return () => {
        cancelled = true;
      };
    },
    [content, loaded, saveStatus, path],
    SAVE_DEBOUNCE_MS
  );

  // ── SSE watch ─────────────────────────────────────────────────────────────

  const handleWatchEvent = useCallback((event: WatchEvent) => {
    if (event.type === 'created' || event.type === 'deleted') {
      setPendingTreeReload((n) => n + 1);
    }
    // Any .md change might affect backlinks for the current page.
    if (/\.md$/i.test(event.path)) {
      setPendingBacklinkBump((n) => n + 1);
    }
    if (event.type === 'modified' && event.path === pathRef.current) {
      void handleExternalModified(event.path);
    }
    if (event.type === 'deleted' && event.path === pathRef.current) {
      // The current file was deleted under us. Clear and surface an error.
      setLoaded(false);
      setLoadError('This note was deleted externally.');
    }
  }, []);

  useWatch({ onEvent: handleWatchEvent });

  // Debounced effects for batched events ──────────────────────────────────
  useDebouncedEffect(
    () => {
      if (pendingTreeReload === 0) return;
      reloadTree();
    },
    [pendingTreeReload],
    TREE_RELOAD_DEBOUNCE_MS
  );

  useDebouncedEffect(
    () => {
      if (pendingBacklinkBump === 0) return;
      setBacklinkRefreshKey((n) => n + 1);
    },
    [pendingBacklinkBump],
    BACKLINK_REFRESH_DEBOUNCE_MS
  );

  async function handleExternalModified(changedPath: string) {
    try {
      const { content: newContent, mtime: newMtime } = await getFile(changedPath);
      const known = lastMtimeRef.current.get(changedPath);
      if (known !== undefined && newMtime === known) return; // Our own save echo.
      const status = saveStatusRef.current;
      if (status === 'saving' || status === 'pending') {
        // User is mid-edit. Surface a banner; don't clobber.
        setConflict({ newContent, newMtime });
      } else {
        loadedPathRef.current = changedPath;
        lastMtimeRef.current.set(changedPath, newMtime);
        setContent(newContent);
        setSaveStatus('idle');
      }
    } catch (err) {
      if (err instanceof FileApiError && err.status === 404) {
        // Race with delete; the deleted handler will fire too.
      }
    }
  }

  const acceptConflict = useCallback(() => {
    if (!conflict) return;
    const target = pathRef.current;
    loadedPathRef.current = target;
    lastMtimeRef.current.set(target, conflict.newMtime);
    setContent(conflict.newContent);
    setSaveStatus('idle');
    setConflict(null);
  }, [conflict]);

  const dismissConflict = useCallback(() => setConflict(null), []);

  // ── Sidebar / file ops ────────────────────────────────────────────────────

  const handleNewNote = useCallback(async () => {
    const input = window.prompt('New note path (relative to /brain):', DEFAULT_NEW_NOTE_PATH);
    if (!input) return;
    const target = input.trim().replace(/^\/+/, '');
    if (!target) return;
    const finalPath = target.endsWith('.md') ? target : `${target}.md`;
    try {
      const exists = await fileExists(finalPath);
      if (!exists) await putFile(finalPath, '');
      await reloadTree();
      navigate(finalPath);
    } catch (err) {
      window.alert(`Failed to create: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [navigate, reloadTree]);

  const handleTodayNote = useCallback(async () => {
    const target = todayDailyPath();
    try {
      const exists = await fileExists(target);
      if (!exists) {
        await putFile(target, todayHeading());
        await reloadTree();
      }
      navigate(target);
    } catch (err) {
      window.alert(`Failed to open today's note: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [navigate, reloadTree]);

  const handleRename = useCallback(
    async (oldPath: string) => {
      const input = window.prompt(`Rename "${oldPath}" to:`, oldPath);
      if (!input) return;
      const target = input.trim().replace(/^\/+/, '');
      if (!target || target === oldPath) return;
      try {
        await moveFile(oldPath, target);
        await reloadTree();
        if (path === oldPath) navigate(target);
      } catch (err) {
        window.alert(`Rename failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
    [navigate, path, reloadTree]
  );

  const handleDelete = useCallback(
    async (target: string) => {
      if (!window.confirm(`Delete "${target}"? This cannot be undone.`)) return;
      try {
        await deleteFile(target);
        await reloadTree();
        if (path === target) navigate('');
      } catch (err) {
        window.alert(`Delete failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
    [navigate, path, reloadTree]
  );

  // ── Wiki links ────────────────────────────────────────────────────────────

  const handleWikiLinkClick = useCallback(
    async (target: string) => {
      const list: FileMeta[] = entries ?? [];
      const resolved = resolveWikiTarget(target, list);
      if (!resolved) return;
      try {
        const exists = await fileExists(resolved);
        if (!exists) {
          await putFile(resolved, `# ${target}\n\n`);
          reloadTree();
        }
        navigate(resolved);
      } catch (err) {
        window.alert(
          `Failed to open [[${target}]]: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    },
    [entries, navigate, reloadTree]
  );

  const tree = entries === null ? null : buildTree(entries);

  return (
    <div className="app">
      <header className="app-header">
        <span className="app-title">BizerOS Knowledge</span>
        <span className="app-path">/brain/{path || '(no file selected)'}</span>
        <SaveIndicator status={saveStatus} error={saveError} />
      </header>
      {conflict && (
        <div className="conflict-banner">
          <span>External change detected. You have unsaved edits.</span>
          <button onClick={acceptConflict} className="conflict-accept">
            Discard mine, load theirs
          </button>
          <button onClick={dismissConflict} className="conflict-dismiss">
            Keep mine
          </button>
        </div>
      )}
      <div className="app-body">
        <Sidebar
          tree={tree}
          treeError={treeError}
          currentPath={path}
          onSelect={(p) => navigate(p)}
          onNewNote={handleNewNote}
          onTodayNote={handleTodayNote}
          onRename={handleRename}
          onDelete={handleDelete}
        />
        <main className="app-main">
          {loadError ? (
            <div className="app-error">
              <h2>Failed to load {path}</h2>
              <pre>{loadError}</pre>
            </div>
          ) : !path ? (
            <div className="app-empty">Pick a note from the sidebar, or click "Today".</div>
          ) : !loaded ? (
            <div className="app-loading">Loading…</div>
          ) : (
            <div className="app-editor-stack">
              <Editor value={content} onChange={handleChange} onWikiLinkClick={handleWikiLinkClick} />
              <Backlinks
                currentPath={path}
                entries={entries}
                onSelect={(p) => navigate(p)}
                refreshKey={backlinkRefreshKey}
              />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function SaveIndicator({ status, error }: { status: SaveStatus; error: string | null }) {
  switch (status) {
    case 'idle':
      return <span className="save-indicator save-indicator-idle">ready</span>;
    case 'pending':
      return <span className="save-indicator save-indicator-pending">unsaved…</span>;
    case 'saving':
      return <span className="save-indicator save-indicator-saving">saving…</span>;
    case 'saved':
      return <span className="save-indicator save-indicator-saved">saved</span>;
    case 'error':
      return (
        <span className="save-indicator save-indicator-error" title={error ?? ''}>
          save failed
        </span>
      );
  }
}
