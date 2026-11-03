import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  normalizeInstagramItems,
  extractInstagramMedia,
  INSTAGRAM_LOGO_FALLBACK,
} from '../src/instagramNormalize.js';
import { parseInstagramRef } from '../src/instagramRef.js';
import { syntheticInstagramItems } from '../scripts/fake-upstream.js';
import { assertResponseShape, assertPageShape, assertPostShape } from './schema.js';

const ref = parseInstagramRef('https://www.instagram.com/nasa/');
const fixturePath = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'instagram-nasa-basicdata.json');

describe('Instagram normalizer', () => {
  it('maps Actor fields into public schema with Arabic + empty captions', () => {
    const raw = syntheticInstagramItems('nasa');
    const { page, posts } = normalizeInstagramItems(raw, ref, 10);
    assertPageShape(page);
    assert.equal(page.name, 'NASA');
    assert.equal(page.url, 'https://www.instagram.com/nasa/');
    assert.ok(page.logo.startsWith('https://'));
    assert.equal(page.logo_fallback, INSTAGRAM_LOGO_FALLBACK);
    assert.equal(posts.length, 10);
    posts.forEach(assertPostShape);

    const arabic = posts.find((p) => p.text.includes('مرحبا'));
    assert.ok(arabic, 'Arabic caption preserved');
    const empty = posts.find((p) => p.text === '');
    assert.ok(empty, 'empty caption allowed');
    assert.ok(empty.media.length >= 1);
  });

  it('handles carousel and video/reel media', () => {
    const raw = syntheticInstagramItems('nasa');
    const { posts } = normalizeInstagramItems(raw, ref, 12);
    const carousel = posts.find((p) => p.media.length >= 2);
    assert.ok(carousel, 'carousel images preserved');
    const video = posts.find((p) => p.media.some((m) => m.type === 'video'));
    assert.ok(video, 'video/reel media present');
  });

  it('never uses commenter avatars as account logo', () => {
    const items = [{
      id: '1',
      shortCode: 'Abc',
      caption: 'x',
      url: 'https://www.instagram.com/p/Abc/',
      timestamp: '2026-01-01T00:00:00.000Z',
      likesCount: 1,
      commentsCount: 0,
      ownerUsername: 'nasa',
      ownerFullName: 'NASA',
      ownerId: '1',
      displayUrl: 'https://cdn.example/post.jpg',
      latestComments: [{
        ownerProfilePicUrl: 'https://cdn.example/COMMENTER.jpg',
        ownerUsername: 'commenter',
      }],
    }];
    const { page } = normalizeInstagramItems(items, ref, 5);
    assert.equal(page.logo, INSTAGRAM_LOGO_FALLBACK);
    assert.ok(!page.logo.includes('COMMENTER'));
  });

  it('uses owner profile pic when Actor provides it', () => {
    const items = [{
      id: '1',
      shortCode: 'Abc',
      caption: 'x',
      url: 'https://www.instagram.com/p/Abc/',
      timestamp: '2026-01-01T00:00:00.000Z',
      ownerUsername: 'nasa',
      ownerFullName: 'NASA',
      ownerId: '99',
      ownerProfilePicUrl: 'https://cdn.example/real-owner.jpg',
      displayUrl: 'https://cdn.example/post.jpg',
      likesCount: 1,
      commentsCount: 0,
    }];
    const { page } = normalizeInstagramItems(items, ref, 5);
    assert.equal(page.logo, 'https://cdn.example/real-owner.jpg');
    assert.equal(page.id, '99');
  });

  it('dedupes IDs, sorts newest-first, maps hidden likes and missing shares', () => {
    const raw = [
      ...syntheticInstagramItems('nasa').slice(0, 3),
      syntheticInstagramItems('nasa')[0], // duplicate id
    ];
    const { posts } = normalizeInstagramItems(raw, ref, 10);
    const ids = posts.map((p) => p.id);
    assert.equal(new Set(ids).size, ids.length);
    for (let i = 1; i < posts.length; i++) {
      if (posts[i - 1].created_at && posts[i].created_at) {
        assert.ok(Date.parse(posts[i - 1].created_at) >= Date.parse(posts[i].created_at));
      }
    }
    const hidden = posts.find((p) => p.id.endsWith('7') || p.stats.likes === 0);
    // item i=7 has likesCount -1 → 0
    const fromHidden = normalizeInstagramItems([{
      id: 'hid',
      shortCode: 'Hid',
      caption: 'h',
      url: 'https://www.instagram.com/p/Hid/',
      timestamp: '2026-05-01T00:00:00.000Z',
      likesCount: -1,
      commentsCount: 2,
      ownerUsername: 'nasa',
      ownerFullName: 'NASA',
      displayUrl: 'https://cdn.example/x.jpg',
    }], ref, 1).posts[0];
    assert.equal(fromHidden.stats.likes, 0);
    assert.equal(fromHidden.stats.shares, 0);
  });

  it('ignores Actor error records and respects limit', () => {
    const raw = syntheticInstagramItems('nasa');
    assert.ok(raw.some((x) => x.error));
    const { posts } = normalizeInstagramItems(raw, ref, 5);
    assert.equal(posts.length, 5);
  });

  it('pinned old posts do not stay first when newer timestamps exist', () => {
    const items = [
      {
        id: 'old-pin',
        shortCode: 'Old',
        caption: 'pinned old',
        url: 'https://www.instagram.com/p/Old/',
        timestamp: '2020-01-01T00:00:00.000Z',
        isPinned: true,
        likesCount: 1,
        commentsCount: 0,
        ownerUsername: 'nasa',
        ownerFullName: 'NASA',
        displayUrl: 'https://cdn.example/old.jpg',
      },
      {
        id: 'new',
        shortCode: 'New',
        caption: 'fresh',
        url: 'https://www.instagram.com/p/New/',
        timestamp: '2026-10-01T00:00:00.000Z',
        isPinned: false,
        likesCount: 1,
        commentsCount: 0,
        ownerUsername: 'nasa',
        ownerFullName: 'NASA',
        displayUrl: 'https://cdn.example/new.jpg',
      },
    ];
    const { posts } = normalizeInstagramItems(items, ref, 10);
    assert.equal(posts[0].id, 'new');
    assert.equal(posts[1].id, 'old-pin');
  });

  it('extractInstagramMedia covers sidecar children', () => {
    const media = extractInstagramMedia({
      type: 'Sidecar',
      displayUrl: 'https://cdn.example/a.jpg',
      childPosts: [
        { displayUrl: 'https://cdn.example/b.jpg' },
        { videoUrl: 'https://cdn.example/c.mp4', displayUrl: 'https://cdn.example/cthumb.jpg' },
      ],
    });
    assert.ok(media.length >= 3);
    assert.ok(media.some((m) => m.type === 'video'));
  });

  it('response shape helper accepts normalized envelope', () => {
    const { page, posts } = normalizeInstagramItems(syntheticInstagramItems('nasa'), ref, 10);
    assertResponseShape({
      success: true,
      data: { page, posts },
      meta: {
        source: 'live',
        provider: 'instagram-apify',
        fetched_at: new Date().toISOString(),
        cache_age_seconds: 0,
        stale: false,
        count: posts.length,
        limit: 10,
        warning: null,
      },
    });
  });

  it('maps sanitized live basicData fixture (nasa) with fallback logo', () => {
    const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
    assert.equal(fixture.items.length, 10);
    const { page, posts } = normalizeInstagramItems(fixture.items, ref, 10);
    assertPageShape(page);
    assert.equal(page.name, 'NASA');
    assert.equal(page.id, '528817151');
    assert.equal(page.logo, INSTAGRAM_LOGO_FALLBACK);
    assert.equal(posts.length, 10);
    posts.forEach(assertPostShape);
    assert.equal(new Set(posts.map((p) => p.id)).size, 10);
    assert.ok(posts.every((p) => /instagram\.com\/(p|reel)\//i.test(p.url)));
    assert.ok(posts.every((p) => p.created_at));
    assert.ok(posts.every((p) => p.stats.shares === 0));
    assert.ok(posts.every((p) => p.page.name === 'NASA'));
    const times = posts.map((p) => Date.parse(p.created_at));
    for (let i = 1; i < times.length; i++) assert.ok(times[i - 1] >= times[i]);
    assert.ok(posts.some((p) => p.media.some((m) => m.type === 'video')), 'videos present in live sample');
    // basicData Sidecar rows had no childPosts — carousel children not claimed here.
    assert.ok(
      fixture.items.some((it) => it.type === 'Sidecar'),
      'fixture includes Sidecar type for documentation',
    );
  });
});
