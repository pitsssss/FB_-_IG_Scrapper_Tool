import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseInstagramRef, isInstagramRef } from '../src/instagramRef.js';

describe('Instagram profile URL parsing', () => {
  it('accepts valid profile URLs and bare usernames via https', () => {
    const a = parseInstagramRef('https://www.instagram.com/nasa/');
    assert.equal(a.key, 'instagram:nasa');
    assert.equal(a.username, 'nasa');
    assert.equal(a.platform, 'instagram');
    assert.equal(a.url, 'https://www.instagram.com/nasa/');

    const b = parseInstagramRef('HTTPS://INSTAGRAM.COM/NASA');
    assert.equal(b.key, 'instagram:nasa');

    const c = parseInstagramRef('https://m.instagram.com/nat.geo_1');
    assert.equal(c.username, 'nat.geo_1');
    assert.equal(c.key, 'instagram:nat.geo_1');
  });

  it('strips tracking query without changing identity', () => {
    const r = parseInstagramRef('https://www.instagram.com/nasa/?utm_source=x&igsh=abc');
    assert.equal(r.key, 'instagram:nasa');
    assert.equal(r.url, 'https://www.instagram.com/nasa/');
  });

  it('rejects non-Instagram and lookalike hosts', () => {
    assert.equal(parseInstagramRef('https://facebook.com/nasa'), null);
    assert.equal(parseInstagramRef('https://instagrám.com/nasa'), null);
    assert.equal(parseInstagramRef('https://evil-instagram.com/nasa'), null);
    assert.equal(parseInstagramRef('https://127.0.0.1/nasa'), null);
  });

  it('rejects post/reel/stories/explore routes', () => {
    assert.equal(parseInstagramRef('https://www.instagram.com/p/ABC123/'), null);
    assert.equal(parseInstagramRef('https://www.instagram.com/reel/ABC123/'), null);
    assert.equal(parseInstagramRef('https://www.instagram.com/reels/ABC123/'), null);
    assert.equal(parseInstagramRef('https://www.instagram.com/stories/nasa/123'), null);
    assert.equal(parseInstagramRef('https://www.instagram.com/explore/tags/space/'), null);
  });

  it('rejects credentials, malformed, empty, and long inputs', () => {
    assert.equal(parseInstagramRef('https://user:pass@www.instagram.com/nasa'), null);
    assert.equal(parseInstagramRef(''), null);
    assert.equal(parseInstagramRef('not a url'), null);
    assert.equal(parseInstagramRef(`https://www.instagram.com/${'a'.repeat(40)}/`), null);
    assert.equal(parseInstagramRef(`https://www.instagram.com/nasa/${'x'.repeat(600)}`), null);
  });

  it('isInstagramRef detects platform refs', () => {
    assert.equal(isInstagramRef(parseInstagramRef('https://www.instagram.com/nasa/')), true);
    assert.equal(isInstagramRef({ key: 'cern' }), false);
    assert.equal(isInstagramRef({ key: 'instagram:x', platform: 'instagram' }), true);
  });
});
