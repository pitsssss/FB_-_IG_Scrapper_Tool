/**
 * CI-safe privacy regression for the public tracked tree.
 *
 * Does NOT embed private customer denylists. Optional exact scanning:
 *   PRIVACY_DENYLIST_REGEX='term1|term2' npm test
 * (provide the pattern only via private local/CI secrets configuration).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FB_DEFAULT, IG_DEFAULT } from '../scripts/generate-postman-collection.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function trackedFiles() {
  const r = spawnSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'buffer' });
  assert.equal(r.status, 0, 'git ls-files failed');
  return r.stdout
    .toString('utf8')
    .split('\0')
    .filter(Boolean);
}

describe('public repository privacy', () => {
  it('Postman generator defaults to neutral public demo accounts', () => {
    assert.equal(FB_DEFAULT, 'https://www.facebook.com/cern');
    assert.equal(IG_DEFAULT, 'https://www.instagram.com/nasa/');
  });

  it('shareable Postman template matches generator defaults and has empty apiKey', async () => {
    const env = JSON.parse(
      await readFile(join(root, 'postman', 'Social-Media-Posts-Local.postman_environment.json'), 'utf8'),
    );
    const map = Object.fromEntries(env.values.map((v) => [v.key, v.value]));
    assert.equal(map.facebookPageUrl, FB_DEFAULT);
    assert.equal(map.instagramProfileUrl, IG_DEFAULT);
    assert.equal(map.pageUrl, FB_DEFAULT);
    assert.equal(map.apiKey, '');
    assert.equal(map.limit, '10');
  });

  it('generated local Postman environments are not tracked', () => {
    const files = trackedFiles();
    for (const f of files) {
      assert.equal(f.startsWith('.postman-local/'), false, `tracked generated path: ${f}`);
      assert.equal(/\.generated\.postman_environment\.json$/i.test(f), false, f);
      assert.equal(f === '.env' || /\.env\.local$/i.test(f) || /\.env\.[^/]+\.local$/i.test(f), false, f);
    }
  });

  it('tracked text artifacts do not contain obvious live credential material', async () => {
    const files = trackedFiles().filter((f) =>
      /\.(md|js|mjs|json|yml|yaml|example|txt|sh|Dockerfile)$/i.test(f) || f === 'Dockerfile',
    );
    const dangerous = [
      /apify_api_[A-Za-z0-9]{20,}/i,
      /EAACEdEose0cBA[A-Za-z0-9]+/,
      /-----BEGIN (RSA |OPENSSH |EC )?PRIVATE KEY-----/,
    ];
    for (const rel of files) {
      const text = await readFile(join(root, rel), 'utf8');
      for (const re of dangerous) {
        assert.equal(re.test(text), false, `credential-like material in ${rel}`);
      }
    }
  });

  it('optional private denylist scan passes when PRIVACY_DENYLIST_REGEX is set', async () => {
    const raw = (process.env.PRIVACY_DENYLIST_REGEX || '').trim();
    if (!raw) {
      assert.ok(true);
      return;
    }
    let re;
    try {
      re = new RegExp(raw, 'i');
    } catch (e) {
      assert.fail(`PRIVACY_DENYLIST_REGEX is not a valid RegExp: ${e.message}`);
    }
    const files = trackedFiles();
    const hits = [];
    for (const rel of files) {
      let text;
      try {
        text = await readFile(join(root, rel), 'utf8');
      } catch {
        continue;
      }
      if (re.test(text)) hits.push(rel);
    }
    assert.deepEqual(hits, [], `denylist matched tracked files: ${hits.join(', ')}`);
  });
});
