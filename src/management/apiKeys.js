import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { isoNow } from './cryptoUtil.js';
import { parseFacebookUsername } from '../pageRef.js';
import { parseInstagramUsername } from '../instagramRef.js';

const NAME_RE = /^[a-zA-Z0-9._-]{2,64}$/;

function sha256Hex(value) {
  return createHash('sha256').update(String(value), 'utf8').digest('hex');
}

function sha256Buf(value) {
  return createHash('sha256').update(String(value), 'utf8').digest();
}

/** Generate smp_<8hex>_<32hex> style key. Prefix is non-secret identifier. */
export function generateApiKeyMaterial() {
  const prefix = randomBytes(4).toString('hex');
  const secret = randomBytes(24).toString('hex');
  const raw = `smp_${prefix}_${secret}`;
  return { raw, prefix: `smp_${prefix}`, hash: sha256Hex(raw) };
}

/**
 * Normalize UI scope entries into cache keys.
 * @param {{ facebook?: string[], instagram?: string[] }} scopes
 */
export function normalizeScopeInput(scopes = {}) {
  const keys = new Set();
  const errors = [];
  for (const u of scopes.facebook || []) {
    if (typeof u !== 'string' || !u.trim()) continue;
    const ref = parseFacebookUsername(u.trim());
    if (!ref) {
      errors.push(`Invalid Facebook username: ${String(u).slice(0, 40)}`);
      continue;
    }
    keys.add(ref.key);
  }
  for (const u of scopes.instagram || []) {
    if (typeof u !== 'string' || !u.trim()) continue;
    const ref = parseInstagramUsername(u.trim());
    if (!ref) {
      errors.push(`Invalid Instagram username: ${String(u).slice(0, 40)}`);
      continue;
    }
    keys.add(ref.key);
  }
  return { keys: [...keys], errors };
}

export function scopesToDto(cacheKeys) {
  const facebook = [];
  const instagram = [];
  for (const k of cacheKeys) {
    if (String(k).startsWith('instagram:')) {
      instagram.push(String(k).slice('instagram:'.length));
    } else {
      facebook.push(k);
    }
  }
  return { facebook, instagram };
}

