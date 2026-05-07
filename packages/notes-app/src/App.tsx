import { useCallback, useEffect, useState } from 'react';
import { Editor } from './components/Editor';
import { getFile, putFile, FileApiError } from './api/client';
import { useDebouncedEffect } from './hooks/useDebouncedEffect';

const HARDCODED_PATH = 'scratch.md';
const SAVE_DEBOUNCE_MS = 500;

type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

export function App() {
  const [content, setContent] = useState<string>('');
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { content: loadedContent } = await getFile(HARDCODED_PATH);
        if (!cancelled) {
          setContent(loadedContent);
          setLoaded(true);
        }
      } catch (err) {
        if (cancelled) return;
        if (err instanceof FileApiError && err.status === 404) {
          setContent('# Welcome to BizerOS Knowledge\n\nStart typing — your changes auto-save.\n');
          setLoaded(true);
        } else {
          setLoadError(err instanceof Error ? err.message : String(err));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleChange = useCallback((next: string) => {
    setContent(next);
    setSaveStatus('pending');
  }, []);

  useDebouncedEffect(
    () => {
      if (!loaded || saveStatus !== 'pending') return;
      let cancelled = false;
      (async () => {
        setSaveStatus('saving');
        try {
          await putFile(HARDCODED_PATH, content);
          if (!cancelled) {
            setSaveStatus('saved');
            setSaveError(null);
          }
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
    [content, loaded, saveStatus],
    SAVE_DEBOUNCE_MS
  );

  if (loadError) {
    return (
      <div className="app-error">
        <h2>Failed to load {HARDCODED_PATH}</h2>
        <pre>{loadError}</pre>
      </div>
    );
  }

  if (!loaded) {
    return <div className="app-loading">Loading…</div>;
  }

  return (
    <div className="app">
      <header className="app-header">
        <span className="app-title">BizerOS Knowledge</span>
        <span className="app-path">/brain/{HARDCODED_PATH}</span>
        <SaveIndicator status={saveStatus} error={saveError} />
      </header>
      <main className="app-main">
        <Editor value={content} onChange={handleChange} />
      </main>
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
