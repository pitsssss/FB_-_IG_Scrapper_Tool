import { loadConfig } from './config.js';
import { createApp } from './server.js';

const config = loadConfig();
const server = createApp(config);

server.listen(config.port, config.host, () => {
  console.log(`fb-posts-api listening on http://${config.host}:${config.port}`);
  console.log(`providers: ${config.providers.join(' -> ')} | fresh TTL: ${config.freshTtlMs / 1000}s | cache dir: ${config.cacheDir}`);
  if (!config.apify.token && !Object.keys(config.graph.tokens).length) {
    console.warn('WARNING: neither APIFY_TOKEN nor GRAPH_PAGE_TOKENS is set - only cached pages can be served.');
  }
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => server.close(() => process.exit(0)));
}
process.on('unhandledRejection', (err) => console.error('[unhandledRejection]', err));
