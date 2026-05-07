import { useEffect, useState, useCallback } from 'react';

function readHash(): string {
  const raw = window.location.hash;
  if (!raw || raw === '#') return '';
  const stripped = raw.startsWith('#') ? raw.slice(1) : raw;
  try {
    return decodeURIComponent(stripped);
  } catch {
    return stripped;
  }
}

export function useHashRoute(): [string, (next: string) => void] {
  const [path, setPath] = useState<string>(() => readHash());

  useEffect(() => {
    const onHash = () => setPath(readHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const navigate = useCallback((next: string) => {
    const encoded = next ? '#' + encodeURIComponent(next).replace(/%2F/g, '/') : '';
    if (window.location.hash === encoded) return;
    window.location.hash = encoded;
  }, []);

  return [path, navigate];
}
