import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseFacebookUsername, parsePageRef, looksLikeSocialUrlOrPath } from '../src/pageRef.js';
import { parseInstagramUsername, parseInstagramRef, parseInstagramConfigRef } from '../src/instagramRef.js';
import { parseScopeRef } from '../src/config.js';

describe('Facebook username-only public input', () => {
  it('accepts bare usernames with case canonicalization', () => {
    const r = parseFacebookUsername('CERN');
    assert.equal(r.key, 'cern');
    assert.equal(r.username, 'cern');
    assert.equal(r.platform, 'facebook');
    assert.equal(r.url, 'https://www.facebook.com/cern');
  });

  it('accepts supported punctuation and numeric ids', () => {
    assert.equal(parseFacebookUsername('my.page_1').key, 'my.page_1');
    assert.equal(parseFacebookUsername('100012345678901').key, '100012345678901');
  });

  it('rejects full URLs, @prefix, paths, and reserved names', () => {
    assert.equal(parseFacebookUsername('https://www.facebook.com/cern'), null);
    assert.equal(parseFacebookUsername('www.facebook.com/cern'), null);
    assert.equal(parseFacebookUsername('@cern'), null);
    assert.equal(parseFacebookUsername('cern/about'), null);
    assert.equal(parseFacebookUsername('groups'), null);
    assert.equal(parseFacebookUsername('login'), null);
    assert.equal(parseFacebookUsername('a'), null);
    assert.equal(parseFacebookUsername(''), null);
  });

  it('legacy parsePageRef still accepts URLs for trusted config', () => {
    assert.equal(parsePageRef('https://www.facebook.com/CERN/').key, 'cern');
  });
});

describe('Instagram username-only public input', () => {
  it('accepts bare usernames with case canonicalization', () => {
    const r = parseInstagramUsername('NASA');
    assert.equal(r.key, 'instagram:nasa');
    assert.equal(r.username, 'nasa');
    assert.equal(r.url, 'https://www.instagram.com/nasa/');
  });

  it('accepts underscores and periods', () => {
    assert.equal(parseInstagramUsername('nat.geo_1').username, 'nat.geo_1');
  });

  it('rejects full URLs, posts/reels, @prefix, and hyphens', () => {
    assert.equal(parseInstagramUsername('https://www.instagram.com/nasa/'), null);
    assert.equal(parseInstagramUsername('@nasa'), null);
    assert.equal(parseInstagramUsername('nasa-official'), null);
    assert.equal(parseInstagramUsername('p'), null);
    assert.equal(parseInstagramUsername(''), null);
  });

  it('legacy parseInstagramRef still accepts URLs for trusted config', () => {
    assert.equal(parseInstagramRef('https://www.instagram.com/nasa/').key, 'instagram:nasa');
  });

  it('config refs accept username, prefix, and legacy URL', () => {
    assert.equal(parseInstagramConfigRef('nasa').key, 'instagram:nasa');
    assert.equal(parseInstagramConfigRef('instagram:NASA').key, 'instagram:nasa');
    assert.equal(parseInstagramConfigRef('https://www.instagram.com/nasa/').key, 'instagram:nasa');
  });
});

describe('cross-platform scope identity', () => {
  it('keeps facebook and instagram usernames isolated', () => {
    assert.equal(parseScopeRef('example').key, 'example');
    assert.equal(parseScopeRef('instagram:example').key, 'instagram:example');
    assert.notEqual(parseScopeRef('example').key, parseScopeRef('instagram:example').key);
  });

  it('detects URL-like public inputs', () => {
    assert.equal(looksLikeSocialUrlOrPath('https://x.com/a'), true);
    assert.equal(looksLikeSocialUrlOrPath('cern'), false);
  });
});
