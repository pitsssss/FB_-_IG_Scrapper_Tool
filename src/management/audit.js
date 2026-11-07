import { isoNow } from './cryptoUtil.js';

export function createAuditLogger(db) {
  const insert = db.prepare(`
    INSERT INTO management_audit_events (at, event, admin_username, target_type, target_id, outcome, meta_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  return {
    record({ event, adminUsername = null, targetType = null, targetId = null, outcome = 'ok', meta = null }) {
      try {
        insert.run(
          isoNow(),
          event,
          adminUsername,
          targetType,
          targetId == null ? null : String(targetId),
          outcome,
          meta ? JSON.stringify(meta) : null,
        );
      } catch {
        /* never break management on audit failure */
      }
    },
  };
}
