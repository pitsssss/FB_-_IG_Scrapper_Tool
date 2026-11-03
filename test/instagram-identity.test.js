import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { loadConfig } from '../src/config.js';
import { createApp } from '../src/server.js';
import { createService } from '../src/service.js';
import { createApifyQuota } from '../src/apifyQuota.js';
import { parseInstagramRef } from '../src/instagramRef.js';
import { INSTAGRAM_LOGO_FALLBACK, isIncompleteCarousel, extractInstagramMedia } from '../src/instagramNormalize.js';
import {
  parseInstagramProfileLogos,
  resolveInstagramLogo,
  extractOwnerLogoFromItems,
  isVerifiedHttpsLogoUrl,
} from '../src/instagramLogo.js';
import { createInstagramProfileStore } from '../src/instagramProfileStore.js';
import { createInstagramIdentity } from '../src/instagramIdentity.js';
import { assertResponseShape } from './schema.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function freePort() {
  const { createServer: netCreate } = await import('node:net');
  return new Promise((resolve, reject) => {
    const s = netCreate();
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close((err) => (err ? reject(err) : resolve(port)));
    });
    s.on('error', reject);
  });
}

function startFakeApify({ onProfile, onPosts } = {}) {
  let calls = { posts: 0, profile: 0 };
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = Buffer.concat(chunks).toString('utf8');
    let json = {};
    try { json = body ? JSON.parse(body) : {}; } catch { /* ignore */ }

    const isProfile = /instagram-profile-scraper/i.test(url.pathname);
    const isPosts = /instagram-post-scraper/i.test(url.pathname);

    if (req.method === 'POST' && (isProfile || isPosts)) {
      if (isProfile) {
        calls.profile += 1;
        const items = await Promise.resolve(
          onProfile
            ? onProfile(json, calls)
            : [{
              id: '528817151',
              username: 'nasa',
              fullName: 'NASA',
              profilePicUrl: 'https://cdn.example.invalid/nasa-lo.jpg',
              profilePicUrlHD: 'https://cdn.example.invalid/nasa-hd.jpg',
            }],
        );
        res.writeHead(201, { 'content-type': 'application/json' });
        res.end(JSON.stringify(items));
        return;
      }
      calls.posts += 1;
      const items = await Promise.resolve(
        onPosts
          ? onPosts(json, calls)
          : [{
            id: '1',
            shortCode: 'Abc',
            type: 'Image',
            caption: 'hi',
            url: 'https://www.instagram.com/p/Abc/',
            timestamp: '2026-11-01T00:00:00.000Z',
            likesCount: 1,
            commentsCount: 0,
            ownerUsername: 'nasa',
            ownerFullName: 'NASA',
            ownerId: '528817151',
            displayUrl: 'https://cdn.example.invalid/post.jpg',
          }],
      );
      res.writeHead(201, { 'content-type': 'application/json' });
      res.end(JSON.stringify(items));
      return;
    }
    res.writeHead(404);
    res.end('{}');
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        port,
        base: `http://127.0.0.1:${port}`,
        calls,
        close: () => new Promise((r) => server.close(r)),
      });
    });
  });
}

