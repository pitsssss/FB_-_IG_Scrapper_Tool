import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

/**
 * Safe cache / quota inspection for admin (read-only).
 * Never returns file absolute paths or full post bodies.
 */

function ageSeconds(iso, nowMs = Date.now()) {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((nowMs - t) / 1000));
}

function classifyFreshness(fetchedAt, freshTtlMs, nowMs = Date.now()) {
  if (!fetchedAt || !freshTtlMs) return 'unknown';
  const t = Date.parse(fetchedAt);
  if (!Number.isFinite(t)) return 'unknown';
  return nowMs - t <= freshTtlMs ? 'fresh' : 'stale';
}

function parsePlatformUsername(cacheKey) {
  if (String(cacheKey).startsWith('instagram:')) {
    return { platform: 'instagram', username: String(cacheKey).slice('instagram:'.length) };
  }
  return { platform: 'facebook', username: cacheKey };
}

export async function listCacheEntries({ cacheDir, freshTtlMs, limit = 200 } = {}) {
  if (!cacheDir) return { entries: [], truncated: false };
  let names;
  try {
    names = await fs.readdir(cacheDir);
  } catch {
    return { entries: [], truncated: false };
  }

  const entries = [];
  for (const name of names) {
    if (!name.endsWith('.json')) continue;
    if (name === 'apify-quota.json') continue;
    if (name.includes('instagram-profiles')) continue;
    const full = path.join(cacheDir, name);
    try {
      const raw = await fs.readFile(full, 'utf8');
      const value = JSON.parse(raw);
      if (!value || !value.key || !Array.isArray(value.posts)) continue;
      // Skip profile meta directories accidentally
      const { platform, username } = parsePlatformUsername(value.key);
      const fetchedAt = value.fetched_at || value.fetchedAt || null;
      entries.push({
        id: createHash('sha1').update(value.key).digest('hex').slice(0, 12),
        platform,
        username,
        postCount: value.posts.length,
        fetchedAt,
        ageSeconds: ageSeconds(fetchedAt),
        freshness: classifyFreshness(fetchedAt, freshTtlMs),
        source: value.source || null,
      });
    } catch {
      /* skip corrupt */
    }
    if (entries.length >= limit) {
      return { entries, truncated: true };
    }
  }

  entries.sort((a, b) => String(b.fetchedAt || '').localeCompare(String(a.fetchedAt || '')));
  return { entries, truncated: false };
}

export function sanitizeQuotaStatus(raw, { dailyLimit, maxChargeUsdPerRun } = {}) {
  if (!raw) {
    return {
      available: false,
      dailyLimit: dailyLimit ?? null,
      consumed: null,
      remaining: null,
      todayUtc: null,
      paidExecutionAllowed: false,
      note: 'Local quota status is unavailable',
    };
  }
  return {
    available: Boolean(raw.readable) && !raw.untrusted,
    dailyLimit: raw.dailyLimit,
    consumed: raw.consumed,
    remaining: raw.remaining,
    todayUtc: raw.todayUtc,
    stateUtcDate: raw.stateUtcDate,
    paidExecutionAllowed: Boolean(raw.allowed),
    maxChargeUsdPerRun: maxChargeUsdPerRun ?? null,
    note: 'This is the local attempt budget, not Apify account spend or remaining dollars.',
  };
}
