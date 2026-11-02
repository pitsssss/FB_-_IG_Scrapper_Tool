import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { Cache } from '../src/cache.js';
import { loadConfig } from '../src/config.js';
import { createService } from '../src/service.js';
import { normalizeItems } from '../src/normalize.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'fb-crel-'));

describe('cache reliability', () => {
  it('disk failure keeps memory entry available and reports persisted=false', async () => {
    const dir = tmp();
    const cache = new Cache(dir);
    // Occupy the target path as a directory so atomic rename/write fails.
    const key = 'pagex';
    const target = cache.file(key);
    await fsp.mkdir(path.dirname(target), { recursive: true });
    await fsp.mkdir(target);
    const value = { key, fetchedAt: Date.now(), provider: 'apify', page: { id: null, name: 'X', logo: 'https://cdn.example/x.jpg', logo_fallback: 'https://graph.facebook.com/x/picture?type=large', url: 'https://www.facebook.com/x' }, posts: [{ id: '1', url: 'https://www.facebook.com/x/posts/1', text: 'hi', created_at: '2026-01-01T00:00:00.000Z', image: null, media: [], stats: { likes: 0, comments: 0, shares: 0 }, page: { id: null, name: 'X', logo: 'https://cdn.example/x.jpg', logo_fallback: 'https://graph.facebook.com/x/picture?type=large', url: 'https://www.facebook.com/x' } }] };
    const result = await cache.set(key, value);
    assert.equal(result.persisted, false);
    const got = await cache.get(key);
    assert.equal(got.posts[0].id, '1');
  });

  it('corrupt cache file fails safe as miss', async () => {
    const dir = tmp();
    const cache = new Cache(dir);
    await fsp.mkdir(dir, { recursive: true });
    await fsp.writeFile(cache.file('bad'), '{not-json', 'utf8');
    assert.equal(await cache.get('bad'), null);
  });

  it('refuses cross-key contamination from mismatched value.key', async () => {
    const dir = tmp();
    const cache = new Cache(dir);
    await fsp.mkdir(dir, { recursive: true });
    await fsp.writeFile(cache.file('alpha'), JSON.stringify({
      key: 'beta',
      fetchedAt: Date.now(),
      provider: 'apify',
      page: { name: 'Beta' },
      posts: [{ id: 'z' }],
    }), 'utf8');
    assert.equal(await cache.get('alpha'), null);
  });

  it('failed upstream does not delete valid cache; empty does not overwrite', async () => {
    let mode = 'ok';
    const items = Array.from({ length: 3 }, (_, i) => ({
      postId: `c${i}`, url: `https://www.facebook.com/crel/posts/c${i}`, text: `t${i}`,
      time: new Date(Date.UTC(2026, 9, 20 - i)).toISOString(), likes: 1, comments: 0, shares: 0,
      facebookId: '9', pageName: 'crel', user: { id: '9', name: 'Crel', profilePic: 'https://cdn.example/c.jpg' },
      media: [{ image: { uri: `https://cdn.example/c${i}.jpg` } }],
    }));
    const mock = http.createServer((req, res) => {
      req.resume();
      req.on('end', () => {
        if (mode === 'fail') { res.writeHead(500); return res.end('boom'); }
        if (mode === 'empty') { res.writeHead(201); return res.end('[]'); }
        res.writeHead(201, { 'content-type': 'application/json' });
        res.end(JSON.stringify(items));
      });
    });
    await new Promise((r) => mock.listen(0, '127.0.0.1', r));
    try {
      const config = loadConfig({
        API_KEYS: 't:secret',
        APIFY_TOKEN: 'tkn',
        APIFY_BASE_URL: `http://127.0.0.1:${mock.address().port}`,
        PROVIDERS: 'apify',
        CACHE_DIR: tmp(),
        UPSTREAM_RETRIES: '0',
        RETRY_BACKOFF_MS: '1',
        RETRY_COOLDOWN_SECONDS: '0',
        FRESH_TTL_SECONDS: '0',
        APIFY_DAILY_RUN_LIMIT: '20',
      });
      const service = createService(config);
      const ref = { key: 'crel', slug: 'crel', url: 'https://www.facebook.com/crel' };
      const first = await service.getPosts(ref, 10);
      const ids = first.data.posts.map((p) => p.id).join(',');
      assert.ok(first.data.page.name);
      assert.ok(first.data.page.logo);

      mode = 'fail';
      const stale = await service.getPosts(ref, 10);
      assert.equal(stale.meta.source, 'stale-cache');
      assert.equal(stale.data.posts.map((p) => p.id).join(','), ids);

      mode = 'empty';
      const empty = await service.getPosts(ref, 10);
      assert.equal(empty.data.posts.map((p) => p.id).join(','), ids);
    } finally {
      mock.close();
    }
  });

  it('restart restores disk-persisted entries', async () => {
    const dir = tmp();
    const cache1 = new Cache(dir);
    const value = {
      key: 'persist',
      fetchedAt: Date.now(),
      provider: 'apify',
      page: { id: null, name: 'P', logo: 'https://cdn.example/p.jpg', logo_fallback: 'https://graph.facebook.com/persist/picture?type=large', url: 'https://www.facebook.com/persist' },
      posts: [{ id: 'p1', url: 'https://www.facebook.com/persist/posts/1', text: '', created_at: '2026-01-01T00:00:00.000Z', image: 'https://cdn.example/i.jpg', media: [{ type: 'image', url: 'https://cdn.example/i.jpg', thumbnail: null }], stats: { likes: 0, comments: 0, shares: 0 }, page: { id: null, name: 'P', logo: 'https://cdn.example/p.jpg', logo_fallback: 'https://graph.facebook.com/persist/picture?type=large', url: 'https://www.facebook.com/persist' } }],
    };
    const { persisted } = await cache1.set('persist', value);
    assert.equal(persisted, true);
    const cache2 = new Cache(dir);
    const got = await cache2.get('persist');
    assert.equal(got.posts[0].id, 'p1');
    assert.equal(got.posts[0].text, '');
  });

  it('normalize keeps page identity, unique ids, newest-first, empty text with media', () => {
    const ref = { key: 'cern', slug: 'cern', url: 'https://www.facebook.com/cern' };
    const raw = [
      { postId: 'old', url: 'https://www.facebook.com/cern/posts/old', text: '', time: '2020-01-01T00:00:00.000Z', facebookId: '1', user: { id: '1', name: 'CERN', profilePic: 'https://cdn.example/l.jpg' }, media: [{ image: { uri: 'https://cdn.example/a.jpg' } }] },
      { postId: 'new', url: 'https://www.facebook.com/cern/posts/new', text: 'hello', time: '2026-01-01T00:00:00.000Z', facebookId: '1', user: { id: '1', name: 'CERN', profilePic: 'https://cdn.example/l.jpg' }, media: [{ image: { uri: 'https://cdn.example/b.jpg' } }] },
      { postId: 'new', url: 'https://www.facebook.com/cern/posts/dup', text: 'dup', time: '2026-02-01T00:00:00.000Z', facebookId: '1', user: { id: '1', name: 'CERN', profilePic: 'https://cdn.example/l.jpg' } },
    ];
    const { page, posts } = normalizeItems(raw, ref, 10);
    assert.equal(page.name, 'CERN');
    assert.match(page.logo, /^https:\/\//);
    assert.equal(posts[0].id, 'new');
    assert.equal(new Set(posts.map((p) => p.id)).size, posts.length);
    assert.equal(posts.find((p) => p.id === 'old').text, '');
    assert.ok(posts.find((p) => p.id === 'old').media.length >= 1);
  });
});