describe('Instagram logo helpers', () => {
  it('rejects non-https and credentialed URLs', () => {
    assert.equal(isVerifiedHttpsLogoUrl('http://cdn.example/x.jpg'), false);
    assert.equal(isVerifiedHttpsLogoUrl('https://user:pass@cdn.example/x.jpg'), false);
    assert.equal(isVerifiedHttpsLogoUrl('https://cdn.example/x.jpg'), true);
  });

  it('parses company logo overrides by username', () => {
    const map = parseInstagramProfileLogos(JSON.stringify({
      nasa: 'https://cdn.example.invalid/company-nasa.jpg',
      'https://www.instagram.com/NatGeo/': 'https://cdn.example.invalid/company-natgeo.jpg',
    }));
    assert.equal(map.get('nasa'), 'https://cdn.example.invalid/company-nasa.jpg');
    assert.equal(map.get('natgeo'), 'https://cdn.example.invalid/company-natgeo.jpg');
  });

  it('priority: posts > profile-meta > config > fallback', () => {
    assert.equal(resolveInstagramLogo({
      fromPosts: 'https://cdn.example.invalid/from-posts.jpg',
      fromProfileMeta: 'https://cdn.example.invalid/from-meta.jpg',
      fromConfig: 'https://cdn.example.invalid/from-config.jpg',
    }).source, 'posts');
    assert.equal(resolveInstagramLogo({
      fromProfileMeta: 'https://cdn.example.invalid/from-meta.jpg',
      fromConfig: 'https://cdn.example.invalid/from-config.jpg',
    }).source, 'profile-meta');
    assert.equal(resolveInstagramLogo({
      fromConfig: 'https://cdn.example.invalid/from-config.jpg',
    }).source, 'config');
    assert.equal(resolveInstagramLogo({}).logo, INSTAGRAM_LOGO_FALLBACK);
  });

  it('never uses coauthor profile pics as owner logo', () => {
    const ref = parseInstagramRef('https://www.instagram.com/nasa/');
    const logo = extractOwnerLogoFromItems([
      {
        ownerUsername: 'nasa',
        coauthorProducers: [{ username: 'other', profile_pic_url: 'https://cdn.example.invalid/coauthor.jpg' }],
        profilePicUrl: 'https://cdn.example.invalid/ambiguous.jpg',
      },
    ], ref);
    assert.equal(logo, null);
  });

  it('uses ownerProfilePicUrl when owner matches requested username', () => {
    const ref = parseInstagramRef('https://www.instagram.com/nasa/');
    const logo = extractOwnerLogoFromItems([
      {
        ownerUsername: 'nasa',
        ownerProfilePicUrl: 'https://cdn.example.invalid/owner.jpg',
      },
      {
        ownerUsername: 'someoneelse',
        ownerProfilePicUrl: 'https://cdn.example.invalid/wrong.jpg',
      },
    ], ref);
    assert.equal(logo, 'https://cdn.example.invalid/owner.jpg');
  });
});

describe('Instagram carousel completeness', () => {
  it('detects incomplete Sidecar without children', () => {
    assert.equal(isIncompleteCarousel({ type: 'Sidecar', displayUrl: 'https://cdn.example/a.jpg' }), true);
    assert.equal(isIncompleteCarousel({
      type: 'Sidecar',
      displayUrl: 'https://cdn.example/a.jpg',
      childPosts: [{ displayUrl: 'https://cdn.example/b.jpg' }],
    }), false);
  });

  it('maps complete mixed image/video carousel in order with dedupe', () => {
    const media = extractInstagramMedia({
      type: 'Sidecar',
      displayUrl: 'https://cdn.example/cover.jpg',
      childPosts: [
        { displayUrl: 'https://cdn.example/cover.jpg' },
        { displayUrl: 'https://cdn.example/2.jpg' },
        { videoUrl: 'https://cdn.example/3.mp4', displayUrl: 'https://cdn.example/3thumb.jpg' },
      ],
    });
    assert.equal(media.length, 3);
    assert.equal(media[0].url, 'https://cdn.example/cover.jpg');
    assert.equal(media[1].url, 'https://cdn.example/2.jpg');
    assert.equal(media[2].type, 'video');
    assert.equal(media[2].thumbnail, 'https://cdn.example/3thumb.jpg');
  });

  it('incomplete Sidecar keeps cover only (no invented children)', () => {
    const media = extractInstagramMedia({
      type: 'Sidecar',
      displayUrl: 'https://cdn.example/cover-only.jpg',
    });
    assert.deepEqual(media, [{ type: 'image', url: 'https://cdn.example/cover-only.jpg', thumbnail: null }]);
  });
});

