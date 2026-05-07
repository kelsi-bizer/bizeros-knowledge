import { useCallback, useEffect, useState } from 'react';
import { getTree, FileMeta } from '../api/client';

export interface UseTreeResult {
  entries: FileMeta[] | null;
  error: string | null;
  reload: () => Promise<void>;
}

export function useTree(): UseTreeResult {
  const [entries, setEntries] = useState<FileMeta[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const next = await getTree();
      setEntries(next);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return { entries, error, reload };
}
