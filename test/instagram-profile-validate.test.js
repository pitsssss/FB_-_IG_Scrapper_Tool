import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { resolveProfileChargeCap } from '../scripts/instagram-profile-validate.js';
import { createInstagramIdentity } from '../src/instagramIdentity.js';
import { createApifyQuota } from '../src/apifyQuota.js';
import { parseInstagramRef } from '../src/instagramRef.js';
import { INSTAGRAM_LOGO_FALLBACK } from '../src/instagramNormalize.js';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const validateScript = join(root, 'scripts', 'instagram-profile-validate.js');

describe('instagram-profile-validate helpers', () => {
  it('enforces USD charge ceiling of 0.15 while respecting lower caps', () => {
    assert.equal(resolveProfileChargeCap({}), '0.15');
    assert.equal(resolveProfileChargeCap({ APIFY_MAX_CHARGE_USD_PER_RUN: '0.05' }), '0.05');
    assert.equal(resolveProfileChargeCap({ APIFY_MAX_CHARGE_USD_PER_RUN: '0.15' }), '0.15');
    assert.equal(resolveProfileChargeCap({ APIFY_MAX_CHARGE_USD_PER_RUN: '0.99' }), '0.15');
  });

  it('refuses --execute-paid without --confirm-cost (no Apify call)', () => {
    const r = spawnSync(process.execPath, [validateScript, '--execute-paid'], {
      cwd: root,
      encoding: 'utf8',
    });
    assert.equal(r.status, 2);
    assert.match(r.stderr || '', /requires --confirm-cost/i);
  });

  it('importing the module does not run CLI main (CI-safe without live-cache)', () => {
    const r = spawnSync(
      process.execPath,
      [
        '-e',
        "import { resolveProfileChargeCap } from './scripts/instagram-profile-validate.js'; console.log(resolveProfileChargeCap({}));",
      ],
      { cwd: root, encoding: 'utf8', env: { ...process.env } },
    );
    assert.equal(r.status, 0, r.stderr || r.stdout);
    assert.match(r.stdout || '', /0\.15/);
    assert.equal(/ENOENT|ERROR:/i.test(r.stderr || ''), false);
  });

  it('dry-run CLI succeeds when .postman-local/live-cache is missing', () => {
    const r = spawnSync(process.execPath, [validateScript], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env },
    });
    // Exit 0 (plan printed) or 3 (hard blockers like missing token/quota) — never crash on ENOENT.
    assert.ok([0, 3].includes(r.status), `unexpected status=${r.status} stderr=${r.stderr}`);
    assert.equal(/ENOENT/i.test(r.stderr || ''), false);
    assert.match(r.stdout || '', /DRY_RUN|DRY RUN/i);
  });
});

describe('profile logo overlays every post.page (synthetic meta)', () => {
  it('applies persisted profile HD logo to page and all posts without enrichment call', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ig-ov-'));
    const profiles = join(dir, 'instagram-profiles');
    await mkdir(profiles, { recursive: true });
    const config = {
      cacheDir: dir,
      apify: { token: '', baseUrl: 'http://127.0.0.1', dailyRunLimit: 0, maxChargeUsdPerRun: 0.15 },
      instagramProfileEnrichment: { enabled: false, actor: 'apify~instagram-profile-scraper', timeoutMs: 1000 },
      instagramProfileLogos: new Map(),
      instagramProfileTtlMs: 86400_000,
    };
    const quota = createApifyQuota({ stateDir: dir, dailyLimit: 0 });
    const identity = createInstagramIdentity(config, { quota });
    const ref = parseInstagramRef('https://www.instagram.com/nasa/');
    await identity.store.set('nasa', {
      username: 'nasa',
      id: '528817151',
      fullName: 'NASA',
      profilePicUrl: 'https://cdn.example.invalid/lo.jpg',
      profilePicUrlHD: 'https://cdn.example.invalid/hd.jpg',
      fetchedAt: Date.now(),
    });

    const pageIn = {
      id: '528817151',
      name: 'NASA',
      logo: INSTAGRAM_LOGO_FALLBACK,
      logo_fallback: INSTAGRAM_LOGO_FALLBACK,
      url: ref.url,
    };
    const postsIn = [
      { id: '1', url: 'https://www.instagram.com/p/a/', text: '', created_at: null, image: null, media: [], stats: { likes: 0, comments: 0, shares: 0 }, page: pageIn },
      { id: '2', url: 'https://www.instagram.com/p/b/', text: '', created_at: null, image: null, media: [], stats: { likes: 0, comments: 0, shares: 0 }, page: pageIn },
    ];

    const page = await identity.resolvePage(pageIn, ref, { allowEnrichment: false });
    const posts = identity.attachPageToPosts(page, postsIn);
    assert.equal(page.logo, 'https://cdn.example.invalid/hd.jpg');
    assert.ok(posts.every((p) => p.page.logo === page.logo && p.page.id === page.id && p.page.name === page.name));
    await rm(dir, { recursive: true, force: true });
  });
});
