import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';

const tmpBrain = await fs.mkdtemp(path.join(os.tmpdir(), 'brain-mcp-'));
process.env.BRAIN_DIR = tmpBrain;
process.env.LOG_LEVEL = 'silent';

// Spin up a real file-api on an ephemeral port. The mcp-server's brain.js
// is HTTP-only; pointing BIZERBRAIN_API_URL at this instance gives us a
// faithful integration test.
const fileApiModulePath = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  '../../file-api/src/server.js'
);
const { buildServer } = await import(fileApiModulePath);

let fileApi;
let baseUrl;
let brain;

before(async () => {
  fileApi = await buildServer();
  await fileApi.listen({ host: '127.0.0.1', port: 0 });
  const address = fileApi.server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
  process.env.BIZERBRAIN_API_URL = baseUrl;
  brain = await import('../src/brain.js');
});

after(async () => {
  if (fileApi) await fileApi.close();
});

test('getApiUrl returns the configured URL', () => {
  assert.equal(brain.getApiUrl(), baseUrl);
});

test('list_notes on empty brain', async () => {
  const r = await brain.listNotes();
  assert.equal(r.ok, true);
  assert.deepEqual(r.notes, []);
});

test('write_note creates parent dirs and round-trips', async () => {
  const w = await brain.writeNote('pages/Sarah Johnson.md', '# Sarah\n\nfoo\n');
  assert.equal(w.ok, true);
  assert.equal(w.path, 'pages/Sarah Johnson.md');

  const r = await brain.readNote('pages/Sarah Johnson.md');
  assert.equal(r.ok, true);
  assert.equal(r.content, '# Sarah\n\nfoo\n');
});

test('read_note on missing returns not_found', async () => {
  const r = await brain.readNote('pages/Nope.md');
  assert.equal(r.ok, false);
  assert.equal(r.error, 'not_found');
});

test('write_note appends .md if missing', async () => {
  const w = await brain.writeNote('pages/Marcus', '# Marcus\n');
  assert.equal(w.ok, true);
  assert.equal(w.path, 'pages/Marcus.md');
});

test('write_note rejects path traversal (server-side enforcement)', async () => {
  const w = await brain.writeNote('../etc/passwd.md', 'pwned');
  assert.equal(w.ok, false);
  assert.match(w.error, /http 400/);
});

test('read_note rejects path traversal (server-side enforcement)', async () => {
  const r = await brain.readNote('../etc/passwd');
  assert.equal(r.ok, false);
  assert.match(r.error, /http 400/);
});

test('search_notes finds substring matches', async () => {
  await brain.writeNote(
    'daily/2026-05-09.md',
    'Met with [[Sarah Johnson]] about [[Project Aurora]].\n'
  );
  const r = await brain.searchNotes('Sarah');
  assert.equal(r.ok, true);
  const paths = r.hits.map((h) => h.path).sort();
  assert.ok(paths.includes('daily/2026-05-09.md'));
  assert.ok(paths.includes('pages/Sarah Johnson.md'));
});

test('search_notes returns snippet of first matching line', async () => {
  const r = await brain.searchNotes('Aurora');
  assert.equal(r.ok, true);
  const dailyHit = r.hits.find((h) => h.path === 'daily/2026-05-09.md');
  assert.ok(dailyHit);
  assert.match(dailyHit.snippet, /\[\[Project Aurora\]\]/);
});

test('search_notes empty query is rejected by client guard', async () => {
  const r = await brain.searchNotes('');
  assert.equal(r.ok, false);
});

test('list_notes is sorted alphabetically', async () => {
  const r = await brain.listNotes();
  assert.equal(r.ok, true);
  const sorted = [...r.notes].sort();
  assert.deepEqual(r.notes, sorted);
});

test('http failure surfaces clearly when API is unreachable', async () => {
  // Point the client at a closed port; any call should return ok=false.
  const original = process.env.BIZERBRAIN_API_URL;
  process.env.BIZERBRAIN_API_URL = 'http://127.0.0.1:1';
  // Re-import via a cache-busting query string to pick up the new env.
  const modUrl = new URL('../src/brain.js', import.meta.url).href + `?cb=${Date.now()}`;
  const isolated = await import(modUrl);
  const r = await isolated.listNotes();
  assert.equal(r.ok, false);
  assert.match(r.error, /http 0/);
  process.env.BIZERBRAIN_API_URL = original;
});
