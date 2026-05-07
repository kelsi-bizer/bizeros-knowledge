import path from 'node:path';
import { config } from './config.js';

export class PathError extends Error {
  constructor(message, code = 'invalid-path') {
    super(message);
    this.code = code;
  }
}

export function resolveSafe(rawPath) {
  if (typeof rawPath !== 'string' || rawPath.length === 0) {
    throw new PathError('path is required');
  }
  if (rawPath.includes('\0')) {
    throw new PathError('path contains null byte');
  }
  const stripped = rawPath.replace(/^\/+/, '');
  const normalized = path.posix.normalize(stripped);
  if (normalized === '..' || normalized.startsWith('../')) {
    throw new PathError('path escapes brain root');
  }
  const absolute = path.resolve(config.brainDir, normalized);
  const rel = path.relative(config.brainDir, absolute);
  if (rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel)) {
    throw new PathError('path escapes brain root');
  }
  return absolute;
}

export function checkExtension(rawPath) {
  const ext = path.extname(rawPath).toLowerCase();
  if (!config.allowedExtensions.has(ext)) {
    throw new PathError(`extension not allowed: ${ext || '(none)'}`, 'extension-not-allowed');
  }
}

export function relativeToBrain(absolute) {
  return path.relative(config.brainDir, absolute).split(path.sep).join('/');
}
