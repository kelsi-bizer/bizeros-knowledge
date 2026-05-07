import {
  Decoration,
  DecorationSet,
  EditorView,
  MatchDecorator,
  ViewPlugin,
  ViewUpdate
} from '@codemirror/view';
import { findWikiLinkAt } from '../utils/wikiLink';

const wikiLinkDecoration = Decoration.mark({ class: 'cm-wiki-link' });

const wikiLinkMatcher = new MatchDecorator({
  regexp: /\[\[([^\]\n]+?)\]\]/g,
  decoration: () => wikiLinkDecoration
});

export const wikiLinkDecorationPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = wikiLinkMatcher.createDeco(view);
    }
    update(update: ViewUpdate) {
      this.decorations = wikiLinkMatcher.updateDeco(update, this.decorations);
    }
  },
  { decorations: (v) => v.decorations }
);

/** Returns a CodeMirror extension that calls `onClick(target)` when the user
 * Cmd/Ctrl-clicks a [[wiki link]]. */
export function wikiLinkClickHandler(onClick: (target: string) => void) {
  return EditorView.domEventHandlers({
    click(event, view) {
      if (!event.metaKey && !event.ctrlKey) return false;
      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
      if (pos == null) return false;
      const link = findWikiLinkAt(view.state.doc.toString(), pos);
      if (!link) return false;
      event.preventDefault();
      onClick(link.target);
      return true;
    }
  });
}
