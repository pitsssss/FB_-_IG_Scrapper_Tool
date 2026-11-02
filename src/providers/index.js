import { createApifyProvider } from './apify.js';
import { createGraphProvider } from './graph.js';

const FACTORIES = { apify: createApifyProvider, graph: createGraphProvider };

export function buildProviders(config) {
  return config.providers.map((name) => {
    if (!FACTORIES[name]) throw new Error(`Unknown provider "${name}". Supported: ${Object.keys(FACTORIES).join(', ')}`);
    return FACTORIES[name](config);
  });
}
