#!/usr/bin/env node
/**
 * Management SQLite backup/restore helpers.
 *
 * Preferred consistency: open the DB and run VACUUM INTO (online-safe snapshot).
 * Fallback: copy app.sqlite + WAL/SHM after an explicit API stop.
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
import { DatabaseSync } from 'node:sqlite';

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return fallback;
}

const restorePath = arg('--restore');
const managementDir = arg('--management-dir', process.env.MANAGEMENT_DIR || './data/management');
const outDir = arg('--out', './backups');
const force = process.argv.includes('--force');
const copyOnly = process.argv.includes('--copy-only');

function copyDbBundle(srcDb, destDb) {
  fs.copyFileSync(srcDb, destDb);
  for (const suffix of ['-wal', '-shm']) {
    const side = `${srcDb}${suffix}`;
    if (fs.existsSync(side)) fs.copyFileSync(side, `${destDb}${suffix}`);
  }
}

function verifySqlite(filePath) {
  const db = new DatabaseSync(filePath, { readOnly: true });
  try {
    const row = db.prepare('PRAGMA integrity_check').get();
    const ok = row && String(Object.values(row)[0]).toLowerCase() === 'ok';
    if (!ok) throw new Error(`integrity_check failed: ${JSON.stringify(row)}`);
  } finally {
    db.close();
  }
}

function vacuumInto(srcDb, destDb) {
  const destSql = path.resolve(destDb).replaceAll('\\', '/');
  const db = new DatabaseSync(srcDb);
  try {
    db.exec(`VACUUM INTO '${destSql.replaceAll("'", "''")}'`);
  } finally {
    db.close();
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
  verifySqlite(restorePath);
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

let method = 'copy';
if (!copyOnly) {
  try {
    vacuumInto(src, dest);
    method = 'vacuum-into';
  } catch (err) {
    console.warn('VACUUM INTO unavailable, falling back to file copy:', err?.message || err);
    copyDbBundle(src, dest);
    method = 'copy-fallback';
  }
} else {
  copyDbBundle(src, dest);
}

verifySqlite(dest);
console.log('Backup written:', dest);
console.log('Method:', method);
if (method !== 'vacuum-into' && fs.existsSync(`${src}-wal`)) {
  console.warn('WAL present — prefer VACUUM INTO, or stop the API then re-run backup.');
}
console.log('Also archive CACHE_DIR (posts JSON + apify-quota.json).');
console.log('Escrow DATA_ENCRYPTION_KEY outside the same unencrypted archive.');
