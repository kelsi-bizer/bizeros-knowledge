import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';

const tmpBrain = await fs.mkdtemp(path.join(os.tmpdir(), 'brain-paths-'));
process.env.BRAIN_DIR = tmpBrain;

const { resolveSafe, checkExtension, PathError, relativeToBrain } = await import('../src/paths.js');

test('resolveSafe accepts relative paths', () => {
  assert.equal(resolveSafe('pages/foo.md'), path.join(tmpBrain, 'pages/foo.md'));
});

test('resolveSafe accepts paths with leading slash', () => {
  assert.equal(resolveSafe('/pages/foo.md'), path.join(tmpBrain, 'pages/foo.md'));
});

test('resolveSafe normalizes inner segments', () => {
  assert.equal(resolveSafe('a/b/../c.md'), path.join(tmpBrain, 'a/c.md'));
});

test('resolveSafe rejects traversal', () => {
  assert.throws(() => resolveSafe('../etc/passwd'), PathError);
  assert.throws(() => resolveSafe('pages/../../etc/passwd'), PathError);
  assert.throws(() => resolveSafe('..'), PathError);
});

test('resolveSafe rejects null byte', () => {
  assert.throws(() => resolveSafe('foo\0.md'), PathError);
});

test('resolveSafe rejects empty', () => {
  assert.throws(() => resolveSafe(''), PathError);
  assert.throws(() => resolveSafe(undefined), PathError);
  assert.throws(() => resolveSafe(null), PathError);
});

test('checkExtension allowlist (case-insensitive)', () => {
  assert.doesNotThrow(() => checkExtension('foo.md'));
  assert.doesNotThrow(() => checkExtension('foo.PNG'));
  assert.doesNotThrow(() => checkExtension('Pages/Bar.JPG'));
});

test('checkExtension rejects disallowed', () => {
  assert.throws(() => checkExtension('foo.exe'), PathError);
  assert.throws(() => checkExtension('script.sh'), PathError);
  assert.throws(() => checkExtension('no-extension'), PathError);
});

test('relativeToBrain produces forward slashes', () => {
  const abs = path.join(tmpBrain, 'pages', 'foo.md');
  assert.equal(relativeToBrain(abs), 'pages/foo.md');
});
