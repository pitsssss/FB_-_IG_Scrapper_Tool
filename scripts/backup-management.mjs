#!/usr/bin/env node
/**
 * Management SQLite backup/restore helpers.
 *
 * Prefer stopping the API (or using this while idle) for strongest consistency when WAL files exist.
 * Does NOT include DATA_ENCRYPTION_KEY — escrow that separately.
 *
 * Backup:
 *   node scripts/backup-management.mjs --management-dir ./data/management --out ./backups
 *
 * Restore (isolated directory):
 *   node scripts/backup-management.mjs --restore ./backups/mgmt-....sqlite --management-dir ./data/management-restore
 */
import fs from 'node:fs';
import path from 'node:path';

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return fallback;
}

const restorePath = arg('--restore');
const managementDir = arg('--management-dir', process.env.MANAGEMENT_DIR || './data/management');
const outDir = arg('--out', './backups');
const force = process.argv.includes('--force');

function copyDbBundle(srcDb, destDb) {
  fs.copyFileSync(srcDb, destDb);
  for (const suffix of ['-wal', '-shm']) {
    const side = `${srcDb}${suffix}`;
    if (fs.existsSync(side)) fs.copyFileSync(side, `${destDb}${suffix}`);
  }
}

if (restorePath) {
  if (!fs.existsSync(restorePath)) {
    console.error('Restore source not found:', restorePath);
    process.exit(1);
  }
  fs.mkdirSync(managementDir, { recursive: true });
  const dest = path.join(managementDir, 'app.sqlite');
  if (fs.existsSync(dest) && !force) {
    console.error('Refusing to overwrite existing', dest, '(pass --force)');
    process.exit(1);
  }
  copyDbBundle(restorePath, dest);
  console.log('Restored management DB to', dest);
  console.log('Ensure DATA_ENCRYPTION_KEY matches the backup era before starting API.');
  console.log('Stop any running API that uses this MANAGEMENT_DIR before restore.');
  process.exit(0);
}

const src = path.join(managementDir, 'app.sqlite');
if (!fs.existsSync(src)) {
  console.error('No management database at', src);
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const dest = path.join(outDir, `mgmt-${stamp}.sqlite`);
copyDbBundle(src, dest);

console.log('Backup written:', dest);
if (fs.existsSync(`${src}-wal`)) {
  console.warn('WAL present — for strongest consistency stop the API, re-run backup, then start again.');
}
console.log('Also archive CACHE_DIR (posts JSON + apify-quota.json).');
console.log('Escrow DATA_ENCRYPTION_KEY outside the same unencrypted archive.');
