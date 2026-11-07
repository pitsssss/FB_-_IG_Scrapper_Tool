/**
 * Bounded local operational event telemetry (not billing).
 * Failures to write must never break the posts API.
 */

export const TELEMETRY_RETENTION_DAYS = 30;
export const TELEMETRY_MAX_ROWS = 20_000;
export const TELEMETRY_META_MAX_CHARS = 512;

const ALLOWED_CATEGORIES = new Set([
  'public_request',
  'provider_attempt',
  'provider_failure',
  'cache_hit',
  'stale_cache',
  'live_response',
  'rate_limited',
  'unauthorized',
  'forbidden',
  'playground_cache',
  'playground_prepare',
  'playground_confirm',
  'playground_cancel',
  'quota_reservation',
  'cache_delete',
  'settings_change',
  'admin_action',
]);

function safeClientName(name) {
  if (!name || typeof name !== 'string') return null;
  return name.slice(0, 64);
}

function safeMeta(meta) {
  if (!meta || typeof meta !== 'object') return null;
  const scrubbed = {};
  for (const [k, v] of Object.entries(meta)) {
    const key = String(k).toLowerCase();
    if (
      key.includes('token')
      || key.includes('password')
      || key.includes('secret')
      || key.includes('cookie')
      || key.includes('authorization')
      || key.includes('apify')
      || key === 'key'
    ) {
      continue;
    }
    if (typeof v === 'string') scrubbed[k] = v.slice(0, 120);
    else if (typeof v === 'number' || typeof v === 'boolean' || v === null) scrubbed[k] = v;
  }
  let json = JSON.stringify(scrubbed);
  if (json.length > TELEMETRY_META_MAX_CHARS) {
    json = JSON.stringify({ truncated: true });
  }
  return json;
}

export function createTelemetry(db, {
  retentionDays = TELEMETRY_RETENTION_DAYS,
  maxRows = TELEMETRY_MAX_ROWS,
} = {}) {
  let writeFailures = 0;
  let lastFailureLogAt = 0;

  function prune() {
    const cutoff = new Date(Date.now() - retentionDays * 86400_000).toISOString();
    db.prepare('DELETE FROM operational_events WHERE at < ?').run(cutoff);
    const count = db.prepare('SELECT COUNT(*) AS c FROM operational_events').get()?.c || 0;
    if (count > maxRows) {
      const excess = count - maxRows;
      db.prepare(`
        DELETE FROM operational_events
        WHERE id IN (
          SELECT id FROM operational_events ORDER BY at ASC LIMIT ?
        )
      `).run(excess);
    }
  }

  function record({
    category,
    outcome = 'ok',
    platform = null,
    clientName = null,
    httpStatus = null,
    durationMs = null,
    source = null,
    meta = null,
  } = {}) {
    try {
      if (!ALLOWED_CATEGORIES.has(category)) return false;
      const at = new Date().toISOString();
      db.prepare(`
        INSERT INTO operational_events
          (at, category, outcome, platform, client_name, http_status, duration_ms, source, meta_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        at,
        category,
        String(outcome || 'ok').slice(0, 32),
        platform ? String(platform).slice(0, 16) : null,
        safeClientName(clientName),
        Number.isInteger(httpStatus) ? httpStatus : null,
        Number.isInteger(durationMs) ? Math.max(0, durationMs) : null,
        source ? String(source).slice(0, 32) : null,
        safeMeta(meta),
      );
      if (Math.random() < 0.02) prune();
      return true;
    } catch (err) {
      writeFailures += 1;
      const now = Date.now();
      if (now - lastFailureLogAt > 60_000) {
        lastFailureLogAt = now;
        console.error('[telemetry] write failed (posts API continues):', err?.message || err);
      }
      return false;
    }
  }

  function periodStart(period) {
    const now = Date.now();
    if (period === '7d') return new Date(now - 7 * 86400_000).toISOString();
    if (period === '30d') return new Date(now - 30 * 86400_000).toISOString();
    // today UTC
    return `${new Date(now).toISOString().slice(0, 10)}T00:00:00.000Z`;
  }

  function summarize(period = 'today') {
    const since = periodStart(period);
    const rows = db.prepare(`
      SELECT category, outcome, COUNT(*) AS c
      FROM operational_events
      WHERE at >= ?
      GROUP BY category, outcome
    `).all(since);

    const counts = {
      publicRequests: 0,
      facebookRequests: 0,
      instagramRequests: 0,
      cacheHits: 0,
      staleCache: 0,
      liveResponses: 0,
      providerAttempts: 0,
      providerFailures: 0,
      rateLimited: 0,
      unauthorized: 0,
      forbidden: 0,
      playgroundCache: 0,
      playgroundConfirm: 0,
      quotaReservations: 0,
      cacheDeletes: 0,
    };

    for (const row of rows) {
      const n = row.c || 0;
      switch (row.category) {
        case 'public_request':
          counts.publicRequests += n;
          break;
        case 'cache_hit':
          counts.cacheHits += n;
          break;
        case 'stale_cache':
          counts.staleCache += n;
          break;
        case 'live_response':
          counts.liveResponses += n;
          break;
        case 'provider_attempt':
          counts.providerAttempts += n;
          break;
        case 'provider_failure':
          counts.providerFailures += n;
          break;
        case 'rate_limited':
          counts.rateLimited += n;
          break;
        case 'unauthorized':
          counts.unauthorized += n;
          break;
        case 'forbidden':
          counts.forbidden += n;
          break;
        case 'playground_cache':
          counts.playgroundCache += n;
          break;
        case 'playground_confirm':
          counts.playgroundConfirm += n;
          break;
        case 'quota_reservation':
          counts.quotaReservations += n;
          break;
        case 'cache_delete':
          counts.cacheDeletes += n;
          break;
        default:
          break;
      }
    }

    const platformRows = db.prepare(`
      SELECT platform, COUNT(*) AS c
      FROM operational_events
      WHERE at >= ? AND category = 'public_request' AND platform IS NOT NULL
      GROUP BY platform
    `).all(since);
    for (const row of platformRows) {
      if (row.platform === 'facebook') counts.facebookRequests = row.c;
      if (row.platform === 'instagram') counts.instagramRequests = row.c;
    }

    return {
      period,
      since,
      until: new Date().toISOString(),
      counts,
      note: 'Local operational counters since telemetry began. Not Apify billing. Cache hits are not provider attempts.',
      collectionStartedNote: 'Only events recorded after this feature was enabled are available — no historical backfill.',
    };
  }

  function listEvents({ period = 'today', limit = 50, offset = 0 } = {}) {
    const since = periodStart(period);
    const lim = Math.min(Math.max(Number(limit) || 50, 1), 200);
    const off = Math.max(Number(offset) || 0, 0);
    const rows = db.prepare(`
      SELECT id, at, category, outcome, platform, client_name, http_status, duration_ms, source, meta_json
      FROM operational_events
      WHERE at >= ?
      ORDER BY at DESC
      LIMIT ? OFFSET ?
    `).all(since, lim, off);

    return {
      period,
      since,
      events: rows.map((r) => ({
        id: r.id,
        at: r.at,
        category: r.category,
        outcome: r.outcome,
        platform: r.platform,
        clientName: r.client_name,
        httpStatus: r.http_status,
        durationMs: r.duration_ms,
        source: r.source,
        meta: (() => {
          try { return r.meta_json ? JSON.parse(r.meta_json) : null; } catch { return null; }
        })(),
      })),
    };
  }

  return {
    record,
    summarize,
    listEvents,
    prune,
    get writeFailures() { return writeFailures; },
  };
}
