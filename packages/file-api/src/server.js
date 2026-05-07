import Fastify from 'fastify';
import { config } from './config.js';
import treeRoutes from './routes/tree.js';
import fileRoutes from './routes/file.js';
import moveRoutes from './routes/move.js';
import watchRoutes, { closeWatcher } from './routes/watch.js';

export async function buildServer() {
  const fastify = Fastify({
    bodyLimit: config.maxBodyBytes,
    logger: { level: process.env.LOG_LEVEL || 'info' }
  });

  fastify.addContentTypeParser(
    'application/octet-stream',
    { parseAs: 'buffer' },
    (_req, body, done) => done(null, body)
  );
  fastify.addContentTypeParser(
    /^text\/.*/,
    { parseAs: 'buffer' },
    (_req, body, done) => done(null, body)
  );

  fastify.get('/api/health', async () => ({ ok: true, brainDir: config.brainDir }));

  await fastify.register(treeRoutes);
  await fastify.register(fileRoutes);
  await fastify.register(moveRoutes);
  await fastify.register(watchRoutes);

  fastify.addHook('onClose', async () => {
    await closeWatcher();
  });

  return fastify;
}

const isDirectRun = import.meta.url === `file://${process.argv[1]}`;
if (isDirectRun) {
  const server = await buildServer();
  await server.listen({ host: config.host, port: config.port });
  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, async () => {
      await server.close();
      process.exit(0);
    });
  }
}
