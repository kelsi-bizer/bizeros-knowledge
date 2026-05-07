import { promises as fs } from 'node:fs';
import path from 'node:path';
import { resolveSafe, checkExtension } from '../paths.js';

export default async function moveRoutes(fastify) {
  fastify.post('/api/move', async (request, reply) => {
    const body = request.body || {};
    const from = typeof body === 'object' && !Buffer.isBuffer(body) ? body.from : null;
    const to = typeof body === 'object' && !Buffer.isBuffer(body) ? body.to : null;
    if (!from || !to) {
      return reply.code(400).send({ error: 'missing-from-or-to' });
    }
    let fromAbs, toAbs;
    try {
      fromAbs = resolveSafe(from);
      toAbs = resolveSafe(to);
      checkExtension(to);
    } catch (err) {
      return reply.code(400).send({ error: err.code, message: err.message });
    }
    await fs.mkdir(path.dirname(toAbs), { recursive: true });
    try {
      await fs.rename(fromAbs, toAbs);
      return { ok: true };
    } catch (err) {
      if (err.code === 'ENOENT') return reply.code(404).send({ error: 'not-found' });
      throw err;
    }
  });
}
