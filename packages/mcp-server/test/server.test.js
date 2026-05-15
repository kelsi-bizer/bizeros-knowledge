import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';

const tmpBrain = await fs.mkdtemp(path.join(os.tmpdir(), 'brain-mcp-srv-'));
process.env.BRAIN_DIR = tmpBrain;
process.env.LOG_LEVEL = 'silent';

const fileApiModulePath = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  '../../file-api/src/server.js'
);
const { buildServer: buildFileApi } = await import(fileApiModulePath);

// Bring up the file-api FIRST so the MCP server's brain.js captures the
// right BIZERBRAIN_API_URL at module-load time.
const fileApi = await buildFileApi();
await fileApi.listen({ host: '127.0.0.1', port: 0 });
const address = fileApi.server.address();
process.env.BIZERBRAIN_API_URL = `http://127.0.0.1:${address.port}`;

const {
  ListToolsRequestSchema,
  CallToolRequestSchema
} = await import('@modelcontextprotocol/sdk/types.js');
const { buildServer } = await import('../src/server.js');
const server = buildServer();

after(async () => {
  if (fileApi) await fileApi.close();
});

async function call(schema, params) {
  const method = schema.shape.method.value;
  const handler = server._requestHandlers.get(method);
  assert.ok(handler, `no handler for ${method}`);
  return handler({ method, params });
}

function parseResult(result) {
  assert.ok(Array.isArray(result.content));
  assert.equal(result.content[0].type, 'text');
  return JSON.parse(result.content[0].text);
}

test('list_tools returns the four brain tools', async () => {
  const result = await call(ListToolsRequestSchema, {});
  const names = result.tools.map((t) => t.name).sort();
  assert.deepEqual(names, ['list_notes', 'read_note', 'search_notes', 'write_note']);
  for (const tool of result.tools) {
    assert.ok(tool.description.length > 0);
    assert.equal(tool.inputSchema.type, 'object');
  }
});

test('call_tool list_notes returns empty array on empty brain', async () => {
  const result = await call(CallToolRequestSchema, {
    name: 'list_notes',
    arguments: {}
  });
  const body = parseResult(result);
  assert.equal(body.ok, true);
  assert.deepEqual(body.notes, []);
});

test('call_tool write_note + read_note round-trip', async () => {
  const writeResult = await call(CallToolRequestSchema, {
    name: 'write_note',
    arguments: { path: 'pages/Sarah.md', content: '# Sarah\n\nLead engineer.\n' }
  });
  const writeBody = parseResult(writeResult);
  assert.equal(writeBody.ok, true);

  const readResult = await call(CallToolRequestSchema, {
    name: 'read_note',
    arguments: { path: 'pages/Sarah.md' }
  });
  const readBody = parseResult(readResult);
  assert.equal(readBody.ok, true);
  assert.match(readBody.content, /Lead engineer/);
});

test('call_tool search_notes finds the note', async () => {
  const result = await call(CallToolRequestSchema, {
    name: 'search_notes',
    arguments: { query: 'Lead engineer' }
  });
  const body = parseResult(result);
  assert.equal(body.ok, true);
  assert.ok(body.hits.some((h) => h.path === 'pages/Sarah.md'));
});

test('call_tool unknown tool name returns ok=false', async () => {
  const result = await call(CallToolRequestSchema, {
    name: 'bogus_tool',
    arguments: {}
  });
  const body = parseResult(result);
  assert.equal(body.ok, false);
  assert.match(body.error, /unknown tool/);
});

test('call_tool write_note path traversal rejected at server', async () => {
  const result = await call(CallToolRequestSchema, {
    name: 'write_note',
    arguments: { path: '../etc/passwd.md', content: 'x' }
  });
  const body = parseResult(result);
  assert.equal(body.ok, false);
  assert.match(body.error, /http 400/);
});