describe('Instagram profile store + enrichment (synthetic)', () => {
  let dir;
  before(async () => {
    dir = await mkdtemp(join(tmpdir(), 'ig-ident-'));
  });
  after(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('persists metadata and refuses empty overwrite', async () => {
    const store = createInstagramProfileStore(dir);
    const ok = await store.set('nasa', {
      username: 'nasa',
      id: '1',
      fullName: 'NASA',
      profilePicUrl: 'https://cdn.example.invalid/a.jpg',
      fetchedAt: Date.now(),
    });
    assert.equal(ok.persisted, true);
    const bad = await store.set('nasa', { username: 'nasa', profilePicUrl: null, fetchedAt: Date.now() });
    assert.equal(bad.persisted, false);
    const got = await store.get('nasa');
    assert.equal(got.profilePicUrl, 'https://cdn.example.invalid/a.jpg');
  });

  it('rejects wrong-account metadata username mismatch', async () => {
    const store = createInstagramProfileStore(dir);
    const r = await store.set('nasa', {
      username: 'natgeo',
      profilePicUrl: 'https://cdn.example.invalid/x.jpg',
      fetchedAt: Date.now(),
    });
    assert.equal(r.persisted, false);
  });

  it('config logo applies on cache hit without Apify; enrichment disabled by default', async () => {
    const fake = await startFakeApify();
    const cacheDir = await mkdtemp(join(tmpdir(), 'ig-svc-'));
    const env = {
      API_KEYS: 't:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      APIFY_TOKEN: 'dummy',
      APIFY_BASE_URL: fake.base,
      PROVIDERS: 'apify',
      CACHE_DIR: cacheDir,
      APIFY_DAILY_RUN_LIMIT: '5',
      UPSTREAM_RETRIES: '0',
      FRESH_TTL_SECONDS: '3600',
      INSTAGRAM_PROFILE_ENRICHMENT: '0',
      INSTAGRAM_PROFILE_LOGOS: JSON.stringify({
        nasa: 'https://cdn.example.invalid/company-nasa.jpg',
      }),
    };
    const config = loadConfig(env);
    assert.equal(config.instagramProfileEnrichment.enabled, false);
    const service = createService(config);
    const app = createApp(config, service);
    const port = await freePort();
    await new Promise((r) => app.listen(port, '127.0.0.1', r));
    const base = `http://127.0.0.1:${port}`;
    const key = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

    const live = await fetch(`${base}/api/v1/instagram/posts?page=${encodeURIComponent('nasa')}&limit=3`, {
      headers: { 'x-api-key': key },
    });
    const body = await live.json();
    assertResponseShape(body);
    assert.equal(body.data.page.logo, 'https://cdn.example.invalid/company-nasa.jpg');
    assert.equal(fake.calls.profile, 0, 'enrichment disabled → no profile Actor');
    assert.equal(fake.calls.posts, 1);

    const cached = await fetch(`${base}/api/v1/instagram/posts?page=${encodeURIComponent('nasa')}&limit=3`, {
      headers: { 'x-api-key': key },
    });
    const body2 = await cached.json();
    assert.equal(body2.meta.source, 'cache');
    assert.equal(body2.data.page.logo, 'https://cdn.example.invalid/company-nasa.jpg');
    assert.equal(fake.calls.posts, 1);
    assert.equal(fake.calls.profile, 0);

    await new Promise((r) => app.close(r));
    await fake.close();
    await rm(cacheDir, { recursive: true, force: true });
  });

  it('optional enrichment uses shared quota once and caches profile metadata', async () => {
    const fake = await startFakeApify();
    const cacheDir = await mkdtemp(join(tmpdir(), 'ig-enr-'));
    const env = {
      API_KEYS: 't:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      APIFY_TOKEN: 'dummy',
      APIFY_BASE_URL: fake.base,
      PROVIDERS: 'apify',
      CACHE_DIR: cacheDir,
      APIFY_DAILY_RUN_LIMIT: '5',
      UPSTREAM_RETRIES: '0',
      FRESH_TTL_SECONDS: '3600',
      INSTAGRAM_PROFILE_ENRICHMENT: '1',
      INSTAGRAM_PROFILE_TTL_SECONDS: '86400',
    };
    const config = loadConfig(env);
    assert.equal(config.instagramProfileEnrichment.enabled, true);
    const service = createService(config);
    const app = createApp(config, service);
    const port = await freePort();
    await new Promise((r) => app.listen(port, '127.0.0.1', r));
    const base = `http://127.0.0.1:${port}`;
    const key = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

    const live = await fetch(`${base}/api/v1/instagram/posts?page=${encodeURIComponent('nasa')}&limit=5`, {
      headers: { 'x-api-key': key },
    });
    const body = await live.json();
    assert.equal(live.status, 200);
    assert.equal(body.data.page.logo, 'https://cdn.example.invalid/nasa-hd.jpg');
    assert.ok(fake.calls.posts >= 1);
    assert.equal(fake.calls.profile, 1);

    const q1 = JSON.parse(await readFile(join(cacheDir, 'apify-quota.json'), 'utf8'));
    assert.equal(q1.consumed, 2); // posts + profile

    const again = await fetch(`${base}/api/v1/instagram/posts?page=${encodeURIComponent('nasa')}&limit=5`, {
      headers: { 'x-api-key': key },
    });
    const body2 = await again.json();
    assert.equal(body2.meta.source, 'cache');
    assert.equal(body2.data.page.logo, 'https://cdn.example.invalid/nasa-hd.jpg');
    assert.equal(fake.calls.profile, 1, 'fresh profile meta → no second enrichment');
    const q2 = JSON.parse(await readFile(join(cacheDir, 'apify-quota.json'), 'utf8'));
    assert.equal(q2.consumed, q1.consumed);

    // Profile store survives conceptually (file present)
    const store = createInstagramProfileStore(cacheDir);
    const meta = await store.get('nasa');
    assert.equal(meta.username, 'nasa');
    assert.ok(meta.profilePicUrlHD || meta.profilePicUrl);

    await new Promise((r) => app.close(r));
    await fake.close();
    await rm(cacheDir, { recursive: true, force: true });
  });

  it('failed enrichment does not break posts; shared quota still consumed on failed attempt', async () => {
    const fake = await startFakeApify({
      onProfile: () => [{ username: 'wrongaccount', profilePicUrl: 'https://cdn.example.invalid/x.jpg' }],
    });
    const cacheDir = await mkdtemp(join(tmpdir(), 'ig-fail-'));
    const env = {
      API_KEYS: 't:cccccccccccccccccccccccccccccccc',
      APIFY_TOKEN: 'dummy',
      APIFY_BASE_URL: fake.base,
      PROVIDERS: 'apify',
      CACHE_DIR: cacheDir,
      APIFY_DAILY_RUN_LIMIT: '5',
      UPSTREAM_RETRIES: '0',
      FRESH_TTL_SECONDS: '3600',
      INSTAGRAM_PROFILE_ENRICHMENT: 'true',
    };
    const config = loadConfig(env);
    const service = createService(config);
    const app = createApp(config, service);
    const port = await freePort();
    await new Promise((r) => app.listen(port, '127.0.0.1', r));
    const base = `http://127.0.0.1:${port}`;
    const key = 'cccccccccccccccccccccccccccccccc';
    const res = await fetch(`${base}/api/v1/instagram/posts?page=${encodeURIComponent('nasa')}&limit=2`, {
      headers: { 'x-api-key': key },
    });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.data.page.logo, INSTAGRAM_LOGO_FALLBACK);
    assert.equal(fake.calls.profile, 1);
    const q = JSON.parse(await readFile(join(cacheDir, 'apify-quota.json'), 'utf8'));
    assert.equal(q.consumed, 2);

    await new Promise((r) => app.close(r));
    await fake.close();
    await rm(cacheDir, { recursive: true, force: true });
  });

  it('enrichment respects shared daily quota exhaustion', async () => {
    const fake = await startFakeApify();
    const cacheDir = await mkdtemp(join(tmpdir(), 'ig-quota-'));
    // Pre-seed quota nearly exhausted: 1 left for posts, enrichment must not overshoot when limit=1
    await mkdir(cacheDir, { recursive: true });
    const today = new Date().toISOString().slice(0, 10);
    await writeFile(join(cacheDir, 'apify-quota.json'), JSON.stringify({
      schemaVersion: 1,
      utcDate: today,
      consumed: 1,
    }));

    const env = {
      API_KEYS: 't:dddddddddddddddddddddddddddddddd',
      APIFY_TOKEN: 'dummy',
      APIFY_BASE_URL: fake.base,
      PROVIDERS: 'apify',
      CACHE_DIR: cacheDir,
      APIFY_DAILY_RUN_LIMIT: '1',
      UPSTREAM_RETRIES: '0',
      FRESH_TTL_SECONDS: '3600',
      INSTAGRAM_PROFILE_ENRICHMENT: '1',
    };
    const config = loadConfig(env);
    const service = createService(config);
    // Cold Instagram page with exhausted budget after... actually consumed=1 and limit=1 means posts refresh fails.
    // Instead: limit=2, consumed=1 → posts succeeds (consumed=2), enrichment blocked.
    const env2 = { ...env, APIFY_DAILY_RUN_LIMIT: '2' };
    const config2 = loadConfig(env2);
    const service2 = createService(config2);
    const app = createApp(config2, service2);
    const port = await freePort();
    await new Promise((r) => app.listen(port, '127.0.0.1', r));
    const base = `http://127.0.0.1:${port}`;
    const key = 'dddddddddddddddddddddddddddddddd';
    const res = await fetch(`${base}/api/v1/instagram/posts?page=${encodeURIComponent('nasa')}&limit=2`, {
      headers: { 'x-api-key': key },
    });
    const body = await res.json();
    assert.equal(res.status, 200);
    // posts=1 reservation, enrichment blocked at limit → fallback logo
    assert.equal(body.data.page.logo, INSTAGRAM_LOGO_FALLBACK);
    assert.equal(fake.calls.posts, 1);
    assert.equal(fake.calls.profile, 0);
    const q = JSON.parse(await readFile(join(cacheDir, 'apify-quota.json'), 'utf8'));
    assert.equal(q.consumed, 2);

    await new Promise((r) => app.close(r));
    await fake.close();
    await rm(cacheDir, { recursive: true, force: true });
  });

  it('concurrent enrichment is single-flight (one profile Actor call)', async () => {
    let profileStarted = 0;
    const fake = await startFakeApify({
      onProfile: async () => {
        profileStarted += 1;
        await sleep(80);
        return [{
          id: '1',
          username: 'nasa',
          fullName: 'NASA',
          profilePicUrlHD: 'https://cdn.example.invalid/hd.jpg',
          profilePicUrl: 'https://cdn.example.invalid/lo.jpg',
        }];
      },
    });
    const cacheDir = await mkdtemp(join(tmpdir(), 'ig-sf-'));
    const config = loadConfig({
      API_KEYS: 't:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
      APIFY_TOKEN: 'dummy',
      APIFY_BASE_URL: fake.base,
      PROVIDERS: 'apify',
      CACHE_DIR: cacheDir,
      APIFY_DAILY_RUN_LIMIT: '10',
      UPSTREAM_RETRIES: '0',
      INSTAGRAM_PROFILE_ENRICHMENT: '1',
    });
    const quota = createApifyQuota({ stateDir: cacheDir, dailyLimit: 10 });
    const identity = createInstagramIdentity(config, { quota });
    const ref = parseInstagramRef('https://www.instagram.com/nasa/');
    const page = { id: null, name: 'nasa', logo: INSTAGRAM_LOGO_FALLBACK, logo_fallback: INSTAGRAM_LOGO_FALLBACK, url: ref.url };
    const results = await Promise.all([
      identity.resolvePage(page, ref, { allowEnrichment: true }),
      identity.resolvePage(page, ref, { allowEnrichment: true }),
      identity.resolvePage(page, ref, { allowEnrichment: true }),
    ]);
    assert.equal(fake.calls.profile, 1);
    assert.equal(profileStarted, 1);
    assert.ok(results.every((p) => p.logo === 'https://cdn.example.invalid/hd.jpg'));
    await fake.close();
    await rm(cacheDir, { recursive: true, force: true });
  });
});
