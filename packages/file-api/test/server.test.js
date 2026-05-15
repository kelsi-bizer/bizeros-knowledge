import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';

const tmpBrain = await fs.mkdtemp(path.join(os.tmpdir(), 'brain-srv-'));
process.env.BRAIN_DIR = tmpBrain;
process.env.LOG_LEVEL = 'silent';

const { buildServer } = await import('../src/server.js');

let server;

before(async () => {
  server = await buildServer();
});

after(async () => {
  await server.close();
});

test('health responds', async () => {
  const res = await server.inject({ method: 'GET', url: '/api/health' });
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.ok, true);
  assert.equal(body.brainDir, tmpBrain);
});

test('PUT then GET roundtrips text content', async () => {
  const put = await server.inject({
    method: 'PUT',
    url: '/api/file?path=pages/Hello.md',
    payload: '# hello world',
    headers: { 'content-type': 'text/markdown' }
  });
  assert.equal(put.statusCode, 200);
  const putBody = JSON.parse(put.body);
  assert.equal(putBody.ok, true);
  assert.ok(typeof putBody.mtime === 'number');

  const get = await server.inject({ method: 'GET', url: '/api/file?path=pages/Hello.md' });
  assert.equal(get.statusCode, 200);
  assert.equal(get.body, '# hello world');
  assert.ok(get.headers['x-mtime']);
});

test('PUT creates parent directories', async () => {
  const put = await server.inject({
    method: 'PUT',
    url: '/api/file?path=journals/2026/05/04.md',
    payload: 'today',
    headers: { 'content-type': 'text/markdown' }
  });
  assert.equal(put.statusCode, 200);
  const stat = await fs.stat(path.join(tmpBrain, 'journals/2026/05'));
  assert.ok(stat.isDirectory());
});

test('GET missing returns 404', async () => {
  const res = await server.inject({ method: 'GET', url: '/api/file?path=pages/nope.md' });
  assert.equal(res.statusCode, 404);
});

test('PUT rejects path traversal', async () => {
  const res = await server.inject({
    method: 'PUT',
    url: '/api/file?path=../etc/passwd.md',
    payload: 'pwned',
    headers: { 'content-type': 'text/markdown' }
  });
  assert.equal(res.statusCode, 400);
});

test('PUT rejects bad extension', async () => {
  const res = await server.inject({
    method: 'PUT',
    url: '/api/file?path=evil.exe',
    payload: 'x',
    headers: { 'content-type': 'application/octet-stream' }
  });
  assert.equal(res.statusCode, 400);
});

test('tree lists files', async () => {
  const res = await server.inject({ method: 'GET', url: '/api/tree' });
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  const paths = body.entries.map((e) => e.path);
  assert.ok(paths.includes('pages/Hello.md'));
  assert.ok(paths.includes('journals/2026/05/04.md'));
  assert.ok(paths.includes('pages/'));
});

test('move renames file', async () => {
  const res = await server.inject({
    method: 'POST',
    url: '/api/move',
    payload: { from: 'pages/Hello.md', to: 'pages/Renamed.md' },
    headers: { 'content-type': 'application/json' }
  });
  assert.equal(res.statusCode, 200);

  const get = await server.inject({ method: 'GET', url: '/api/file?path=pages/Renamed.md' });
  assert.equal(get.statusCode, 200);
});

test('move rejects bad extension on target', async () => {
  const res = await server.inject({
    method: 'POST',
    url: '/api/move',
    payload: { from: 'pages/Renamed.md', to: 'pages/Renamed.exe' },
    headers: { 'content-type': 'application/json' }
  });
  assert.equal(res.statusCode, 400);
});

test('delete removes file', async () => {
  const del = await server.inject({ method: 'DELETE', url: '/api/file?path=pages/Renamed.md' });
  assert.equal(del.statusCode, 200);

  const get = await server.inject({ method: 'GET', url: '/api/file?path=pages/Renamed.md' });
  assert.equal(get.statusCode, 404);
});

test('delete missing returns 404', async () => {
  const res = await server.inject({ method: 'DELETE', url: '/api/file?path=pages/nope.md' });
  assert.equal(res.statusCode, 404);
});

test('search finds path and content matches', async () => {
  await server.inject({
    method: 'PUT',
    url: '/api/file?path=pages/Search%20Target.md',
    payload: 'A line about widgets.\nAnother line.\n',
    headers: { 'content-type': 'text/markdown' }
  });

  const res = await server.inject({ method: 'GET', url: '/api/search?query=widgets' });
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.ok(Array.isArray(body.hits));
  const hit = body.hits.find((h) => h.path === 'pages/Search Target.md');
  assert.ok(hit, 'expected pages/Search Target.md in hits');
  assert.match(hit.snippet, /widgets/i);
});

test('search rejects missing query', async () => {
  const res = await server.inject({ method: 'GET', url: '/api/search' });
  assert.equal(res.statusCode, 400);
});

test('search respects limit', async () => {
  const res = await server.inject({ method: 'GET', url: '/api/search?query=.&limit=1' });
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.ok(body.hits.length <= 1);
});
