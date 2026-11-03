/**
 * Validates unified Postman collection + environment template structure.
 * Regenerates from scripts/generate-postman-collection.mjs (deterministic).
 * Zero network / zero Apify.
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  COLLECTION_NAME,
  FB_DEFAULT,
  IG_DEFAULT,
} from '../scripts/generate-postman-collection.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const collectionPath = join(root, 'postman', 'Social-Media-Posts-API.postman_collection.json');
const envTemplatePath = join(root, 'postman', 'Social-Media-Posts-Local.postman_environment.json');
const generator = join(root, 'scripts', 'generate-postman-collection.mjs');

function walkRequests(items, acc = []) {
  for (const it of items || []) {
    if (it.item) walkRequests(it.item, acc);
    else if (it.request) acc.push(it);
  }
  return acc;
}

function folderNames(items) {
  return (items || []).filter((it) => Array.isArray(it.item)).map((it) => it.name);
}

function collectVarsFromText(text, into) {
  const re = /\{\{([a-zA-Z0-9_]+)\}\}/g;
  let m;
  while ((m = re.exec(text))) into.add(m[1]);
}

describe('unified Postman collection', () => {
  let collection;
  let envTemplate;
  let firstJson;
  let secondJson;

  before(async () => {
    const run1 = spawnSync(process.execPath, [generator], { cwd: root, encoding: 'utf8' });
    assert.equal(run1.status, 0, run1.stderr || run1.stdout);
    firstJson = await readFile(collectionPath, 'utf8');
    const run2 = spawnSync(process.execPath, [generator], { cwd: root, encoding: 'utf8' });
    assert.equal(run2.status, 0, run2.stderr || run2.stdout);
    secondJson = await readFile(collectionPath, 'utf8');
    collection = JSON.parse(firstJson);
    envTemplate = JSON.parse(await readFile(envTemplatePath, 'utf8'));
  });

  it('regenerates deterministically', () => {
    assert.equal(firstJson, secondJson);
  });

  it('is Collection v2.1 with exact two platform folders', () => {
    assert.match(collection.info.schema, /collection\/v2\.1\.0/);
    assert.equal(collection.info.name, COLLECTION_NAME);
    const tops = folderNames(collection.item);
    assert.deepEqual(tops, ['01 — Facebook', '02 — Instagram']);
  });

  it('nests the expected FB/IG suites', () => {
    const fb = folderNames(collection.item[0].item);
    const ig = folderNames(collection.item[1].item);
    assert.ok(fb.some((n) => n.includes('Health')));
    assert.ok(fb.some((n) => n.includes('Real Posts')));
    assert.ok(fb.some((n) => n.includes('Cache')));
    assert.ok(fb.some((n) => n.includes('Validation')));
    assert.ok(fb.some((n) => n.includes('Client Permissions')));
    assert.ok(fb.some((n) => n.includes('Offline Resilience')));
    assert.ok(ig.some((n) => n.includes('Health')));
    assert.ok(ig.some((n) => n.includes('Real Posts')));
    assert.ok(ig.some((n) => n.includes('Cache')));
    assert.ok(ig.some((n) => n.includes('Validation')));
    assert.ok(ig.some((n) => n.includes('Client Permissions')));
    assert.ok(ig.some((n) => n.includes('Offline Resilience')));
  });

  it('routes Facebook requests to /facebook/posts and Instagram to /instagram/posts', () => {
    const fbReqs = walkRequests(collection.item[0].item);
    const igReqs = walkRequests(collection.item[1].item);
    for (const r of fbReqs) {
      const path = (r.request.url?.path || []).join('/');
      if (path === 'health' || path.includes('unknown')) continue;
      if (r.request.method === 'POST' && path.includes('facebook')) continue;
      if (path.startsWith('api/v1/facebook') || path === 'api/v1/facebook/posts') {
        assert.ok(path.includes('facebook'), path);
        assert.ok(!path.includes('instagram'), path);
      }
    }
    for (const r of igReqs) {
      const path = (r.request.url?.path || []).join('/');
      if (path === 'health' || path.includes('unknown')) continue;
      if (path.startsWith('api/v1/instagram')) {
        assert.ok(path.includes('instagram'), path);
        assert.ok(!path.includes('facebook/posts'), path);
      }
    }
    assert.ok(fbReqs.length >= 20, `fb requests=${fbReqs.length}`);
    assert.ok(igReqs.length >= 20, `ig requests=${igReqs.length}`);
  });

  it('environment template has required variables and neutral public demo defaults without secrets', () => {
    const map = Object.fromEntries(envTemplate.values.map((v) => [v.key, v]));
    for (const key of [
      'baseUrl',
      'apiKey',
      'facebookUsername',
      'instagramUsername',
      'limit',
    ]) {
      assert.ok(map[key], `missing ${key}`);
    }
    assert.equal(FB_DEFAULT, 'cern');
    assert.equal(IG_DEFAULT, 'nasa');
    assert.equal(map.facebookUsername.value, FB_DEFAULT);
    assert.equal(map.instagramUsername.value, IG_DEFAULT);
    assert.equal(map.limit.value, '10');
    assert.equal(map.apiKey.value, '');
    const blob = JSON.stringify(envTemplate);
    assert.equal(/apify_api_[A-Za-z0-9]{12,}/i.test(blob), false);
    assert.equal(/APIFY_TOKEN\s*=\s*\S+/i.test(blob), false);
  });

  it('collection variables resolve against the template env (+ collection vars)', async () => {
    const envKeys = new Set(envTemplate.values.map((v) => v.key));
    const collectionVars = new Set((collection.variable || []).map((v) => v.key));
    const allowed = new Set([...envKeys, ...collectionVars]);
    const used = new Set();
    const text = JSON.stringify(collection);
    collectVarsFromText(text, used);
    for (const v of used) {
      assert.ok(allowed.has(v), `unresolved/unknown variable {{${v}}}`);
    }
    await access(collectionPath, constants.R_OK);
    await access(envTemplatePath, constants.R_OK);
  });

  it('contains no secret-looking tokens', () => {
    const blob = JSON.stringify(collection) + JSON.stringify(envTemplate);
    assert.equal(/apify_api_[A-Za-z0-9]+/i.test(blob), false);
    assert.equal(/Bearer\s+[A-Za-z0-9._-]{20,}/i.test(blob), false);
  });

  it('logo URL assertion regex is valid in generated scripts', () => {
    const blob = JSON.stringify(collection);
    // After JSON round-trip, script text is match(/^https:\/\//) → stringified as \\/\\/
    assert.equal(blob.includes('and.match(/^https:\\\\/\\\\//)'), true);
    assert.equal(blob.includes('and.match(/^https:\\\\/\\\\//;);'), false);
  });
});
