import chokidar from 'chokidar';
import { config } from '../config.js';
import { relativeToBrain } from '../paths.js';

let watcher = null;
const subscribers = new Set();

function ensureWatcher() {
  if (watcher) return;
  watcher = chokidar.watch(config.brainDir, {
    ignored: (p) => p.includes('.tmp.'),
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 100 }
  });
  const emit = (type) => (p) => {
    const payload = JSON.stringify({ type, path: relativeToBrain(p), at: Date.now() });
    for (const send of subscribers) send(payload);
  };
  watcher.on('add', emit('created'));
  watcher.on('change', emit('modified'));
  watcher.on('unlink', emit('deleted'));
}

export async function closeWatcher() {
  if (watcher) {
    await watcher.close();
    watcher = null;
  }
}

export default async function watchRoutes(fastify) {
  fastify.get('/api/watch', (request, reply) => {
    ensureWatcher();
    reply.raw.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      'connection': 'keep-alive'
    });
    reply.raw.write(': connected\n\n');
    const send = (data) => reply.raw.write(`data: ${data}\n\n`);
    subscribers.add(send);
    const heartbeat = setInterval(() => reply.raw.write(': hb\n\n'), 30000);
    request.raw.on('close', () => {
      clearInterval(heartbeat);
      subscribers.delete(send);
    });
  });
}
