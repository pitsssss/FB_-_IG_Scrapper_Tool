/**
 * One-shot helper: derive a sanitized committed fixture from a local live capture.
 * Does not call Apify. Reads .postman-local/instagram-capture only.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const captureDir = join(root, '.postman-local', 'instagram-capture');
const outFile = join(root, 'test', 'fixtures', 'instagram-nasa-basicdata.json');

function scrubUrl(u) {
  if (typeof u !== 'string') return u;
  if (/instagram\.com\/(p|reel)\//i.test(u)) return u;
  if (/^https?:\/\//i.test(u)) {
    const h = createHash('sha1').update(u).digest('hex').slice(0, 12);
    return `https://cdn.example.invalid/ig/${h}.bin`;
  }
  return u;
}

function scrubItem(it) {
  if (!it || typeof it !== 'object') return it;
  const o = { ...it };
  for (const k of Object.keys(o)) {
    if (typeof o[k] === 'string') {
      if (/^https?:\/\//i.test(o[k])) o[k] = scrubUrl(o[k]);
      else if (k === 'caption' && o[k].length > 160) o[k] = `${o[k].slice(0, 160)}…`;
    }
  }
  if (Array.isArray(o.childPosts)) o.childPosts = o.childPosts.map(scrubItem);
  if (Array.isArray(o.images)) o.images = o.images.map((x) => (typeof x === 'string' ? scrubUrl(x) : x));
  delete o.hashtags;
  return o;
}

const pointer = JSON.parse(await readFile(join(captureDir, 'latest-pointer.json'), 'utf8'));
const raw = JSON.parse(await readFile(join(captureDir, `raw-items-${pointer.stamp}.json`), 'utf8'));
const items = raw.map(scrubItem);

await mkdir(dirname(outFile), { recursive: true });
await writeFile(
  outFile,
  `${JSON.stringify(
    {
      _meta: {
        source:
          'Derived from one controlled live Apify instagram-post-scraper run (basicData) for nasa.',
        note: 'CDN URLs scrubbed. Captions truncated. Not a full raw dump. Do not treat as live proof.',
        actor: 'apify/instagram-post-scraper',
        dataDetailLevel: 'basicData',
        skipPinnedPosts: true,
        capturedUtcDate: '2026-11-03',
        limitations:
          'basicData did not include ownerProfilePicUrl or childPosts for Sidecar; logo uses documented fallback.',
      },
      items,
    },
    null,
    2,
  )}\n`,
  'utf8',
);
console.log(`Wrote ${outFile} items=${items.length}`);
