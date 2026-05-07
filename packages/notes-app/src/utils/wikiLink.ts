import { FileMeta } from '../api/client';

export interface WikiLink {
  /** Raw inner text including any pipe alias, e.g. "Foo Page|alias". */
  raw: string;
  /** Target portion (left side of pipe), trimmed. */
  target: string;
  /** Optional display alias (right side of pipe), trimmed, or null. */
  alias: string | null;
  /** Inclusive start index of the leading "[[". */
  start: number;
  /** Exclusive end index, just past the trailing "]]". */
  end: number;
}

const WIKI_LINK_REGEX = /\[\[([^\]\n]+?)\]\]/g;

export function parseWikiLink(raw: string): { target: string; alias: string | null } {
  const pipe = raw.indexOf('|');
  if (pipe === -1) return { target: raw.trim(), alias: null };
  return {
    target: raw.slice(0, pipe).trim(),
    alias: raw.slice(pipe + 1).trim()
  };
}

/**
 * Find the wiki-link enclosing `pos` in `text`, or null if pos isn't inside
 * one. Used by the Cmd/Ctrl-click handler.
 */
export function findWikiLinkAt(text: string, pos: number): WikiLink | null {
  WIKI_LINK_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = WIKI_LINK_REGEX.exec(text)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    if (pos >= start && pos <= end) {
      const raw = match[1];
      const { target, alias } = parseWikiLink(raw);
      return { raw, target, alias, start, end };
    }
    if (start > pos) break;
  }
  return null;
}

export function basenameOf(path: string): string {
  const last = path.split('/').pop() ?? path;
  return last.replace(/\.md$/i, '');
}

/**
 * Resolve a wiki-link target to a brain path. Resolution order:
 *   1. Exact path match (target already includes folders)
 *   2. Exact path match with `.md` appended
 *   3. Basename match anywhere in the brain
 *   4. Fallback to `pages/<target>.md` (caller decides whether to create it)
 */
export function resolveWikiTarget(target: string, entries: FileMeta[]): string {
  if (!target) return '';
  const stripped = target.replace(/^\/+/, '');
  const withMd = stripped.endsWith('.md') ? stripped : `${stripped}.md`;

  for (const e of entries) {
    if (e.isDir) continue;
    if (e.path === stripped || e.path === withMd) return e.path;
  }

  const base = stripped.replace(/\.md$/i, '');
  for (const e of entries) {
    if (e.isDir) continue;
    if (basenameOf(e.path) === base) return e.path;
  }

  return `pages/${withMd}`;
}

/** Escape regex metacharacters in a literal string. */
export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Build a regex that matches any [[<target>]] or [[<target>|alias]] for the given target name. */
export function backlinksRegex(targetBaseName: string): RegExp {
  const escaped = escapeRegex(targetBaseName);
  return new RegExp(`\\[\\[\\s*${escaped}(?:\\s*\\|[^\\]\\n]*)?\\s*\\]\\]`, 'i');
}
