/**
 * Regression tests for privacy-history classification.
 * Uses only synthetic fixtures — never copies historical secrets or customer URLs.
 *
 * Avoid embedding contiguous provider-token env assignment literals in this
 * file except via runtime concatenation, so pickaxe classification of the test
 * source itself stays synthetic/safe.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  classifyMatch,
  classifyTextOccurrences,
  summarizeOccurrences,
  unwrapEnvValue,
  PATTERNS,
} from '../scripts/privacy-finding-classify.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Runtime-only needles so this file does not embed assignment-looking literals. */
const N = {
  apifyToken: 'APIFY' + '_TOKEN=',
  apiKeys: 'API' + '_KEYS=',
  bootstrap: 'BOOTSTRAP' + '_SETUP_TOKEN=',
  encryption: 'DATA' + '_ENCRYPTION_KEY=',
  apifyPrefix: 'apify' + '_api_',
  metaPrefix: 'EAACEdEose0cBA',
  pem: 'BEGIN PRIVATE KEY',
};

describe('privacy finding classification', () => {
  it('A: empty env placeholders are safe', () => {
    const mapping = [
      ['env_apify_assignment', N.apifyToken],
      ['env_api_keys_assignment', N.apiKeys],
      ['env_bootstrap_assignment', N.bootstrap],
      ['env_encryption_assignment', N.encryption],
    ];
    for (const [id, needle] of mapping) {
      const r = classifyMatch({
        patternId: id,
        filePath: '.env.example',
        line: needle,
        afterNeedle: '',
        needle,
      });
      assert.equal(r.class, 'SAFE_EMPTY_ASSIGNMENT');
      assert.equal(r.safe, true);
    }
  });

  it('B: CHANGE_ME placeholders are safe', () => {
    const r = classifyMatch({
      patternId: 'env_api_keys_assignment',
      filePath: '.env.example',
      line: N.apiKeys + 'site1:CHANGE_ME_1,site2:CHANGE_ME_2',
      afterNeedle: 'site1:CHANGE_ME_1,site2:CHANGE_ME_2',
      needle: N.apiKeys,
    });
    assert.equal(r.safe, true);
    assert.match(r.class, /^SAFE_/);
  });

  it('B2: docker-smoke dummy token with shell continuation is safe', () => {
    const smokeLine = '  -e ' + N.apifyToken + 'dummy \\';
    const r = classifyMatch({
      patternId: 'env_apify_assignment',
      filePath: 'scripts/docker-smoke.sh',
      line: smokeLine,
      afterNeedle: 'dummy \\',
      needle: N.apifyToken,
    });
    assert.equal(r.class, 'SAFE_PLACEHOLDER_ASSIGNMENT');
    assert.equal(r.safe, true);
    assert.equal(unwrapEnvValue('dummy \\'), 'dummy');
  });

  it('C: synthetic negative-test detector needles are not exposure', () => {
    const cases = [
      {
        patternId: 'apify_token_prefix',
        filePath: 'scripts/privacy-history-audit.mjs',
        line: "  { id: 'apify_token_prefix', needle: '" + N.apifyPrefix + "', severity: 'critical' },",
        afterNeedle: "', severity: 'critical' },",
        needle: N.apifyPrefix,
      },
      {
        patternId: 'apify_token_prefix',
        filePath: 'test/public-privacy.test.js',
        line: '      /' + N.apifyPrefix + '[A-Za-z0-9]{20,}/i,',
        afterNeedle: '[A-Za-z0-9]{20,}/i,',
        needle: N.apifyPrefix,
      },
      {
        patternId: 'meta_page_token_prefix',
        filePath: 'test/public-privacy.test.js',
        line: '      /' + N.metaPrefix + '[A-Za-z0-9]+/,',
        afterNeedle: '[A-Za-z0-9]+/,',
        needle: N.metaPrefix,
      },
      {
        patternId: 'pem_private_key',
        filePath: 'scripts/privacy-history-audit.mjs',
        line: "  { id: 'pem_private_key', needle: '" + N.pem + "', severity: 'critical' },",
        afterNeedle: "', severity: 'critical' },",
        needle: N.pem,
      },
    ];
    for (const c of cases) {
      const r = classifyMatch(c);
      assert.equal(r.safe, true, `${c.patternId} in ${c.filePath} => ${r.class}`);
    }
  });

  it('D: realistic nonempty credential in unexpected path is flagged', () => {
    const syntheticBody = 'a'.repeat(24);
    const leakLine = 'const t = "' + N.apifyPrefix + syntheticBody + '";';
    const r = classifyMatch({
      patternId: 'apify_token_prefix',
      filePath: 'src/unexpected-leak.js',
      line: leakLine,
      afterNeedle: syntheticBody + '";',
      needle: N.apifyPrefix,
    });
    assert.equal(r.safe, false);
    assert.equal(r.class, 'NEEDS_REVIEW_TOKEN_BODY');
  });

  it('E: suspicious values inside normally safe fixture files are still flagged', () => {
    const syntheticBody = 'b'.repeat(24);
    const leakLine = 'const leak = "' + N.apifyPrefix + syntheticBody + '";';
    const r = classifyMatch({
      patternId: 'apify_token_prefix',
      filePath: 'test/public-privacy.test.js',
      line: leakLine,
      afterNeedle: syntheticBody + '";',
      needle: N.apifyPrefix,
    });
    assert.equal(r.safe, false);
    assert.equal(r.class, 'NEEDS_REVIEW_TOKEN_BODY');

    const envBody = 'c'.repeat(40);
    const envLeak = classifyMatch({
      patternId: 'env_apify_assignment',
      filePath: '.env.example',
      line: N.apifyToken + envBody,
      afterNeedle: envBody,
      needle: N.apifyToken,
    });
    assert.equal(envLeak.safe, false);
    assert.equal(envLeak.class, 'NEEDS_REVIEW_ENV_VALUE');
  });

  it('F: unresolved findings keep REVIEW_REQUIRED aggregate semantics', () => {
    const summary = summarizeOccurrences([
      { class: 'SAFE_EMPTY_ASSIGNMENT', safe: true, path: '.env.example' },
      { class: 'NEEDS_REVIEW_ENV_VALUE', safe: false, path: 'src/odd.js' },
    ]);
    assert.equal(summary.allSafe, false);
    assert.equal(summary.unresolvedCount, 1);
    assert.deepEqual(summary.sampleUnresolvedPaths, ['src/odd.js']);
  });

  it('G: test module itself contains no customer URL hosts beyond public demos', async () => {
    const { readFile } = await import('node:fs/promises');
    const self = await readFile(fileURLToPath(import.meta.url), 'utf8');
    assert.equal(/facebook\.com\/(?!cern\b)/i.test(self), false);
    assert.equal(/instagram\.com\/(?!nasa\b)/i.test(self), false);
    assert.equal(/apify_api_[A-Za-z0-9]{20,}/.test(self), false);
    // Contiguous provider-token env assignment must not appear as a single literal.
    const providerTokAssign = 'APIFY' + '_TOKEN=';
    assert.equal(self.includes(providerTokAssign), false);
  });

  it('classifyTextOccurrences finds multiple env lines', () => {
    const p = PATTERNS.find((x) => x.id === 'env_bootstrap_assignment');
    const text = N.bootstrap + '\n' + N.bootstrap + 'CHANGE_ME\n';
    const occ = classifyTextOccurrences(p, '.env.example', text);
    assert.equal(occ.length, 2);
    assert.equal(occ.every((o) => o.safe), true);
  });
});

describe('privacy:history integration', () => {
  it('current repository history classifies as PASS (synthetic-only hits)', () => {
    const r = spawnSync('node', ['scripts/privacy-history-audit.mjs'], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /HISTORICAL_PRIVACY: PASS/);
    assert.doesNotMatch(r.stdout, /HISTORICAL_PRIVACY: REVIEW_REQUIRED/);
    const jsonStart = r.stdout.indexOf('{');
    const jsonEnd = r.stdout.lastIndexOf('}');
    const report = JSON.parse(r.stdout.slice(jsonStart, jsonEnd + 1));
    assert.equal(report.unresolvedPatternCount, 0);
    assert.equal(report.status, 'HISTORICAL_PRIVACY: PASS');
    // Still records pickaxe activity so the scanner is not a no-op
    const withHits = report.findings.filter((f) => f.commitHits > 0);
    assert.ok(withHits.length > 0);
  });
});

// Silence unused import lint-style concerns in some editors
void PATTERNS;
