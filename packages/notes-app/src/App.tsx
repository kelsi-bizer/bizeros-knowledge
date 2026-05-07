import { useCallback, useEffect, useRef, useState } from 'react';
import { Editor } from './components/Editor';
import { Sidebar } from './components/Sidebar';
import { useHashRoute } from './hooks/useHashRoute';
import { useTree } from './hooks/useTree';
import { useDebouncedEffect } from './hooks/useDebouncedEffect';
import { buildTree, todayDailyPath, todayHeading } from './utils/tree';
import {
  getFile,
  putFile,
  deleteFile,
  moveFile,
  fileExists,
  FileApiError
} from './api/client';

const SAVE_DEBOUNCE_MS = 500;
const DEFAULT_NEW_NOTE_PATH = 'pages/untitled.md';

type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

export function App() {
  const [path, navigate] = useHashRoute();
  const { entries, error: treeError, reload: reloadTree } = useTree();

  const [content, setContent] = useState<string>('');
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);

  // Track which path the in-memory `content` belongs to. Without this,
  // a hash change can fire a stale debounced save against the new path.
  const loadedPathRef = useRef<string | null>(null);

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
    (async () => {
      try {
        const { content: c } = await getFile(path);
        if (cancelled) return;
        loadedPathRef.current = path;
        setContent(c);
        setLoaded(true);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof FileApiError && err.status === 404) {
          // Missing file: seed with today's heading for daily notes, otherwise empty.
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
          await putFile(targetPath, content);
          if (cancelled) return;
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

  const tree = entries === null ? null : buildTree(entries);

  return (
    <div className="app">
      <header className="app-header">
        <span className="app-title">BizerOS Knowledge</span>
        <span className="app-path">/brain/{path || '(no file selected)'}</span>
        <SaveIndicator status={saveStatus} error={saveError} />
      </header>
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
            <Editor value={content} onChange={handleChange} />
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
