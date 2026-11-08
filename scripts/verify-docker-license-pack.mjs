#!/usr/bin/env node
/**
 * Release-gate check for dashboard image LGPL redistribution materials.
 * Does not build or publish images. Fails if required texts, pins, or
 * Dockerfile copy steps are missing.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];

function read(rel) {
  return readFileSync(join(root, rel), 'utf8');
}

function mustInclude(rel, needle, label) {
  const text = read(rel);
  if (!text.includes(needle)) errors.push(`${label}: ${rel} missing ${JSON.stringify(needle)}`);
  return text;
}

const lgpl = mustInclude('third-party/licenses/LGPL-3.0.txt', 'GNU LESSER GENERAL PUBLIC LICENSE', 'LGPL text');
if (!lgpl.includes('Version 3, 29 June 2007')) errors.push('LGPL text is not LGPLv3');

const gpl = mustInclude('third-party/licenses/GPL-3.0.txt', 'GNU GENERAL PUBLIC LICENSE', 'GPL text');
if (!gpl.includes('Version 3, 29 June 2007')) errors.push('GPL text is not GPLv3');
if (gpl.length < 20000) errors.push('GPL text looks truncated');

const notices = mustInclude('third-party/NOTICES.txt', 'LGPL-3.0-or-later', 'notices');
mustInclude('third-party/NOTICES.txt', '8.18.7', 'notices libvips version');
mustInclude(
  'third-party/NOTICES.txt',
  'https://github.com/libvips/libvips/archive/refs/tags/v8.18.7.tar.gz',
  'notices source URL',
);
if (/written offer|postal address|contact us at/i.test(notices)) {
  errors.push('NOTICES must not invent a written source-offer address');
}

const versions = JSON.parse(read('third-party/sharp-libvips-linuxmusl-x64-1.3.4.versions.json'));
if (versions.vips !== '8.18.7') errors.push(`versions.json vips=${versions.vips}, expected 8.18.7`);

const lock = read('apps/dashboard/package-lock.json');
if (!lock.includes('"@img/sharp-libvips-linuxmusl-x64": "1.3.4"')) {
  errors.push('lockfile missing pinned @img/sharp-libvips-linuxmusl-x64@1.3.4');
}
if (!lock.includes('"sharp": "^0.35.5"') && !lock.includes('"version": "0.35.5"')) {
  errors.push('lockfile missing sharp 0.35.5');
}

const dockerfile = read('apps/dashboard/Dockerfile');
if (!/COPY\s+(--chown=\S+\s+)?third-party\s+\/app\/third-party/.test(dockerfile)) {
  errors.push('dashboard Dockerfile must COPY third-party into the runner image');
}
if (!/USER nextjs/.test(dockerfile)) errors.push('dashboard runner must drop to nextjs');

const ignore = read('.dockerignore');
if (!/(^|\n)\.env\r?(\n|$)/.test(ignore)) errors.push('.dockerignore must exclude .env');
if (!ignore.includes('.git')) errors.push('.dockerignore must exclude .git');

const workflow = read('.github/workflows/release-images.yml');
if (/^\s*push:\s*$/m.test(workflow) || /^\s*pull_request:/m.test(workflow)) {
  errors.push('release-images workflow must not run on push or pull_request');
}
if (!workflow.includes('workflow_dispatch')) errors.push('release-images must be workflow_dispatch only');
if (!workflow.includes("github.ref == 'refs/tags/v0.1.0-beta.1'")) {
  errors.push('release-images must require the version tag ref');
}

if (errors.length) {
  console.error('DOCKER_LICENSE_PACK: FAIL');
  for (const e of errors) console.error(' - ' + e);
  process.exit(1);
}
console.log('DOCKER_LICENSE_PACK: PASS');
console.log(
  JSON.stringify(
    {
      sharp: '0.35.5',
      libvipsPackage: '@img/sharp-libvips-linuxmusl-x64@1.3.4',
      libvips: versions.vips,
      license: 'LGPL-3.0-or-later',
      imagesPublished: false,
    },
    null,
    2,
  ),
);
