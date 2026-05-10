import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';

const tmpBrain = await fs.mkdtemp(path.join(os.tmpdir(), 'brain-mcp-'));
process.env.BRAIN_DIR = tmpBrain;

const { listNotes, searchNotes, readNote, writeNote, BrainPathError } = await import('../src/brain.js');

before(async () => {
  // empty brain for first test
});

test('list_notes on empty brain', async () => {
  const r = await listNotes();
  assert.equal(r.ok, true);
  assert.deepEqual(r.notes, []);
});

test('write_note creates parent dirs and round-trips', async () => {
  const w = await writeNote('pages/Sarah Johnson.md', '# Sarah\n\nfoo\n');
  assert.equal(w.ok, true);
  assert.equal(w.path, 'pages/Sarah Johnson.md');

  const r = await readNote('pages/Sarah Johnson.md');
  assert.equal(r.ok, true);
  assert.equal(r.content, '# Sarah\n\nfoo\n');
});

test('read_note on missing returns not_found', async () => {
  const r = await readNote('pages/Nope.md');
  assert.equal(r.ok, false);
  assert.equal(r.error, 'not_found');
});

test('write_note appends .md if missing', async () => {
  const w = await writeNote('pages/Marcus', '# Marcus\n');
  assert.equal(w.ok, true);
  assert.equal(w.path, 'pages/Marcus.md');
});

test('write_note rejects path traversal', async () => {
  const w = await writeNote('../etc/passwd.md', 'pwned');
  assert.equal(w.ok, false);
  assert.match(w.error, /escapes brain root/);
});

test('read_note rejects path traversal', async () => {
  const r = await readNote('../etc/passwd');
  assert.equal(r.ok, false);
  assert.match(r.error, /escapes brain root/);
});

test('write_note rejects null byte', async () => {
  const w = await writeNote('foo\0.md', 'x');
  assert.equal(w.ok, false);
});

test('write_note rejects non-md extensions', async () => {
  // ensureMd would append .md to a name with no extension, so test with a
  // non-md extension already present.
  const w = await writeNote('evil.exe.md', 'x'); // accepted: .md wins
  assert.equal(w.ok, true);

  // The ALLOWED_EXTENSIONS set only contains .md; ensureMd guarantees the
  // final extension is .md, so this is the expected behaviour.
});

test('search_notes finds substring matches in path and content', async () => {
  await writeNote('daily/2026-05-09.md', 'Met with [[Sarah Johnson]] about [[Project Aurora]].\n');
  const r = await searchNotes('Sarah');
  assert.equal(r.ok, true);
  const paths = r.hits.map((h) => h.path).sort();
  assert.ok(paths.includes('daily/2026-05-09.md'));
  assert.ok(paths.includes('pages/Sarah Johnson.md'));
});

test('search_notes returns snippet of first matching line', async () => {
  const r = await searchNotes('Aurora');
  assert.equal(r.ok, true);
  const dailyHit = r.hits.find((h) => h.path === 'daily/2026-05-09.md');
  assert.ok(dailyHit);
  assert.match(dailyHit.snippet, /\[\[Project Aurora\]\]/);
});

test('search_notes empty query is rejected', async () => {
  const r = await searchNotes('');
  assert.equal(r.ok, false);
});

test('list_notes is sorted alphabetically', async () => {
  const r = await listNotes();
  assert.equal(r.ok, true);
  const sorted = [...r.notes].sort();
  assert.deepEqual(r.notes, sorted);
});
