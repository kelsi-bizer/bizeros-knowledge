import { promises as fs } from 'node:fs';
import path from 'node:path';
import { resolveSafe, checkExtension } from '../paths.js';

function badRequest(reply, err) {
  return reply.code(400).send({ error: err.code, message: err.message });
}

export default async function fileRoutes(fastify) {
  fastify.get('/api/file', async (request, reply) => {
    const rawPath = request.query.path;
    let absolute;
    try {
      absolute = resolveSafe(rawPath);
      checkExtension(rawPath);
    } catch (err) {
      return badRequest(reply, err);
    }
    try {
      const stat = await fs.stat(absolute);
      if (!stat.isFile()) {
        return reply.code(404).send({ error: 'not-a-file' });
      }
      const buf = await fs.readFile(absolute);
      reply
        .header('content-type', 'application/octet-stream')
        .header('x-mtime', String(stat.mtimeMs))
        .header('x-size', String(stat.size));
      return reply.send(buf);
    } catch (err) {
      if (err.code === 'ENOENT') return reply.code(404).send({ error: 'not-found' });
      throw err;
    }
  });

  fastify.put('/api/file', async (request, reply) => {
    const rawPath = request.query.path;
    let absolute;
    try {
      absolute = resolveSafe(rawPath);
      checkExtension(rawPath);
    } catch (err) {
      return badRequest(reply, err);
    }
    const body = request.body;
    if (body == null) {
      return reply.code(400).send({ error: 'invalid-body' });
    }
    const buf = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
    await fs.mkdir(path.dirname(absolute), { recursive: true });
    const tmp = `${absolute}.tmp.${process.pid}.${Date.now()}`;
    await fs.writeFile(tmp, buf);
    await fs.rename(tmp, absolute);
    const stat = await fs.stat(absolute);
    return { ok: true, mtime: stat.mtimeMs, size: stat.size };
  });

  fastify.delete('/api/file', async (request, reply) => {
    const rawPath = request.query.path;
    let absolute;
    try {
      absolute = resolveSafe(rawPath);
    } catch (err) {
      return badRequest(reply, err);
    }
    try {
      await fs.unlink(absolute);
      return { ok: true };
    } catch (err) {
      if (err.code === 'ENOENT') return reply.code(404).send({ error: 'not-found' });
      throw err;
    }
  });
}
