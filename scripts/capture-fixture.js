import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../src/config.js';
import { parsePageRef } from '../src/pageRef.js';
import { createApifyProvider } from '../src/providers/apify.js';
import { normalizeItems } from '../src/normalize.js';
import { ProviderError } from '../src/errors.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

function keyPaths(obj, depth = 3, prefix = '') {
  if (depth < 0 || obj === null || obj === undefined) return [];
  if (Array.isArray(obj)) {
    if (!obj.length) return prefix ? [prefix + '[]'] : [];
    return keyPaths(obj[0], depth - 1, prefix ? `${prefix}[]` : '[]');
  }
  if (typeof obj !== 'object') return prefix ? [prefix] : [];
  const keys = Object.keys(obj);
  if (!keys.length) return prefix ? [prefix] : [];
  const out = [];
  for (const k of keys) {
    const path = prefix ? `${prefix}.${k}` : k;
    const v = obj[k];
    if (v !== null && typeof v === 'object') {
      const nested = keyPaths(v, depth - 1, path);
      out.push(...(nested.length ? nested : [path]));
    } else {
      out.push(path);
    }
  }
  return out;
}

function nonEmpty(v) {
  if (v === null || v === undefined) return false;
  if (typeof v === 'string') return v.trim().length > 0;
  if (typeof v === 'number') return Number.isFinite(v);
  return true;
}

function isHttps(v) {
  return typeof v === 'string' && /^https:\/\//i.test(v);
}

function truncateUrl(u, max = 60) {
  if (typeof u !== 'string') return u;
  return u.length > max ? `${u.slice(0, max)}…` : u;
}

function truncateText(t, max = 80) {
  if (typeof t !== 'string') return t;
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

function sanitizePost(post) {
  return {
    ...post,
    text: truncateText(post.text, 80),
    url: truncateUrl(post.url, 60),
    image: truncateUrl(post.image, 60),
    media: Array.isArray(post.media)
      ? post.media.map((m) => ({
        ...m,
        url: truncateUrl(m.url, 60),
        thumbnail: truncateUrl(m.thumbnail, 60),
      }))
      : post.media,
    page: post.page
      ? {
        ...post.page,
        logo: truncateUrl(post.page.logo, 60),
        logo_fallback: truncateUrl(post.page.logo_fallback, 60),
        url: truncateUrl(post.page.url, 60),
      }
      : post.page,
  };
}

function printCoverage(normalized) {
  const posts = normalized.posts || [];
  const n = posts.length;
  const row = (label, count, note = '') => {
    const flag = note ? `  ${note}` : '';
    console.log(`  ${label.padEnd(14)} ${count}/${n} posts non-empty/valid${flag}`);
  };

  const count = (fn) => posts.filter(fn).length;

  row('id', count((p) => nonEmpty(p.id)));
  row('url', count((p) => typeof p.url === 'string' && nonEmpty(p.url)));
  row('text', count((p) => typeof p.text === 'string' && nonEmpty(p.text)));
  row('created_at', count((p) => {
    if (!p.created_at) return false;
    const d = new Date(p.created_at);
    return !Number.isNaN(d.getTime()) && d.toISOString() === p.created_at;
  }));
  row('image', count((p) => typeof p.image === 'string' && nonEmpty(p.image)));
  row('stats.likes', count((p) => Number.isInteger(p.stats?.likes) && p.stats.likes >= 0));
  row('stats.comments', count((p) => Number.isInteger(p.stats?.comments) && p.stats.comments >= 0));
  row('stats.shares', count((p) => Number.isInteger(p.stats?.shares) && p.stats.shares >= 0));

  const page = normalized.page || {};
  const nameOk = nonEmpty(page.name);
  const logoOk = isHttps(page.logo);
  const logoIsFallback = page.logo === page.logo_fallback;
  console.log(`  page.name     ${nameOk ? 'OK' : 'MISSING'} (${JSON.stringify(page.name ?? null)})`);
  console.log(
    `  page.logo     ${logoOk ? 'OK' : 'MISSING'}${logoIsFallback ? '  [FLAG: equals logo_fallback — actor gave no logo]' : ''}`,
  );
}

async function main() {
  const pageUrl = process.argv[2];
  const limit = Number.parseInt(process.argv[3] || '10', 10) || 10;

  if (!pageUrl) {
    console.error('Usage: node --env-file=.env scripts/capture-fixture.js <facebook page url> [limit=10]');
    process.exit(1);
  }

  const config = loadConfig();
  if (!config.apify.token) {
    console.error('APIFY_TOKEN is missing. Set it in .env and retry.');
    process.exit(1);
  }

  const ref = parsePageRef(pageUrl);
  if (!ref) {
    console.error(`Invalid Facebook page URL: ${pageUrl}`);
    process.exit(1);
  }

  const provider = createApifyProvider(config);
  let items;
  try {
    items = await provider.fetchRaw(ref, limit);
  } catch (err) {
    const msg = err instanceof ProviderError ? err.message : (err?.message || String(err));
    console.error(`Apify fetch failed: ${msg}`);
    process.exit(1);
  }

  const fixturesDir = join(root, 'test', 'fixtures');
  await mkdir(fixturesDir, { recursive: true });
  const outPath = join(fixturesDir, `apify-${ref.key}.json`);
  await writeFile(outPath, `${JSON.stringify(items, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${items.length} raw items to ${outPath}`);

  const normalized = normalizeItems(items, ref, limit);
  console.log('\nCoverage:');
  printCoverage(normalized);

  const first = items[0];
  console.log('\nFirst raw item key paths (depth <= 3):');
  if (!first || typeof first !== 'object') {
    console.log('  (no items)');
  } else {
    for (const p of keyPaths(first, 3)) console.log(`  ${p}`);
  }

  console.log('\nFirst normalized post (truncated):');
  if (!normalized.posts.length) {
    console.log('  (none)');
  } else {
    console.log(JSON.stringify(sanitizePost(normalized.posts[0]), null, 2));
  }

  console.log(`\nRaw items: ${items.length}; normalized posts: ${normalized.posts.length}`);
}

main().catch((err) => {
  console.error(`Unexpected error: ${err?.message || String(err)}`);
  process.exit(1);
});
