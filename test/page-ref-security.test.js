import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parsePageRef } from '../src/pageRef.js';

describe('page URL parsing security', () => {
  it('accepts valid canonical and equivalent supported forms', () => {
    assert.equal(parsePageRef('https://www.facebook.com/cern').key, 'cern');
    assert.equal(parsePageRef('https://facebook.com/CERN/').key, 'cern');
    assert.equal(parsePageRef('facebook.com/cern?utm_source=x#frag').key, 'cern');
    assert.equal(parsePageRef('https://m.facebook.com/cern').key, 'cern');
    assert.equal(parsePageRef('https://www.fb.com/cern').key, 'cern');
    assert.equal(parsePageRef('https://www.facebook.com/profile.php?id=100012345678901').id, '100012345678901');
    assert.equal(parsePageRef('https://www.facebook.com/pages/My-Page/123456789').id, '123456789');
    assert.equal(parsePageRef('https://www.facebook.com/100012345678901').key, '100012345678901');
  });

  it('rejects non-Facebook hosts, lookalikes, and unsupported schemes', () => {
    assert.equal(parsePageRef('https://evil.com/cern'), null);
    assert.equal(parsePageRef('https://facebook.com.evil.com/cern'), null);
    assert.equal(parsePageRef('https://notfacebook.com/cern'), null);
    assert.equal(parsePageRef('ftp://www.facebook.com/cern'), null);
    assert.equal(parsePageRef('javascript:alert(1)'), null);
  });

  it('rejects embedded credentials and unsupported Facebook paths', () => {
    assert.equal(parsePageRef('https://user:pass@www.facebook.com/cern'), null);
    assert.equal(parsePageRef('https://www.facebook.com/groups/123'), null);
    assert.equal(parsePageRef('https://www.facebook.com/watch'), null);
    assert.equal(parsePageRef('https://www.facebook.com/reel/123'), null);
    assert.equal(parsePageRef('https://www.facebook.com/login'), null);
  });

  it('rejects malformed, empty, and excessively long inputs', () => {
    assert.equal(parsePageRef(''), null);
    assert.equal(parsePageRef('not a url'), null);
    assert.equal(parsePageRef('https://www.facebook.com/'), null);
    assert.equal(parsePageRef(`https://www.facebook.com/${'a'.repeat(600)}`), null);
    assert.equal(parsePageRef('https://www.facebook.com/'), null);
  });
});
