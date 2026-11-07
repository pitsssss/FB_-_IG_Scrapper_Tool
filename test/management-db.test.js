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
    assert.equal(versions.length, MANAGEMENT_SCHEMA_VERSION);
    assert.equal(Math.max(...versions.map((v) => v.version)), MANAGEMENT_SCHEMA_VERSION);
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
    ).all().map((r) => r.name);
    for (const t of [
      'admin_users', 'admin_sessions', 'bootstrap_state', 'auth_events', 'schema_migrations', 'auth_rate_limits',
      'provider_credentials', 'managed_api_keys', 'api_key_scopes', 'management_audit_events',
      'email_otp_challenges', 'totp_pending', 'recovery_code_hashes', 'totp_used_steps',
      'playground_confirmations',
    ]) {
      assert.ok(tables.includes(t), `missing table ${t}`);
    }
    const adminCols = db.prepare('PRAGMA table_info(admin_users)').all().map((r) => r.name);
    assert.ok(adminCols.includes('email'));
    assert.ok(adminCols.includes('totp_enabled'));
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
      email: 'admin@example.com',
      username: 'admin',
      password: 'correct-horse-battery',
      confirmPassword: 'correct-horse-battery',
    });
    assert.equal(denied.ok, false);

    const ok = await boot.complete({
      setupToken: token,
      email: 'admin@example.com',
      username: 'Admin',
      password: 'correct-horse-battery',
      confirmPassword: 'correct-horse-battery',
    });
    assert.equal(ok.ok, true);
    assert.equal(ok.admin.username, 'admin');
    assert.equal(ok.admin.email, 'admin@example.com');
    assert.equal(boot.status(), 'completed');

    const again = await boot.complete({
      setupToken: token,
      email: 'other@example.com',
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
      email: 'admin@example.com',
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
      boot.complete({ ...payload, email: 'a1@example.com', username: 'admin1' }),
      boot.complete({ ...payload, email: 'a2@example.com', username: 'admin2' }),
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
