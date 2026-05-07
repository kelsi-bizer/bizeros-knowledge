import { useState } from 'react';
import { TreeNode } from '../utils/tree';

interface FileTreeProps {
  nodes: TreeNode[];
  currentPath: string;
  onSelect: (path: string) => void;
  onRename: (path: string) => void;
  onDelete: (path: string) => void;
}

export function FileTree({ nodes, currentPath, onSelect, onRename, onDelete }: FileTreeProps) {
  return (
    <ul className="file-tree">
      {nodes.map((node) => (
        <FileTreeNode
          key={node.path}
          node={node}
          depth={0}
          currentPath={currentPath}
          onSelect={onSelect}
          onRename={onRename}
          onDelete={onDelete}
        />
      ))}
    </ul>
  );
}

interface NodeProps {
  node: TreeNode;
  depth: number;
  currentPath: string;
  onSelect: (path: string) => void;
  onRename: (path: string) => void;
  onDelete: (path: string) => void;
}

function FileTreeNode({ node, depth, currentPath, onSelect, onRename, onDelete }: NodeProps) {
  const [open, setOpen] = useState(true);
  const isCurrent = !node.isDir && node.path === currentPath;
  const indent = { paddingLeft: `${depth * 0.75 + 0.5}rem` };

  if (node.isDir) {
    return (
      <li>
        <button
          className="file-tree-row file-tree-dir"
          style={indent}
          onClick={() => setOpen((o) => !o)}
        >
          <span className="file-tree-disclosure">{open ? '▾' : '▸'}</span>
          <span className="file-tree-name">{node.name}/</span>
        </button>
        {open && node.children.length > 0 && (
          <ul className="file-tree-children">
            {node.children.map((child) => (
              <FileTreeNode
                key={child.path}
                node={child}
                depth={depth + 1}
                currentPath={currentPath}
                onSelect={onSelect}
                onRename={onRename}
                onDelete={onDelete}
              />
            ))}
          </ul>
        )}
      </li>
    );
  }

  return (
    <li>
      <div
        className={'file-tree-row file-tree-file' + (isCurrent ? ' file-tree-current' : '')}
        style={indent}
      >
        <button
          className="file-tree-name file-tree-button"
          onClick={() => onSelect(node.path)}
          title={node.path}
        >
          {node.name}
        </button>
        <span className="file-tree-actions">
          <button
            className="file-tree-action"
            onClick={() => onRename(node.path)}
            title="Rename"
            aria-label={`Rename ${node.path}`}
          >
            ✎
          </button>
          <button
            className="file-tree-action"
            onClick={() => onDelete(node.path)}
            title="Delete"
            aria-label={`Delete ${node.path}`}
          >
            ✕
          </button>
        </span>
      </div>
    </li>
  );
}
