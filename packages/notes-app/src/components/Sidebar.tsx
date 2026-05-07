import { FileTree } from './FileTree';
import { TreeNode } from '../utils/tree';

interface SidebarProps {
  tree: TreeNode[] | null;
  treeError: string | null;
  currentPath: string;
  onSelect: (path: string) => void;
  onNewNote: () => void;
  onTodayNote: () => void;
  onRename: (path: string) => void;
  onDelete: (path: string) => void;
}

export function Sidebar({
  tree,
  treeError,
  currentPath,
  onSelect,
  onNewNote,
  onTodayNote,
  onRename,
  onDelete
}: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="sidebar-toolbar">
        <button onClick={onTodayNote} title="Open today's daily note">
          Today
        </button>
        <button onClick={onNewNote} title="Create a new note">
          + New
        </button>
      </div>
      <div className="sidebar-tree">
        {treeError ? (
          <div className="sidebar-error">{treeError}</div>
        ) : tree === null ? (
          <div className="sidebar-empty">Loading…</div>
        ) : tree.length === 0 ? (
          <div className="sidebar-empty">Your brain is empty. Create a note to start.</div>
        ) : (
          <FileTree
            nodes={tree}
            currentPath={currentPath}
            onSelect={onSelect}
            onRename={onRename}
            onDelete={onDelete}
          />
        )}
      </div>
    </aside>
  );
}
