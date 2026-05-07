import { promises as fs } from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { relativeToBrain } from '../paths.js';

async function walk(dir, results) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return;
    throw err;
  }
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push({ path: relativeToBrain(full) + '/', isDir: true });
      await walk(full, results);
    } else if (entry.isFile()) {
      const stat = await fs.stat(full);
      results.push({
        path: relativeToBrain(full),
        size: stat.size,
        mtime: stat.mtimeMs,
        isDir: false
      });
    }
  }
}

export default async function treeRoutes(fastify) {
  fastify.get('/api/tree', async () => {
    const results = [];
    await walk(config.brainDir, results);
    return { entries: results };
  });
}
