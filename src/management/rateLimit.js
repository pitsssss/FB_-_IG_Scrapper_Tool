/**
 * Durable SQLite-backed rate limiter for auth endpoints.
 * Keys are opaque hashes (IP / username) — never store raw IPs in cleartext in MVP logs.
 */

export function createRateLimiter(db, defaults = {}) {
  const windowMs = defaults.windowMs ?? 15 * 60 * 1000;
  const max = defaults.max ?? 10;

  const getStmt = db.prepare('SELECT window_start_ms, count FROM auth_rate_limits WHERE bucket_key = ?');
  const upsertStmt = db.prepare(`
    INSERT INTO auth_rate_limits (bucket_key, window_start_ms, count)
    VALUES (@key, @start, @count)
    ON CONFLICT(bucket_key) DO UPDATE SET
      window_start_ms = excluded.window_start_ms,
      count = excluded.count
  `);
  const delStmt = db.prepare('DELETE FROM auth_rate_limits WHERE bucket_key = ?');

  return {
    /**
     * @returns {{ allowed: boolean, remaining: number, retryAfterSec: number }}
     */
    check(bucketKey, opts = {}) {
      const w = opts.windowMs ?? windowMs;
      const m = opts.max ?? max;
      const now = opts.nowMs ?? Date.now();
      const row = getStmt.get(bucketKey);
      if (!row || now - row.window_start_ms >= w) {
        upsertStmt.run({ key: bucketKey, start: now, count: 1 });
        return { allowed: true, remaining: m - 1, retryAfterSec: Math.ceil(w / 1000) };
      }
      if (row.count >= m) {
        const retryAfterSec = Math.max(1, Math.ceil((row.window_start_ms + w - now) / 1000));
        return { allowed: false, remaining: 0, retryAfterSec };
      }
      upsertStmt.run({ key: bucketKey, start: row.window_start_ms, count: row.count + 1 });
      return { allowed: true, remaining: m - (row.count + 1), retryAfterSec: Math.ceil((row.window_start_ms + w - now) / 1000) };
    },
    reset(bucketKey) {
      delStmt.run(bucketKey);
    },
  };
}
