// HTTP client for the BizerBrain file-api. Configure with
// `BIZERBRAIN_API_URL` (default `http://bizerbrain:8080`). The MCP server
// can live in any container, on any host, as long as it can reach the
// BizerBrain instance over HTTP — no filesystem mount required.

const API_URL = (process.env.BIZERBRAIN_API_URL || 'http://bizerbrain:8080').replace(/\/+$/, '');
const HTTP_TIMEOUT_MS = Number(process.env.BIZERBRAIN_HTTP_TIMEOUT_MS || 10000);

export function getApiUrl() {
  return API_URL;
}

async function httpCall(method, pathAndQuery, opts = {}) {
  const url = `${API_URL}${pathAndQuery}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method,
      headers: opts.contentType ? { 'content-type': opts.contentType } : undefined,
      body: opts.body,
      signal: controller.signal
    });
    const text = await res.text();
    return { status: res.status, text };
  } catch (err) {
    return { status: 0, text: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timer);
  }
}

function safeParse(text) {
  try { return JSON.parse(text); } catch { return null; }
}

function ensureMd(p) {
  return p.endsWith('.md') ? p : `${p}.md`;
}

export async function listNotes() {
  const { status, text } = await httpCall('GET', '/api/tree');
  if (status !== 200) return { ok: false, error: `http ${status}: ${text}` };
  const data = safeParse(text);
  if (!data) return { ok: false, error: 'invalid response' };
  const notes = (data.entries || [])
    .filter((e) => !e.isDir && /\.md$/i.test(e.path))
    .map((e) => e.path)
    .sort();
  return { ok: true, notes };
}

export async function searchNotes(query, limit = 50) {
  if (typeof query !== 'string' || !query) return { ok: false, error: 'query is required' };
  const cap = Math.max(1, Math.min(Number(limit) || 50, 200));
  const qs = new URLSearchParams({ query, limit: String(cap) }).toString();
  const { status, text } = await httpCall('GET', `/api/search?${qs}`);
  if (status !== 200) return { ok: false, error: `http ${status}: ${text}` };
  const data = safeParse(text);
  if (!data) return { ok: false, error: 'invalid response' };
  return { ok: true, hits: data.hits || [] };
}

export async function readNote(rawPath) {
  if (typeof rawPath !== 'string' || !rawPath) return { ok: false, error: 'path is required' };
  const target = ensureMd(rawPath);
  const qs = new URLSearchParams({ path: target }).toString();
  const { status, text } = await httpCall('GET', `/api/file?${qs}`);
  if (status === 404) return { ok: false, error: 'not_found', path: target };
  if (status !== 200) return { ok: false, error: `http ${status}: ${text}` };
  return { ok: true, path: target, content: text };
}

export async function writeNote(rawPath, content) {
  if (typeof rawPath !== 'string' || !rawPath) return { ok: false, error: 'path is required' };
  if (typeof content !== 'string') return { ok: false, error: 'content must be a string' };
  const target = ensureMd(rawPath);
  const qs = new URLSearchParams({ path: target }).toString();
  const { status, text } = await httpCall('PUT', `/api/file?${qs}`, {
    body: content,
    contentType: 'text/markdown'
  });
  if (status !== 200) return { ok: false, error: `http ${status}: ${text}` };
  const data = safeParse(text) || {};
  return { ok: true, path: target, bytes: data.size ?? Buffer.byteLength(content, 'utf8') };
}