export function createApiKeyService(db, { onChange } = {}) {
  const insertKey = db.prepare(`
    INSERT INTO managed_api_keys (client_name, key_prefix, key_hash, created_at, last_used_at, revoked_at)
    VALUES (?, ?, ?, ?, NULL, NULL)
  `);
  const byName = db.prepare('SELECT * FROM managed_api_keys WHERE client_name = ? COLLATE NOCASE');
  const byId = db.prepare('SELECT * FROM managed_api_keys WHERE id = ?');
  const listStmt = db.prepare(`
    SELECT id, client_name, key_prefix, created_at, last_used_at, revoked_at
    FROM managed_api_keys
    ORDER BY created_at DESC
  `);
  const revokeStmt = db.prepare(`
    UPDATE managed_api_keys SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL
  `);
  const rotateStmt = db.prepare(`
    UPDATE managed_api_keys SET key_prefix = ?, key_hash = ?, revoked_at = NULL WHERE id = ?
  `);
  const deleteScopes = db.prepare('DELETE FROM api_key_scopes WHERE key_id = ?');
  const insertScope = db.prepare('INSERT INTO api_key_scopes (key_id, cache_key) VALUES (?, ?)');
  const scopesFor = db.prepare('SELECT cache_key FROM api_key_scopes WHERE key_id = ?');
  const activeWithHash = db.prepare(`
    SELECT id, client_name, key_hash, revoked_at FROM managed_api_keys WHERE revoked_at IS NULL
  `);
  const touch = db.prepare('UPDATE managed_api_keys SET last_used_at = ? WHERE id = ?');
  const envNameCollision = (name, envNames) =>
    envNames.some((n) => n.toLowerCase() === String(name).toLowerCase());

  function notify() {
    if (typeof onChange === 'function') onChange();
  }

  function getScopes(keyId) {
    return scopesFor.all(keyId).map((r) => r.cache_key);
  }

  function setScopes(keyId, cacheKeys) {
    deleteScopes.run(keyId);
    for (const k of cacheKeys) insertScope.run(keyId, k);
  }

  function toMeta(row) {
    const cacheKeys = getScopes(row.id);
    return {
      id: row.id,
      clientName: row.client_name,
      keyPrefix: row.key_prefix,
      createdAt: row.created_at,
      lastUsedAt: row.last_used_at,
      revoked: Boolean(row.revoked_at),
      revokedAt: row.revoked_at || null,
      source: 'managed',
      scopes: scopesToDto(cacheKeys),
      scopeCount: cacheKeys.length,
    };
  }

  return {
    list() {
      return listStmt.all().map(toMeta);
    },

    get(id) {
      const row = byId.get(id);
      if (!row) return null;
      return toMeta(row);
    },

    create({ clientName, scopes, envClientNames = [] }) {
      if (typeof clientName !== 'string' || !NAME_RE.test(clientName.trim())) {
        return { ok: false, code: 'VALIDATION_ERROR', message: 'Client name must be 2–64 characters (letters, digits, . _ -)' };
      }
      const name = clientName.trim();
      if (envNameCollision(name, envClientNames)) {
        return { ok: false, code: 'NAME_COLLISION', message: 'Client name collides with an environment API_KEYS entry' };
      }
      if (byName.get(name)) {
        return { ok: false, code: 'NAME_COLLISION', message: 'A managed key with this client name already exists' };
      }
      const normalized = normalizeScopeInput(scopes);
      if (normalized.errors.length) {
        return { ok: false, code: 'VALIDATION_ERROR', message: normalized.errors[0] };
      }
      if (!normalized.keys.length) {
        return { ok: false, code: 'VALIDATION_ERROR', message: 'Select at least one Facebook or Instagram username scope' };
      }

      const material = generateApiKeyMaterial();
      const now = isoNow();
      db.exec('BEGIN IMMEDIATE;');
      try {
        if (byName.get(name)) {
          db.exec('ROLLBACK;');
          return { ok: false, code: 'NAME_COLLISION', message: 'A managed key with this client name already exists' };
        }
        const info = insertKey.run(name, material.prefix, material.hash, now);
        setScopes(Number(info.lastInsertRowid), normalized.keys);
        db.exec('COMMIT;');
        notify();
        const meta = toMeta(byId.get(Number(info.lastInsertRowid)));
        return { ok: true, key: material.raw, meta };
      } catch (err) {
        try { db.exec('ROLLBACK;'); } catch { /* ignore */ }
        if (String(err?.message || '').includes('UNIQUE')) {
          return { ok: false, code: 'NAME_COLLISION', message: 'A managed key with this client name already exists' };
        }
        throw err;
      }
    },

    revoke(id) {
      const row = byId.get(id);
      if (!row) return { ok: false, code: 'NOT_FOUND', message: 'API key not found' };
      if (row.revoked_at) return { ok: false, code: 'ALREADY_REVOKED', message: 'API key is already revoked' };
      revokeStmt.run(isoNow(), id);
      notify();
      return { ok: true, meta: toMeta(byId.get(id)) };
    },

    rotate(id) {
      const row = byId.get(id);
      if (!row) return { ok: false, code: 'NOT_FOUND', message: 'API key not found' };
      if (row.revoked_at) return { ok: false, code: 'ALREADY_REVOKED', message: 'Cannot rotate a revoked key' };
      const material = generateApiKeyMaterial();
      db.exec('BEGIN IMMEDIATE;');
      try {
        rotateStmt.run(material.prefix, material.hash, id);
        db.exec('COMMIT;');
      } catch (err) {
        try { db.exec('ROLLBACK;'); } catch { /* ignore */ }
        throw err;
      }
      notify();
      return { ok: true, key: material.raw, meta: toMeta(byId.get(id)) };
    },

    updateScopes(id, scopes) {
      const row = byId.get(id);
      if (!row) return { ok: false, code: 'NOT_FOUND', message: 'API key not found' };
      if (row.revoked_at) return { ok: false, code: 'ALREADY_REVOKED', message: 'Cannot update scopes on a revoked key' };
      const normalized = normalizeScopeInput(scopes);
      if (normalized.errors.length) {
        return { ok: false, code: 'VALIDATION_ERROR', message: normalized.errors[0] };
      }
      if (!normalized.keys.length) {
        return { ok: false, code: 'VALIDATION_ERROR', message: 'Select at least one Facebook or Instagram username scope' };
      }
      db.exec('BEGIN IMMEDIATE;');
      try {
        setScopes(id, normalized.keys);
        db.exec('COMMIT;');
      } catch (err) {
        try { db.exec('ROLLBACK;'); } catch { /* ignore */ }
        throw err;
      }
      notify();
      return { ok: true, meta: toMeta(byId.get(id)) };
    },

    /** Snapshot for hot-reload authenticator (hashes only). */
    activeSnapshot() {
      const rows = activeWithHash.all();
      return rows.map((r) => ({
        id: r.id,
        name: r.client_name,
        hash: Buffer.from(r.key_hash, 'hex'),
        scopes: new Set(getScopes(r.id)),
        source: 'managed',
      }));
    },

    markUsed(id) {
      try { touch.run(isoNow(), id); } catch { /* ignore */ }
    },

    verifyRawKey(raw) {
      if (!raw || typeof raw !== 'string') return null;
      const hashHex = sha256Hex(raw);
      const given = sha256Buf(raw);
      for (const row of activeWithHash.all()) {
        const expected = Buffer.from(row.key_hash, 'hex');
        if (expected.length === given.length && timingSafeEqual(expected, given)) {
          return { id: row.id, name: row.client_name, hashHex, source: 'managed' };
        }
      }
      return null;
    },
  };
}
