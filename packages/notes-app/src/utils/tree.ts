import { FileMeta } from '../api/client';

export interface TreeNode {
  name: string;
  path: string;
  isDir: boolean;
  children: TreeNode[];
  size?: number;
  mtime?: number;
}

function strip(path: string, suffix: string): string {
  return path.endsWith(suffix) ? path.slice(0, -suffix.length) : path;
}

export function buildTree(entries: FileMeta[]): TreeNode[] {
  const sorted = [...entries].sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return a.path.localeCompare(b.path);
  });

  const dirMap = new Map<string, TreeNode>();
  const root: TreeNode[] = [];

  for (const entry of sorted) {
    const cleanPath = entry.isDir ? strip(entry.path, '/') : entry.path;
    if (cleanPath === '') continue;

    const segments = cleanPath.split('/');
    const name = segments[segments.length - 1] ?? cleanPath;
    const parentPath = segments.slice(0, -1).join('/');

    const node: TreeNode = {
      name,
      path: cleanPath,
      isDir: entry.isDir,
      children: [],
      size: entry.size,
      mtime: entry.mtime
    };

    if (entry.isDir) dirMap.set(cleanPath, node);

    if (parentPath === '') {
      root.push(node);
    } else {
      const parent = dirMap.get(parentPath);
      if (parent) {
        parent.children.push(node);
      } else {
        root.push(node);
      }
    }
  }

  return root;
}

export function todayDailyPath(now: Date = new Date()): string {
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `daily/${yyyy}-${mm}-${dd}.md`;
}

export function todayHeading(now: Date = new Date()): string {
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `# ${yyyy}-${mm}-${dd}\n\n`;
}
