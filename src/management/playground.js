import { randomToken, sha256Hex, isoNow } from './cryptoUtil.js';
import { parseFacebookUsername } from '../pageRef.js';
import { parseInstagramUsername } from '../instagramRef.js';
import { ServiceError } from '../errors.js';

export const PLAYGROUND_CONFIRM_TTL_MS = 2 * 60 * 1000;

/**
 * Admin playground: cache-only reads + prepare/confirm live refresh.
 */
export function createPlaygroundService({
  db,
  service,
  config,
  getProviderStatus,
  audit,
}) {
  const insertConfirm = db.prepare(`
    INSERT INTO playground_confirmations
      (token_hash, admin_id, session_id, platform, username, cache_key, limit_n, created_at, expires_at, consumed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
  `);
  const getConfirm = db.prepare(`
    SELECT * FROM playground_confirmations WHERE token_hash = ?
  `);
  const consumeConfirm = db.prepare(`
    UPDATE playground_confirmations
    SET consumed_at = ?
    WHERE id = ? AND consumed_at IS NULL AND expires_at > ?
  `);
  const forceConsume = db.prepare(`
    UPDATE playground_confirmations
    SET consumed_at = ?
    WHERE id = ? AND consumed_at IS NULL
  `);
  const expireOpen = db.prepare(`
    UPDATE playground_confirmations
    SET consumed_at = ?
    WHERE admin_id = ? AND consumed_at IS NULL AND expires_at <= ?
  `);

  function parsePlatformUsername(platform, username) {
    const p = String(platform || '').toLowerCase().trim();
    if (p !== 'facebook' && p !== 'instagram') {
      return { ok: false, code: 'VALIDATION_ERROR', message: 'Platform must be facebook or instagram' };
    }
    const raw = typeof username === 'string' ? username : '';
    const ref = p === 'instagram' ? parseInstagramUsername(raw) : parseFacebookUsername(raw);
    if (!ref) {
      return { ok: false, code: 'VALIDATION_ERROR', message: 'Invalid username for platform' };
    }
    return { ok: true, platform: p, ref };
  }

  function parseLimit(limit) {
    const max = Number.isInteger(config.maxPosts) && config.maxPosts > 0 ? config.maxPosts : 10;
    const n = Number.parseInt(String(limit ?? 10), 10);
    if (!Number.isInteger(n) || n < 1 || n > max) {
      return { ok: false, code: 'VALIDATION_ERROR', message: `Limit must be an integer between 1 and ${max}`, max };
    }
    return { ok: true, limit: n, max };
  }

  function enforceAllowlist(ref) {
    const isIg = ref.platform === 'instagram' || String(ref.key || '').startsWith('instagram:');
    if (isIg) {
      const allow = config.instagramAllowedProfiles || [];
      if (allow.length && !allow.includes(ref.key)) {
        return { ok: false, code: 'FORBIDDEN_ACCOUNT', message: 'Username is not in INSTAGRAM_ALLOWED_PROFILES' };
      }
    } else {
      const allow = config.allowedPages || [];
      if (allow.length && !allow.includes(ref.key)) {
        return { ok: false, code: 'FORBIDDEN_ACCOUNT', message: 'Username is not in ALLOWED_PAGES' };
      }
    }
    return { ok: true };
  }

  function apifyReady() {
    const status = typeof getProviderStatus === 'function' ? getProviderStatus() : null;
    if (!status) {
      return { ready: false, code: 'PROVIDER_UNAVAILABLE', message: 'Provider status unavailable' };
    }
    if (!status.connected) {
      return {
        ready: false,
        code: 'PROVIDER_NOT_CONNECTED',
        message: 'Apify is not connected. Connect a token under Providers before live refresh.',
        status,
      };
    }
    return { ready: true, status };
  }

  async function quotaSnapshot() {
    const quota = service?.quota;
    if (!quota || typeof quota.getStatus !== 'function') {
      return {
        available: false,
        paidExecutionAllowed: false,
        note: 'Local quota status is unavailable',
      };
    }
    const raw = await quota.getStatus();
    return {
      available: Boolean(raw?.readable) && !raw?.untrusted,
      dailyLimit: raw?.dailyLimit ?? config.apify?.dailyRunLimit ?? null,
      consumed: raw?.consumed ?? null,
      remaining: raw?.remaining ?? null,
      todayUtc: raw?.todayUtc ?? null,
      paidExecutionAllowed: Boolean(raw?.allowed),
      maxChargeUsdPerRun: config.apify?.maxChargeUsdPerRun ?? null,
      note: 'This is the local attempt budget, not Apify account spend or remaining dollars.',
    };
  }

  return {
    parsePlatformUsername,
    parseLimit,
    enforceAllowlist,

    async readCache({ platform, username, limit }) {
      const parsed = parsePlatformUsername(platform, username);
      if (!parsed.ok) return { ok: false, http: 400, code: parsed.code, message: parsed.message };
      const lim = parseLimit(limit);
      if (!lim.ok) return { ok: false, http: 400, code: lim.code, message: lim.message };
      const allow = enforceAllowlist(parsed.ref);
      if (!allow.ok) return { ok: false, http: 403, code: allow.code, message: allow.message };

      try {
        const body = await service.peekCachedPosts(parsed.ref, lim.limit);
        return {
          ok: true,
          http: 200,
          body: {
            ...body,
            meta: {
              ...body.meta,
              mode: 'cache',
              platform: parsed.platform,
              username: parsed.ref.slug || parsed.ref.username || String(parsed.ref.key).replace(/^instagram:/, ''),
            },
          },
        };
      } catch (err) {
        if (err instanceof ServiceError) {
          return { ok: false, http: err.status, code: err.code, message: err.message };
        }
        return { ok: false, http: 500, code: 'CACHE_READ_ERROR', message: 'Could not read cache' };
      }
    },

    async prepareRefresh({ platform, username, limit, adminId, sessionId }) {
      const parsed = parsePlatformUsername(platform, username);
      if (!parsed.ok) return { ok: false, http: 400, code: parsed.code, message: parsed.message };
      const lim = parseLimit(limit);
      if (!lim.ok) return { ok: false, http: 400, code: lim.code, message: lim.message };
      const allow = enforceAllowlist(parsed.ref);
      if (!allow.ok) return { ok: false, http: 403, code: allow.code, message: allow.message };

      if (!service.hasProviderFor?.(parsed.ref)) {
        return {
          ok: false,
          http: 503,
          code: 'NO_PROVIDER_CONFIGURED',
          message: 'No upstream provider is configured for this platform',
        };
      }

      const ready = apifyReady();
      if (!ready.ready) {
        return { ok: false, http: 503, code: ready.code, message: ready.message };
      }

      const quota = await quotaSnapshot();
      if (!quota.available) {
        return {
          ok: false,
          http: 503,
          code: 'QUOTA_UNAVAILABLE',
          message: 'Local quota cannot be read; live refresh is blocked',
          quota,
        };
      }
      if (!quota.paidExecutionAllowed || (quota.remaining != null && quota.remaining <= 0)) {
        return {
          ok: false,
          http: 429,
          code: 'QUOTA_EXHAUSTED',
          message: 'Local daily Apify attempt budget is exhausted',
          quota,
        };
      }

      const now = Date.now();
      expireOpen.run(isoNow(now), adminId, isoNow(now));
      const token = randomToken(32);
      insertConfirm.run(
        sha256Hex(token),
        adminId,
        sessionId,
        parsed.platform,
        parsed.ref.slug || parsed.ref.username || String(parsed.ref.key).replace(/^instagram:/, ''),
        parsed.ref.key,
        lim.limit,
        isoNow(now),
        isoNow(now + PLAYGROUND_CONFIRM_TTL_MS),
      );

      audit?.record?.({
        event: 'playground_refresh_prepared',
        adminUsername: null,
        targetType: 'playground',
        targetId: parsed.ref.key,
        outcome: 'ok',
        meta: { platform: parsed.platform, limit: lim.limit },
      });

      return {
        ok: true,
        http: 200,
        data: {
          confirmationToken: token,
          expiresAt: isoNow(now + PLAYGROUND_CONFIRM_TTL_MS),
          expiresInSeconds: Math.floor(PLAYGROUND_CONFIRM_TTL_MS / 1000),
          platform: parsed.platform,
          username: parsed.ref.slug || parsed.ref.username || String(parsed.ref.key).replace(/^instagram:/, ''),
          limit: lim.limit,
          quota,
          maxChargeUsdPerRun: quota.maxChargeUsdPerRun,
          provider: ready.status,
          warning:
            'Confirming will reserve one local Apify attempt and may invoke a paid Actor. Cancellation makes zero provider calls.',
        },
      };
    },

    async confirmRefresh({ confirmationToken, adminId, sessionId, adminUsername }) {
      if (!confirmationToken || typeof confirmationToken !== 'string') {
        return { ok: false, http: 400, code: 'VALIDATION_ERROR', message: 'confirmationToken is required' };
      }
      const now = Date.now();
      const nowIso = isoNow(now);
      const row = getConfirm.get(sha256Hex(confirmationToken.trim()));
      if (!row) {
        return { ok: false, http: 409, code: 'CONFIRMATION_INVALID', message: 'Confirmation is invalid or unknown' };
      }
      if (row.admin_id !== adminId || row.session_id !== sessionId) {
        return { ok: false, http: 403, code: 'CONFIRMATION_SESSION_MISMATCH', message: 'Confirmation does not belong to this session' };
      }
      if (row.consumed_at) {
        return { ok: false, http: 409, code: 'CONFIRMATION_REPLAY', message: 'Confirmation was already used' };
      }
      if (row.expires_at <= nowIso) {
        return { ok: false, http: 409, code: 'CONFIRMATION_EXPIRED', message: 'Confirmation expired; prepare again' };
      }

      const consumed = consumeConfirm.run(nowIso, row.id, nowIso);
      if (consumed.changes !== 1) {
        return { ok: false, http: 409, code: 'CONFIRMATION_REPLAY', message: 'Confirmation was already used' };
      }

      const ready = apifyReady();
      if (!ready.ready) {
        return { ok: false, http: 503, code: ready.code, message: ready.message };
      }

      const quota = await quotaSnapshot();
      if (!quota.available || !quota.paidExecutionAllowed) {
        return {
          ok: false,
          http: 429,
          code: 'QUOTA_EXHAUSTED',
          message: 'Local daily Apify attempt budget is exhausted',
          quota,
        };
      }

      const platform = row.platform;
      const ref = platform === 'instagram'
        ? parseInstagramUsername(row.username)
        : parseFacebookUsername(row.username);
      if (!ref || ref.key !== row.cache_key) {
        return { ok: false, http: 400, code: 'VALIDATION_ERROR', message: 'Confirmation target is invalid' };
      }

      try {
        const body = await service.forceRefresh(ref, row.limit_n);
        audit?.record?.({
          event: 'playground_refresh_executed',
          adminUsername: adminUsername || null,
          targetType: 'playground',
          targetId: ref.key,
          outcome: 'ok',
          meta: { platform, limit: row.limit_n, provider: body?.meta?.provider },
        });
        return {
          ok: true,
          http: 200,
          body: {
            ...body,
            meta: {
              ...body.meta,
              mode: 'live',
              platform,
              username: row.username,
              confirmationConsumed: true,
            },
          },
        };
      } catch (err) {
        audit?.record?.({
          event: 'playground_refresh_failed',
          adminUsername: adminUsername || null,
          targetType: 'playground',
          targetId: ref.key,
          outcome: 'error',
          meta: { code: err?.code || 'UPSTREAM_ERROR' },
        });
        if (err instanceof ServiceError) {
          return { ok: false, http: err.status, code: err.code, message: err.message };
        }
        return { ok: false, http: 502, code: 'UPSTREAM_UNAVAILABLE', message: 'Live refresh failed' };
      }
    },

    async cancelConfirmation({ confirmationToken, adminId, sessionId }) {
      if (!confirmationToken) return { ok: true, http: 200 };
      const row = getConfirm.get(sha256Hex(String(confirmationToken).trim()));
      if (!row) return { ok: true, http: 200 };
      if (row.admin_id !== adminId || row.session_id !== sessionId) {
        return { ok: false, http: 403, code: 'FORBIDDEN', message: 'Confirmation does not belong to this session' };
      }
      if (!row.consumed_at) {
        forceConsume.run(isoNow(), row.id);
      }
      return { ok: true, http: 200, data: { cancelled: true } };
    },
  };
}
