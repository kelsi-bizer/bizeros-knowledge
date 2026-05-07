import { useEffect, useState } from 'react';
import { FileMeta, FileApiError, getFile } from '../api/client';
import { backlinksRegex, basenameOf } from '../utils/wikiLink';

export interface BacklinkHit {
  path: string;
  snippet: string;
  line: number;
}

interface BacklinksProps {
  currentPath: string;
  entries: FileMeta[] | null;
  onSelect: (path: string) => void;
  /** Bumped externally when a watcher event implies backlinks may have changed. */
  refreshKey: number;
}

const SNIPPET_MAX = 200;

async function findBacklinks(
  currentPath: string,
  entries: FileMeta[]
): Promise<BacklinkHit[]> {
  const target = basenameOf(currentPath);
  if (!target) return [];
  const pattern = backlinksRegex(target);
  const candidates = entries.filter(
    (e) => !e.isDir && /\.md$/i.test(e.path) && e.path !== currentPath
  );
  const hits: BacklinkHit[] = [];
  for (const candidate of candidates) {
    try {
      const { content } = await getFile(candidate.path);
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (pattern.test(lines[i])) {
          hits.push({
            path: candidate.path,
            snippet: lines[i].trim().slice(0, SNIPPET_MAX),
            line: i + 1
          });
          break;
        }
      }
    } catch (err) {
      if (err instanceof FileApiError && err.status === 404) continue;
      // Other errors: skip silently — backlinks should never crash the app.
    }
  }
  return hits;
}

export function Backlinks({ currentPath, entries, onSelect, refreshKey }: BacklinksProps) {
  const [hits, setHits] = useState<BacklinkHit[] | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (!currentPath || !entries) {
      setHits(null);
      return;
    }
    let cancelled = false;
    setHits(null);
    (async () => {
      const result = await findBacklinks(currentPath, entries);
      if (!cancelled) setHits(result);
    })();
    return () => {
      cancelled = true;
    };
  }, [currentPath, entries, refreshKey]);

  if (!currentPath) return null;

  const count = hits?.length ?? 0;
  const label = hits === null ? 'scanning…' : `${count} backlink${count === 1 ? '' : 's'}`;

  return (
    <section className="backlinks">
      <button
        className="backlinks-header"
        onClick={() => setCollapsed((c) => !c)}
        aria-expanded={!collapsed}
      >
        <span className="backlinks-disclosure">{collapsed ? '▸' : '▾'}</span>
        <span>Backlinks</span>
        <span className="backlinks-count">{label}</span>
      </button>
      {!collapsed && hits !== null && hits.length > 0 && (
        <ul className="backlinks-list">
          {hits.map((hit) => (
            <li key={hit.path + ':' + hit.line}>
              <button className="backlinks-row" onClick={() => onSelect(hit.path)}>
                <span className="backlinks-path">{hit.path}</span>
                <span className="backlinks-snippet">{hit.snippet}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {!collapsed && hits !== null && hits.length === 0 && (
        <div className="backlinks-empty">No notes link to this page yet.</div>
      )}
    </section>
  );
}
