import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeItems } from '../src/normalize.js';
import { assertPageShape, assertPostShape } from './schema.js';

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

function loadFixtures() {
  let files = [];
  try {
    files = readdirSync(fixturesDir).filter((f) => /^apify-.+\.json$/i.test(f));
  } catch {
    files = [];
  }
  return files.map((file) => {
    const key = file.replace(/^apify-/i, '').replace(/\.json$/i, '');
    const items = JSON.parse(readFileSync(join(fixturesDir, file), 'utf8'));
    const ref = {
      key,
      id: /^\d{5,25}$/.test(key) ? key : null,
      slug: /^\d{5,25}$/.test(key) ? null : key,
      url: /^\d{5,25}$/.test(key)
        ? `https://www.facebook.com/profile.php?id=${key}`
        : `https://www.facebook.com/${key}`,
    };
    return { file, key, items, ref };
  });
}

function isIsoDate(v) {
  if (typeof v !== 'string' || !v) return false;
  const d = new Date(v);
  return !Number.isNaN(d.getTime()) && d.toISOString() === v;
}

describe('apify fixtures', () => {
  const fixtures = loadFixtures();
  assert.ok(fixtures.length >= 1, 'expected at least one test/fixtures/apify-*.json');

  for (const { file, items, ref } of fixtures) {
    it(`normalizes ${file}`, () => {
      const { page, posts } = normalizeItems(items, ref, 10);

      assert.ok(posts.length >= 1, 'at least 1 post');
      assert.ok(posts.length <= 10, 'at most 10 posts');
      assertPageShape(page);

      const ids = new Set();
      for (const post of posts) {
        assertPostShape(post);
        assert.equal(typeof post.url, 'string');
        assert.ok(post.url.length > 0, 'url string');
        assert.ok(isIsoDate(post.created_at), `created_at valid ISO, got ${post.created_at}`);
        assert.ok(!ids.has(post.id), `duplicate id ${post.id}`);
        ids.add(post.id);
      }

      const dated = posts.filter((p) => p.created_at);
      for (let i = 1; i < dated.length; i++) {
        const prev = Date.parse(dated[i - 1].created_at);
        const cur = Date.parse(dated[i].created_at);
        assert.ok(prev >= cur, 'posts sorted newest-first by created_at');
      }
    });
  }
});
