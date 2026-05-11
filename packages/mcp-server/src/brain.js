// Filesystem operations against $BRAIN_DIR (default /srv/bizerbrain/brain).
// Mirrors .agents/skills/bizerbrain/tools/brain_tools.py in JavaScript so the
// MCP server can talk to the brain directly without going through the file-api
// over HTTP.

import { promises as fs } from 'node:fs';
import path from 'node:path';

const BRAIN_DIR = path.resolve(process.env.BRAIN_DIR || '/srv/bizerbrain/brain');
const ALLOWED_EXTENSIONS = new Set(['.md']);

export class BrainPathError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BrainPathError';
  }
}

export function getBrainDir() {
  return BRAIN_DIR;
}

function safePath(rel) {
  if (typeof rel !== 'string' || rel.length === 0) {
    throw new BrainPathError('path is required');
  }
  if (rel.includes('\0')) {
    throw new BrainPathError('path contains null byte');
  }
  const stripped = rel.replace(/^\/+/, '');
  const candidate = path.resolve(BRAIN_DIR, stripped);
  const rel2 = path.relative(BRAIN_DIR, candidate);
  if (rel2 === '..' || rel2.startsWith('..' + path.sep) || path.isAbsolute(rel2)) {
    throw new BrainPathError(`path escapes brain root: ${rel}`);
  }
  return candidate;
}

function ensureMd(p) {
  return p.endsWith('.md') ? p : `${p}.md`;
}

async function walkMd(dir, out) {
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
      await walkMd(full, out);
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
      out.push(path.relative(BRAIN_DIR, full).split(path.sep).join('/'));
    }
  }
}

export async function listNotes() {
  const notes = [];
  await walkMd(BRAIN_DIR, notes);
  notes.sort();
  return { ok: true, notes };
}

export async function searchNotes(query, limit = 50) {
  if (typeof query !== 'string' || query.length === 0) {
    return { ok: false, error: 'query is required' };
  }
  const cap = Math.max(1, Math.min(Number(limit) || 50, 200));
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(escaped, 'i');
  const hits = [];

  async function walk(dir) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (err) {
      if (err.code === 'ENOENT') return;
      throw err;
    }
    for (const entry of entries) {
      if (hits.length >= cap) return;
      if (entry.isSymbolicLink()) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
        continue;
      }
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.md')) continue;
      const rel = path.relative(BRAIN_DIR, full).split(path.sep).join('/');
      let text;
      try {
        text = await fs.readFile(full, 'utf8');
      } catch {
        continue;
      }
      if (pattern.test(rel) || pattern.test(text)) {
        let snippet = '';
        for (const line of text.split('\n')) {
          if (pattern.test(line)) {
            snippet = line.trim().slice(0, 200);
            break;
          }
        }
        hits.push({ path: rel, snippet });
      }
    }
  }

  await walk(BRAIN_DIR);
  return { ok: true, hits };
}

export async function readNote(rel) {
  let full;
  try {
    full = safePath(ensureMd(rel));
  } catch (err) {
    return { ok: false, error: err.message };
  }
  try {
    const stat = await fs.stat(full);
    if (!stat.isFile()) return { ok: false, error: 'not_found', path: rel };
    const content = await fs.readFile(full, 'utf8');
    return { ok: true, path: rel, content };
  } catch (err) {
    if (err.code === 'ENOENT') return { ok: false, error: 'not_found', path: rel };
    return { ok: false, error: `read failed: ${err.message}` };
  }
}

export async function writeNote(rel, content) {
  if (typeof content !== 'string') {
    return { ok: false, error: 'content must be a string' };
  }
  const finalPath = ensureMd(rel);
  let full;
  try {
    full = safePath(finalPath);
  } catch (err) {
    return { ok: false, error: err.message };
  }
  const ext = path.extname(full).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return { ok: false, error: `extension not allowed: ${ext}` };
  }
  await fs.mkdir(path.dirname(full), { recursive: true });
  const tmp = `${full}.tmp.${process.pid}.${Date.now()}`;
  try {
    await fs.writeFile(tmp, content, 'utf8');
    await fs.rename(tmp, full);
  } catch (err) {
    try {
      await fs.unlink(tmp);
    } catch {
      // tmp may not exist; ignore
    }
    return { ok: false, error: `write failed: ${err.message}` };
  }
  return { ok: true, path: finalPath, bytes: Buffer.byteLength(content, 'utf8') };
}
