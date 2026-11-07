import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export const MANAGEMENT_SCHEMA_VERSION = 5;

const MIGRATIONS = [
  {
    version: 1,
    sql: `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_users (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  password_algo TEXT NOT NULL,
  password_params TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bootstrap_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  setup_completed_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash TEXT NOT NULL UNIQUE,
  admin_id INTEGER NOT NULL REFERENCES admin_users(id),
  csrf_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  absolute_expires_at TEXT NOT NULL,
  idle_expires_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  user_agent_hash TEXT,
  revoked_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_admin_sessions_token ON admin_sessions(token_hash);

CREATE TABLE IF NOT EXISTS auth_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  event TEXT NOT NULL,
  username TEXT,
  ip_hash TEXT,
  meta_json TEXT
);

CREATE TABLE IF NOT EXISTS auth_rate_limits (
  bucket_key TEXT PRIMARY KEY,
  window_start_ms INTEGER NOT NULL,
  count INTEGER NOT NULL
);
`,
  },
  {
    version: 2,
    sql: `
CREATE TABLE IF NOT EXISTS provider_credentials (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  provider TEXT NOT NULL DEFAULT 'apify',
  status TEXT NOT NULL,
  format_version INTEGER NOT NULL DEFAULT 1,
  key_version INTEGER NOT NULL DEFAULT 1,
  ciphertext BLOB,
  nonce BLOB,
  auth_tag BLOB,
  username_hint TEXT,
  last_verified_at TEXT,
  last_verify_ok INTEGER,
  last_verify_code TEXT,
  disconnected_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS managed_api_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  last_used_at TEXT,
  revoked_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_managed_api_keys_hash ON managed_api_keys(key_hash);

CREATE TABLE IF NOT EXISTS api_key_scopes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key_id INTEGER NOT NULL REFERENCES managed_api_keys(id) ON DELETE CASCADE,
  cache_key TEXT NOT NULL,
  UNIQUE(key_id, cache_key)
);

CREATE INDEX IF NOT EXISTS idx_api_key_scopes_key ON api_key_scopes(key_id);

CREATE TABLE IF NOT EXISTS management_audit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  event TEXT NOT NULL,
  admin_username TEXT,
  target_type TEXT,
  target_id TEXT,
  outcome TEXT NOT NULL,
  meta_json TEXT
);
`,
  },
  {
    version: 3,
    sql: `
-- Additive admin identity / MFA columns (SQLite ignores IF NOT EXISTS on ADD COLUMN;
-- applyColumnMigrations runs defensive ALTERs before/after this block).
CREATE TABLE IF NOT EXISTS email_otp_challenges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id INTEGER NOT NULL REFERENCES admin_users(id),
  purpose TEXT NOT NULL,
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  attempts INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS totp_pending (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  admin_id INTEGER NOT NULL REFERENCES admin_users(id),
  ciphertext BLOB NOT NULL,
  nonce BLOB NOT NULL,
  auth_tag BLOB NOT NULL,
  format_version INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS recovery_code_hashes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id INTEGER NOT NULL REFERENCES admin_users(id),
  code_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  used_at TEXT
);

CREATE TABLE IF NOT EXISTS totp_used_steps (
  admin_id INTEGER NOT NULL,
  step INTEGER NOT NULL,
  used_at TEXT NOT NULL,
  PRIMARY KEY (admin_id, step)
);
`,
  },
  {
    version: 4,
    sql: `
CREATE TABLE IF NOT EXISTS playground_confirmations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash TEXT NOT NULL UNIQUE,
  admin_id INTEGER NOT NULL REFERENCES admin_users(id),
  session_id INTEGER NOT NULL,
  platform TEXT NOT NULL,
  username TEXT NOT NULL,
  cache_key TEXT NOT NULL,
  limit_n INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_playground_confirmations_admin
  ON playground_confirmations(admin_id, consumed_at);
`,
  },
  {
    version: 5,
    sql: `
CREATE TABLE IF NOT EXISTS management_settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT
);

CREATE TABLE IF NOT EXISTS operational_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  category TEXT NOT NULL,
  outcome TEXT NOT NULL,
  platform TEXT,
  client_name TEXT,
  http_status INTEGER,
  duration_ms INTEGER,
  source TEXT,
  meta_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_operational_events_at ON operational_events(at);
CREATE INDEX IF NOT EXISTS idx_operational_events_category ON operational_events(category, at);
`,
  },
];

