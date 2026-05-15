import { promises as fs } from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { relativeToBrain } from '../paths.js';

const SNIPPET_MAX = 200;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function searchUnder(dir, pattern, limit, results) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return;
    throw err;
  }
  for (const entry of entries) {
    if (results.length >= limit) return;
    if (entry.isSymbolicLink()) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await searchUnder(full, pattern, limit, results);
      continue;
    }
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.md')) continue;
    let text;
    try {
      text = await fs.readFile(full, 'utf8');
    } catch {
      continue;
    }
    const rel = relativeToBrain(full);
    if (pattern.test(rel) || pattern.test(text)) {
      let snippet = '';
      for (const line of text.split('\n')) {
        if (pattern.test(line)) {
          snippet = line.trim().slice(0, SNIPPET_MAX);
          break;
        }
      }
      results.push({ path: rel, snippet });
    }
  }
}

export default async function searchRoutes(fastify) {
  fastify.get('/api/search', async (request, reply) => {
    const query = request.query.query;
    if (!query) {
      return reply.code(400).send({ error: 'missing-query' });
    }
    const requested = Number(request.query.limit) || DEFAULT_LIMIT;
    const limit = Math.max(1, Math.min(requested, MAX_LIMIT));
    const pattern = new RegExp(escapeRegex(String(query)), 'i');
    const hits = [];
    await searchUnder(config.brainDir, pattern, limit, hits);
    return { hits };
  });
}
