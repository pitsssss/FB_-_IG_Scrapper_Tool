import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const script = path.join(root, 'scripts', 'backup-management.mjs');

describe('backup-management VACUUM INTO', () => {
  it('creates an integrity-ok snapshot and restores into an isolated dir', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'smp-bak-'));
    const managementDir = path.join(dir, 'management');
    const outDir = path.join(dir, 'out');
    const restoreDir = path.join(dir, 'restore');
    fs.mkdirSync(managementDir, { recursive: true });
    const src = path.join(managementDir, 'app.sqlite');
    const db = new DatabaseSync(src);
    db.exec(`
      PRAGMA journal_mode=WAL;
      CREATE TABLE admin_users (id INTEGER PRIMARY KEY, email TEXT);
      INSERT INTO admin_users (id, email) VALUES (1, 'backup@example.com');
    `);
    db.close();

    const bak = spawnSync(process.execPath, [script, '--management-dir', managementDir, '--out', outDir], {
      encoding: 'utf8',
    });
    assert.equal(bak.status, 0, bak.stderr || bak.stdout);
    assert.match(bak.stdout, /Method:\s*vacuum-into/);
    const files = fs.readdirSync(outDir).filter((f) => f.endsWith('.sqlite'));
    assert.equal(files.length, 1);
    const backupFile = path.join(outDir, files[0]);

    const restore = spawnSync(
      process.execPath,
      [script, '--restore', backupFile, '--management-dir', restoreDir],
      { encoding: 'utf8' },
    );
    assert.equal(restore.status, 0, restore.stderr || restore.stdout);
    const restored = new DatabaseSync(path.join(restoreDir, 'app.sqlite'), { readOnly: true });
    const row = restored.prepare('SELECT email FROM admin_users WHERE id = 1').get();
    restored.close();
    assert.equal(row.email, 'backup@example.com');

    // Refuse overwrite without --force
    const refuse = spawnSync(
      process.execPath,
      [script, '--restore', backupFile, '--management-dir', restoreDir],
      { encoding: 'utf8' },
    );
    assert.notEqual(refuse.status, 0);
  });
});
