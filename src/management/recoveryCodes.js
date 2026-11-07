import { randomBytes } from 'node:crypto';
import { sha256Hex, isoNow } from './cryptoUtil.js';

export function generateRecoveryCodes(count = 10) {
  const codes = [];
  for (let i = 0; i < count; i += 1) {
    const raw = randomBytes(5).toString('hex');
    codes.push(`${raw.slice(0, 5)}-${raw.slice(5)}`);
  }
  return codes;
}

export function createRecoveryCodeService(db) {
  const clear = db.prepare('DELETE FROM recovery_code_hashes WHERE admin_id = ?');
  const insert = db.prepare(`
    INSERT INTO recovery_code_hashes (admin_id, code_hash, created_at, used_at)
    VALUES (?, ?, ?, NULL)
  `);
  const unused = db.prepare(`
    SELECT * FROM recovery_code_hashes WHERE admin_id = ? AND used_at IS NULL
  `);
  const markUsed = db.prepare(`
    UPDATE recovery_code_hashes SET used_at = ? WHERE id = ? AND used_at IS NULL
  `);
  const markGenerated = db.prepare(`
    UPDATE admin_users SET recovery_codes_generated_at = ?, updated_at = ? WHERE id = ?
  `);

  return {
    replaceAll(adminId, codes) {
      const now = isoNow();
      db.exec('BEGIN IMMEDIATE;');
      try {
        clear.run(adminId);
        for (const code of codes) {
          insert.run(adminId, sha256Hex(normalizeCode(code)), now);
        }
        markGenerated.run(now, now, adminId);
        db.exec('COMMIT;');
      } catch (err) {
        try { db.exec('ROLLBACK;'); } catch { /* ignore */ }
        throw err;
      }
    },

    remaining(adminId) {
      return unused.all(adminId).length;
    },

    consume(adminId, code) {
      const hash = sha256Hex(normalizeCode(code));
      const rows = unused.all(adminId);
      const row = rows.find((r) => r.code_hash === hash);
      if (!row) return false;
      const info = markUsed.run(isoNow(), row.id);
      return info.changes > 0;
    },
  };
}

function normalizeCode(code) {
  return String(code || '').trim().toLowerCase().replace(/\s+/g, '');
}
