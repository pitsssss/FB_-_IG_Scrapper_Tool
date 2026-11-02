import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeItems } from '../src/normalize.js';

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const ref = { key: 'cern', id: null, slug: 'cern', url: 'https://www.facebook.com/cern' };
const PAGE_ID = '100064792144187';
const PAGE_LOGO = 'https://cdn.example/page-logo.jpg';
const VISITOR_LOGO = 'https://cdn.example/visitor.jpg';

function baseItem(i, extra = {}) {
  return {
    postId: `p${i}`,
    url: `https://www.facebook.com/cern/posts/p${i}`,
    text: `post ${i}`,
    time: new Date(Date.UTC(2026, 9, 20 - i)).toISOString(),
    likes: i,
    comments: 0,
    shares: 0,
    facebookId: PAGE_ID,
    pageName: 'cern',
    user: { id: PAGE_ID, name: 'CERN', profilePic: PAGE_LOGO },
    ...extra,
  };
}

describe('page identity extraction', () => {
  it('fixture still yields CERN name, page id, and non-fallback logo', () => {
    const items = JSON.parse(readFileSync(join(fixturesDir, 'apify-cern.json'), 'utf8'));
    const { page } = normalizeItems(items, ref, 10);
    assert.equal(page.name, 'CERN');
    assert.equal(page.id, PAGE_ID);
    assert.notEqual(page.logo, page.logo_fallback);
    assert.match(page.logo, /^https:\/\//i);
  });

  it('ignores visitor/collaborator author for page.name and page.logo', () => {
    const items = Array.from({ length: 9 }, (_, i) => baseItem(i));
    items.push(baseItem(9, {
      facebookId: PAGE_ID,
      user: { id: '999999999', name: 'Some Visitor', profilePic: VISITOR_LOGO },
    }));
    const { page } = normalizeItems(items, ref, 10);
    assert.equal(page.name, 'CERN');
    assert.equal(page.logo, PAGE_LOGO);
    assert.equal(page.id, PAGE_ID);
  });

  it('uses pageName when that is the only name source', () => {
    const items = Array.from({ length: 3 }, (_, i) => ({
      postId: `p${i}`,
      url: `https://www.facebook.com/cern/posts/p${i}`,
      text: `post ${i}`,
      time: new Date(Date.UTC(2026, 9, 20 - i)).toISOString(),
      facebookId: PAGE_ID,
      pageName: 'cern',
      user: { id: PAGE_ID },
    }));
    const { page } = normalizeItems(items, ref, 10);
    assert.equal(page.name, 'cern');
  });

  it('falls back to ref.slug when no names exist', () => {
    const items = Array.from({ length: 2 }, (_, i) => ({
      postId: `p${i}`,
      url: `https://www.facebook.com/cern/posts/p${i}`,
      text: `post ${i}`,
      time: new Date(Date.UTC(2026, 9, 20 - i)).toISOString(),
      facebookId: PAGE_ID,
      user: { id: PAGE_ID },
    }));
    const { page } = normalizeItems(items, ref, 10);
    assert.equal(page.name, 'cern');
  });

  it('empty items array yields slug name, fallback logo, and no posts', () => {
    const { page, posts } = normalizeItems([], ref, 10);
    assert.equal(page.name, 'cern');
    assert.equal(page.logo, page.logo_fallback);
    assert.equal(page.logo_fallback, 'https://graph.facebook.com/cern/picture?type=large');
    assert.deepEqual(posts, []);
  });
});