/** Columns added in v3 — applied idempotently via PRAGMA table_info. */
const V3_ADMIN_USER_COLUMNS = [
  ['email', 'TEXT'],
  ['email_verified_at', 'TEXT'],
  ['email_pending', 'TEXT'],
  ['totp_enabled', 'INTEGER NOT NULL DEFAULT 0'],
  ['totp_ciphertext', 'BLOB'],
  ['totp_nonce', 'BLOB'],
  ['totp_auth_tag', 'BLOB'],
  ['totp_format_version', 'INTEGER'],
  ['totp_confirmed_at', 'TEXT'],
  ['recovery_codes_generated_at', 'TEXT'],
];

const V3_SESSION_COLUMNS = [
  ['auth_level', "TEXT NOT NULL DEFAULT 'full'"],
  ['mfa_pending', 'INTEGER NOT NULL DEFAULT 0'],
];

function tableColumns(db, table) {
  return new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((r) => r.name));
}

function ensureColumns(db, table, columns) {
  const existing = tableColumns(db, table);
  for (const [name, typeSql] of columns) {
    if (existing.has(name)) continue;
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${typeSql}`);
  }
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  try {
    fs.chmodSync(dir, 0o700);
  } catch {
    /* Windows may ignore mode */
  }
}

function restrictFile(filePath) {
  try {
    fs.chmodSync(filePath, 0o600);
  } catch {
    /* ignore */
  }
}

/**
 * Open (or create) the management SQLite database.
 * @param {string} managementDir
 * @returns {{ db: DatabaseSync, path: string, close: () => void }}
 */
export function openManagementDb(managementDir) {
  if (!managementDir || typeof managementDir !== 'string') {
    throw new Error('managementDir is required');
  }
  ensureDir(managementDir);
  const dbPath = path.join(managementDir, 'app.sqlite');
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA busy_timeout = 5000;');
  applyMigrations(db);
  restrictFile(dbPath);
  return {
    db,
    path: dbPath,
    close() {
      try { db.close(); } catch { /* ignore */ }
    },
  };
}

export function applyMigrations(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);
  const applied = new Set(
    db.prepare('SELECT version FROM schema_migrations').all().map((r) => r.version),
  );
  for (const migration of MIGRATIONS) {
    if (applied.has(migration.version)) continue;
    db.exec('BEGIN IMMEDIATE;');
    try {
      if (migration.version === 3) {
        ensureColumns(db, 'admin_users', V3_ADMIN_USER_COLUMNS);
        ensureColumns(db, 'admin_sessions', V3_SESSION_COLUMNS);
      }
      db.exec(migration.sql);
      if (migration.version === 3) {
        db.exec(`
          CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_users_email
          ON admin_users(email) WHERE email IS NOT NULL;
        `);
      }
      db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(
        migration.version,
        new Date().toISOString(),
      );
      db.exec('COMMIT;');
    } catch (err) {
      try { db.exec('ROLLBACK;'); } catch { /* ignore */ }
      throw err;
    }
  }

  // Idempotent column ensure (safe no-ops when columns already exist).
  try {
    if (tableColumns(db, 'admin_users').has('id')) {
      ensureColumns(db, 'admin_users', V3_ADMIN_USER_COLUMNS);
      ensureColumns(db, 'admin_sessions', V3_SESSION_COLUMNS);
      db.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_users_email
        ON admin_users(email) WHERE email IS NOT NULL;
      `);
    }
  } catch {
    /* ignore */
  }
}

export function integrityCheck(db) {
  const row = db.prepare('PRAGMA integrity_check').get();
  const ok = row && (row.integrity_check === 'ok' || Object.values(row)[0] === 'ok');
  if (!ok) throw new Error('Management database failed integrity_check');
  return true;
}
