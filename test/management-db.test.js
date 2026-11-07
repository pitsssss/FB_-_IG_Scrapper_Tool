import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openManagementDb, MANAGEMENT_SCHEMA_VERSION, integrityCheck } from '../src/management/db.js';
import { hashPassword, verifyPassword, validatePassword, validateUsername } from '../src/management/passwords.js';
import { createBootstrapService } from '../src/management/bootstrap.js';

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mgmt-'));
}

test('management db migrates and passes integrity check', () => {
  const dir = tmpDir();
  const { db, path: dbPath, close } = openManagementDb(dir);
  try {
    assert.ok(fs.existsSync(dbPath));
    integrityCheck(db);
    const versions = db.prepare('SELECT version FROM schema_migrations').all();
    assert.equal(versions.length, 1);
    assert.equal(versions[0].version, MANAGEMENT_SCHEMA_VERSION);
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
    ).all().map((r) => r.name);
    for (const t of ['admin_users', 'admin_sessions', 'bootstrap_state', 'auth_events', 'schema_migrations', 'auth_rate_limits']) {
      assert.ok(tables.includes(t), `missing table ${t}`);
    }
  } finally {
    close();
  }
});

test('password hashing uses scrypt and verifies', async () => {
  assert.equal(validatePassword('short').ok, false);
  assert.equal(validateUsername('ab').ok, false);
  assert.equal(validateUsername('Admin_User').ok, true);

  const hashed = await hashPassword('correct-horse-battery');
  assert.equal(hashed.algo, 'scrypt');
  assert.ok(hashed.params.salt);
  assert.equal(await verifyPassword('correct-horse-battery', hashed), true);
  assert.equal(await verifyPassword('wrong-password-xx', hashed), false);
});

test('bootstrap requires token and creates exactly one admin', async () => {
  const dir = tmpDir();
  const { db, close } = openManagementDb(dir);
  try {
    const token = 'bootstrap-test-token-32chars-min!!';
    const boot = createBootstrapService(db, { getSetupToken: () => token });
    assert.equal(boot.status(), 'ready');

    const denied = await boot.complete({
      setupToken: 'wrong',
      username: 'admin',
      password: 'correct-horse-battery',
      confirmPassword: 'correct-horse-battery',
    });
    assert.equal(denied.ok, false);

    const ok = await boot.complete({
      setupToken: token,
      username: 'Admin',
      password: 'correct-horse-battery',
      confirmPassword: 'correct-horse-battery',
    });
    assert.equal(ok.ok, true);
    assert.equal(ok.admin.username, 'admin');
    assert.equal(boot.status(), 'completed');

    const again = await boot.complete({
      setupToken: token,
      username: 'other',
      password: 'correct-horse-battery',
      confirmPassword: 'correct-horse-battery',
    });
    assert.equal(again.ok, false);
    assert.equal(again.code, 'SETUP_COMPLETED');
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM admin_users').get().c, 1);
  } finally {
    close();
  }
});

test('bootstrap fails closed without token', async () => {
  const dir = tmpDir();
  const { db, close } = openManagementDb(dir);
  try {
    const boot = createBootstrapService(db, { getSetupToken: () => '' });
    assert.equal(boot.status(), 'needs_token');
    const r = await boot.complete({
      setupToken: 'anything-long-enough',
      username: 'admin',
      password: 'correct-horse-battery',
      confirmPassword: 'correct-horse-battery',
    });
    assert.equal(r.ok, false);
    assert.equal(r.code, 'SETUP_NOT_CONFIGURED');
  } finally {
    close();
  }
});

test('concurrent bootstrap only one wins', async () => {
  const dir = tmpDir();
  const { db, close } = openManagementDb(dir);
  try {
    const token = 'bootstrap-race-token-32chars-min!!!';
    const boot = createBootstrapService(db, { getSetupToken: () => token });
    const payload = {
      setupToken: token,
      password: 'correct-horse-battery',
      confirmPassword: 'correct-horse-battery',
    };
    const results = await Promise.all([
      boot.complete({ ...payload, username: 'admin1' }),
      boot.complete({ ...payload, username: 'admin2' }),
    ]);
    const wins = results.filter((r) => r.ok);
    const losses = results.filter((r) => !r.ok);
    assert.equal(wins.length, 1);
    assert.equal(losses.length, 1);
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM admin_users').get().c, 1);
  } finally {
    close();
  }
});
