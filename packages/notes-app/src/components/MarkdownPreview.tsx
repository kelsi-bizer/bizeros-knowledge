import { useEffect, useMemo, useRef } from 'react';
import { marked, Tokens } from 'marked';
import DOMPurify from 'dompurify';
import { parseWikiLink } from '../utils/wikiLink';

interface MarkdownPreviewProps {
  content: string;
  onWikiLinkClick: (target: string) => void;
}

interface WikiLinkToken extends Tokens.Generic {
  type: 'wikiLink';
  raw: string;
  target: string;
  alias: string | null;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}

let installed = false;
function installWikiLinkExtension() {
  if (installed) return;
  installed = true;
  marked.use({
    extensions: [
      {
        name: 'wikiLink',
        level: 'inline',
        start(src: string) {
          const idx = src.indexOf('[[');
          return idx === -1 ? undefined : idx;
        },
        tokenizer(src: string): WikiLinkToken | undefined {
          const match = /^\[\[([^\]\n]+?)\]\]/.exec(src);
          if (!match) return undefined;
          const { target, alias } = parseWikiLink(match[1]);
          return {
            type: 'wikiLink',
            raw: match[0],
            target,
            alias
          };
        },
        renderer(token) {
          const wt = token as WikiLinkToken;
          const display = wt.alias ?? wt.target;
          return `<a class="wiki-link" data-target="${escapeHtml(wt.target)}" href="#${encodeURIComponent(wt.target)}">${escapeHtml(display)}</a>`;
        }
      }
    ]
  });
}

export function MarkdownPreview({ content, onWikiLinkClick }: MarkdownPreviewProps) {
  installWikiLinkExtension();

  const hostRef = useRef<HTMLDivElement | null>(null);
  const onClickRef = useRef(onWikiLinkClick);
  onClickRef.current = onWikiLinkClick;

  const html = useMemo(() => {
    const parsed = marked.parse(content, { async: false }) as string;
    return DOMPurify.sanitize(parsed, { ADD_ATTR: ['data-target'] });
  }, [content]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const handler = (event: MouseEvent) => {
      const link = (event.target as HTMLElement | null)?.closest('a.wiki-link');
      if (!link) return;
      event.preventDefault();
      const target = link.getAttribute('data-target');
      if (target) onClickRef.current(target);
    };
    host.addEventListener('click', handler);
    return () => host.removeEventListener('click', handler);
  }, []);

  return (
    <div
      ref={hostRef}
      className="markdown-preview"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
