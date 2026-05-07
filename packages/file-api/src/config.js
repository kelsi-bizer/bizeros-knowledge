import path from 'node:path';

const DEFAULT_EXTENSIONS = [
  '.md', '.markdown',
  '.edn', '.json', '.txt', '.org',
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg',
  '.pdf'
];

export const config = {
  brainDir: path.resolve(process.env.BRAIN_DIR || '/brain'),
  host: process.env.HOST || '127.0.0.1',
  port: Number(process.env.PORT || 3000),
  maxBodyBytes: Number(process.env.MAX_BODY_BYTES || 25 * 1024 * 1024),
  allowedExtensions: new Set(
    (process.env.ALLOWED_EXTENSIONS
      ? process.env.ALLOWED_EXTENSIONS.split(',')
      : DEFAULT_EXTENSIONS
    ).map((e) => e.trim().toLowerCase())
  )
};
