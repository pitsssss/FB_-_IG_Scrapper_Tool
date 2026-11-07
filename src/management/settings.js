import { parseFacebookUsername } from '../pageRef.js';
import { parseInstagramUsername } from '../instagramRef.js';
import {
  SETTINGS_CATALOG,
  EDITABLE_SETTING_KEYS,
  MAX_ALLOWLIST_SIZE,
  MAX_WARM_LIST_SIZE,
  FRESH_TTL_MIN_SECONDS,
  FRESH_TTL_MAX_SECONDS,
  WARM_INTERVAL_MIN_SECONDS,
  WARM_INTERVAL_MAX_SECONDS,
  WARM_CONCURRENCY_MAX,
} from './settingsCatalog.js';

/**
 * Compose env allowlist with optional managed override.
 *
 * - managedOverride === null → env only (empty env = unrestricted)
 * - managedOverride present → override active:
 *   - env empty → managed list (empty managed = explicit deny-all)
 *   - env non-empty → intersection (never expands beyond env); empty managed = deny-all
 */
export function composeAllowlist(envList, managedOverride) {
  const env = Array.isArray(envList) ? envList : [];
  if (managedOverride === null || managedOverride === undefined) {
    return { effective: [...env], mode: env.length ? 'env' : 'unrestricted', overrideActive: false };
  }
  const managed = Array.isArray(managedOverride) ? managedOverride : [];
  if (!env.length) {
    return {
      effective: [...managed],
      mode: managed.length ? 'managed' : 'deny-all',
      overrideActive: true,
    };
  }
  if (!managed.length) {
    return { effective: [], mode: 'deny-all', overrideActive: true };
  }
  const envSet = new Set(env);
  const effective = managed.filter((k) => envSet.has(k));
  return { effective, mode: 'intersection', overrideActive: true };
}

function normalizeFacebookList(values) {
  if (!Array.isArray(values)) {
    return { ok: false, code: 'INVALID_TYPE', message: 'Expected an array of Facebook usernames' };
  }
  if (values.length > MAX_ALLOWLIST_SIZE) {
    return { ok: false, code: 'LIST_TOO_LARGE', message: `Maximum ${MAX_ALLOWLIST_SIZE} Facebook usernames` };
  }
  const out = [];
  const seen = new Set();
  for (const raw of values) {
    if (typeof raw !== 'string') {
      return { ok: false, code: 'INVALID_USERNAME', message: 'Facebook usernames must be strings' };
    }
    const ref = parseFacebookUsername(raw.trim());
    if (!ref) {
      return { ok: false, code: 'INVALID_USERNAME', message: `Invalid Facebook username: ${String(raw).slice(0, 40)}` };
    }
    if (seen.has(ref.key)) continue;
    seen.add(ref.key);
    out.push(ref.key);
  }
  return { ok: true, value: out };
}

function normalizeInstagramList(values) {
  if (!Array.isArray(values)) {
    return { ok: false, code: 'INVALID_TYPE', message: 'Expected an array of Instagram usernames' };
  }
  if (values.length > MAX_ALLOWLIST_SIZE) {
    return { ok: false, code: 'LIST_TOO_LARGE', message: `Maximum ${MAX_ALLOWLIST_SIZE} Instagram usernames` };
  }
  const out = [];
  const seen = new Set();
  for (const raw of values) {
    if (typeof raw !== 'string') {
      return { ok: false, code: 'INVALID_USERNAME', message: 'Instagram usernames must be strings' };
    }
    const ref = parseInstagramUsername(raw.trim());
    if (!ref) {
      return { ok: false, code: 'INVALID_USERNAME', message: `Invalid Instagram username: ${String(raw).slice(0, 40)}` };
    }
    if (seen.has(ref.key)) continue;
    seen.add(ref.key);
    out.push(ref.key);
  }
  return { ok: true, value: out };
}

function normalizeWarmFacebook(values) {
  const base = normalizeFacebookList(values);
  if (!base.ok) return base;
  if (base.value.length > MAX_WARM_LIST_SIZE) {
    return { ok: false, code: 'LIST_TOO_LARGE', message: `Maximum ${MAX_WARM_LIST_SIZE} warm Facebook usernames` };
  }
  return base;
}

function normalizeWarmInstagram(values) {
  const base = normalizeInstagramList(values);
  if (!base.ok) return base;
  if (base.value.length > MAX_WARM_LIST_SIZE) {
    return { ok: false, code: 'LIST_TOO_LARGE', message: `Maximum ${MAX_WARM_LIST_SIZE} warm Instagram usernames` };
  }
  return base;
}

/**
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {object} opts
 */
export function createSettingsService(db, {
  config,
  getQuota,
  onApplied,
  audit,
} = {}) {
  const envSnapshot = {
    allowedPages: [...(config.allowedPages || [])],
    instagramAllowedProfiles: [...(config.instagramAllowedProfiles || [])],
    // Use nullish coalescing — FRESH_TTL_SECONDS=0 is a valid test/ops value (always stale).
    freshTtlSeconds: Math.round((config.freshTtlMs ?? 21_600_000) / 1000),
    warmPagesRaw: config.warmPagesRaw || '',
    instagramWarmProfilesRaw: config.instagramWarmProfilesRaw || '',
    warmIntervalSeconds: Math.round((config.warmIntervalMs ?? 3_600_000) / 1000),
    warmConcurrency: config.warmConcurrency ?? 1,
    enrichmentEnabled: Boolean(config.instagramProfileEnrichment?.enabled),
    apifyDailyCeiling: Number.isInteger(config.apify?.dailyRunLimit)
      ? config.apify.dailyRunLimit
      : 12,
    maxChargeUsdPerRun: config.apify?.maxChargeUsdPerRun ?? null,
  };

  // Preserve env ceilings even if effective config.apify.dailyRunLimit is later lowered.
  if (config.apify && typeof config.apify === 'object') {
    config.apify.envDailyRunLimitCeiling = envSnapshot.apifyDailyCeiling;
  }

  function readRaw(key) {
    const row = db.prepare('SELECT value_json, updated_at, updated_by FROM management_settings WHERE key = ?').get(key);
    if (!row) return null;
    try {
      return {
        value: JSON.parse(row.value_json),
        updatedAt: row.updated_at,
        updatedBy: row.updated_by,
      };
    } catch {
      return null;
    }
  }

  function writeRaw(key, value, updatedBy) {
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO management_settings (key, value_json, updated_at, updated_by)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        value_json = excluded.value_json,
        updated_at = excluded.updated_at,
        updated_by = excluded.updated_by
    `).run(key, JSON.stringify(value), now, updatedBy || null);
    return now;
  }

  function deleteRaw(key) {
    db.prepare('DELETE FROM management_settings WHERE key = ?').run(key);
  }

  function managedOverride(key) {
    const raw = readRaw(key);
    if (!raw) return null;
    return raw.value;
  }

  function validateAndNormalize(key, value) {
    const spec = SETTINGS_CATALOG[key];
    if (!spec) {
      return { ok: false, code: 'UNKNOWN_SETTING', message: `Unknown setting: ${key}` };
    }
    switch (key) {
      case 'allowed_facebook':
        return normalizeFacebookList(value);
      case 'allowed_instagram':
        return normalizeInstagramList(value);
      case 'warm_facebook':
        return normalizeWarmFacebook(value);
      case 'warm_instagram':
        return normalizeWarmInstagram(value);
      case 'fresh_ttl_seconds': {
        if (!Number.isInteger(value)) {
          return { ok: false, code: 'INVALID_TYPE', message: 'fresh_ttl_seconds must be an integer' };
        }
        if (value < FRESH_TTL_MIN_SECONDS || value > FRESH_TTL_MAX_SECONDS) {
          return {
            ok: false,
            code: 'OUT_OF_RANGE',
            message: `fresh_ttl_seconds must be ${FRESH_TTL_MIN_SECONDS}–${FRESH_TTL_MAX_SECONDS}`,
          };
        }
        return { ok: true, value };
      }
      case 'warm_interval_seconds': {
        if (!Number.isInteger(value)) {
          return { ok: false, code: 'INVALID_TYPE', message: 'warm_interval_seconds must be an integer' };
        }
        if (value < WARM_INTERVAL_MIN_SECONDS || value > WARM_INTERVAL_MAX_SECONDS) {
          return {
            ok: false,
            code: 'OUT_OF_RANGE',
            message: `warm_interval_seconds must be ${WARM_INTERVAL_MIN_SECONDS}–${WARM_INTERVAL_MAX_SECONDS}`,
          };
        }
        return { ok: true, value };
      }
      case 'warm_concurrency': {
        if (!Number.isInteger(value)) {
          return { ok: false, code: 'INVALID_TYPE', message: 'warm_concurrency must be an integer' };
        }
        if (value < 1 || value > WARM_CONCURRENCY_MAX) {
          return {
            ok: false,
            code: 'OUT_OF_RANGE',
            message: `warm_concurrency must be 1–${WARM_CONCURRENCY_MAX}`,
          };
        }
        return { ok: true, value };
      }
      case 'warm_enabled':
      case 'instagram_profile_enrichment': {
        if (typeof value !== 'boolean') {
          return { ok: false, code: 'INVALID_TYPE', message: `${key} must be a boolean` };
        }
        return { ok: true, value };
      }
      case 'apify_daily_run_limit': {
        if (!Number.isInteger(value)) {
          return { ok: false, code: 'INVALID_TYPE', message: 'apify_daily_run_limit must be an integer' };
        }
        if (value < 0 || value > envSnapshot.apifyDailyCeiling) {
          return {
            ok: false,
            code: 'CEILING_EXCEEDED',
            message: `apify_daily_run_limit must be 0–${envSnapshot.apifyDailyCeiling} (env ceiling)`,
          };
        }
        return { ok: true, value };
      }
      default:
        return { ok: false, code: 'UNKNOWN_SETTING', message: `Unknown setting: ${key}` };
    }
  }

  /**
   * Apply all persisted + env settings onto the live config / quota / allowlists.
   * @returns {{ applied: string[], pendingRestart: string[] }}
   */
  function applyToRuntime() {
    const applied = [];
    const pendingRestart = [];

    const fbCompose = composeAllowlist(envSnapshot.allowedPages, managedOverride('allowed_facebook'));
    config.allowedPages = fbCompose.effective;
    applied.push('allowed_facebook');

    const igCompose = composeAllowlist(
      envSnapshot.instagramAllowedProfiles,
      managedOverride('allowed_instagram'),
    );
    config.instagramAllowedProfiles = igCompose.effective;
    applied.push('allowed_instagram');

    const ttl = managedOverride('fresh_ttl_seconds');
    config.freshTtlMs = (Number.isInteger(ttl) ? ttl : envSnapshot.freshTtlSeconds) * 1000;
    applied.push('fresh_ttl_seconds');

    const enrichment = managedOverride('instagram_profile_enrichment');
    if (!config.instagramProfileEnrichment) config.instagramProfileEnrichment = {};
    config.instagramProfileEnrichment.enabled = typeof enrichment === 'boolean'
      ? enrichment
      : envSnapshot.enrichmentEnabled;
    applied.push('instagram_profile_enrichment');

    const daily = managedOverride('apify_daily_run_limit');
    const effectiveDaily = Number.isInteger(daily) ? daily : envSnapshot.apifyDailyCeiling;
    if (config.apify) config.apify.dailyRunLimit = effectiveDaily;
    const quota = typeof getQuota === 'function' ? getQuota() : null;
    if (quota && typeof quota.setDailyLimit === 'function') {
      quota.setDailyLimit(effectiveDaily);
    }
    applied.push('apify_daily_run_limit');

    // Warm settings are persisted but require restart unless caller reconfigures warmer.
    for (const k of ['warm_enabled', 'warm_facebook', 'warm_instagram', 'warm_interval_seconds', 'warm_concurrency']) {
      if (readRaw(k)) pendingRestart.push(k);
      else if (SETTINGS_CATALOG[k]?.apply === 'restart') {
        /* env defaults active — not pending */
      }
    }

    if (typeof onApplied === 'function') {
      onApplied({ allowedPages: config.allowedPages, instagramAllowedProfiles: config.instagramAllowedProfiles });
    }

    return { applied, pendingRestart: [...new Set(pendingRestart)] };
  }

  function describeSetting(key) {
    const spec = SETTINGS_CATALOG[key];
    const raw = readRaw(key);
    const overrideActive = Boolean(raw);
    let envDefault = null;
    let effective = null;
    let mode = null;

    switch (key) {
      case 'allowed_facebook': {
        envDefault = [...envSnapshot.allowedPages];
        const c = composeAllowlist(envSnapshot.allowedPages, overrideActive ? raw.value : null);
        effective = c.effective;
        mode = c.mode;
        break;
      }
      case 'allowed_instagram': {
        envDefault = envSnapshot.instagramAllowedProfiles.map((k) => String(k).replace(/^instagram:/, ''));
        const c = composeAllowlist(
          envSnapshot.instagramAllowedProfiles,
          overrideActive ? raw.value : null,
        );
        effective = c.effective.map((k) => String(k).replace(/^instagram:/, ''));
        mode = c.mode;
        break;
      }
      case 'fresh_ttl_seconds':
        envDefault = envSnapshot.freshTtlSeconds;
        effective = overrideActive ? raw.value : envSnapshot.freshTtlSeconds;
        break;
      case 'warm_enabled':
        envDefault = Boolean(envSnapshot.warmPagesRaw || envSnapshot.instagramWarmProfilesRaw);
        effective = overrideActive ? raw.value : envDefault;
        break;
      case 'warm_facebook':
        envDefault = String(envSnapshot.warmPagesRaw || '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        effective = overrideActive ? raw.value : envDefault;
        break;
      case 'warm_instagram':
        envDefault = String(envSnapshot.instagramWarmProfilesRaw || '')
          .split(',')
          .map((s) => s.trim().replace(/^instagram:/i, ''))
          .filter(Boolean);
        effective = overrideActive ? raw.value : envDefault;
        break;
      case 'warm_interval_seconds':
        envDefault = envSnapshot.warmIntervalSeconds;
        effective = overrideActive ? raw.value : envSnapshot.warmIntervalSeconds;
        break;
      case 'warm_concurrency':
        envDefault = envSnapshot.warmConcurrency;
        effective = overrideActive ? raw.value : envSnapshot.warmConcurrency;
        break;
      case 'instagram_profile_enrichment':
        envDefault = envSnapshot.enrichmentEnabled;
        effective = overrideActive ? raw.value : envSnapshot.enrichmentEnabled;
        break;
      case 'apify_daily_run_limit':
        envDefault = envSnapshot.apifyDailyCeiling;
        effective = overrideActive ? raw.value : envSnapshot.apifyDailyCeiling;
        break;
      default:
        break;
    }

    const saved = overrideActive;
    const appliedNow = spec.apply === 'hot'
      ? saved || true
      : !overrideActive;
    const status = spec.apply === 'restart' && overrideActive
      ? 'pending_restart'
      : saved
        ? 'applied'
        : 'env_default';

    return {
      key,
      type: spec.type,
      apply: spec.apply,
      description: spec.description,
      saved,
      status,
      envDefault,
      managedValue: overrideActive ? raw.value : null,
      effective,
      mode,
      updatedAt: raw?.updatedAt || null,
      updatedBy: raw?.updatedBy || null,
      constraints: key === 'apify_daily_run_limit'
        ? { min: 0, max: envSnapshot.apifyDailyCeiling, ceilingSource: 'APIFY_DAILY_RUN_LIMIT' }
        : key === 'fresh_ttl_seconds'
          ? { min: FRESH_TTL_MIN_SECONDS, max: FRESH_TTL_MAX_SECONDS }
          : key === 'warm_interval_seconds'
            ? { min: WARM_INTERVAL_MIN_SECONDS, max: WARM_INTERVAL_MAX_SECONDS }
            : key === 'warm_concurrency'
              ? { min: 1, max: WARM_CONCURRENCY_MAX }
              : key.startsWith('allowed_') || key.startsWith('warm_face') || key.startsWith('warm_inst')
                ? { maxItems: key.startsWith('warm_') ? MAX_WARM_LIST_SIZE : MAX_ALLOWLIST_SIZE }
                : null,
    };
  }

  function getSnapshot() {
    applyToRuntime();
    const settings = {};
    for (const key of EDITABLE_SETTING_KEYS) {
      settings[key] = describeSetting(key);
    }
    return {
      settings,
      readOnly: {
        apifyMaxChargeUsdPerRun: envSnapshot.maxChargeUsdPerRun,
        apifyDailyCeiling: envSnapshot.apifyDailyCeiling,
        note: 'Per-run charge cap and infrastructure settings are operator-controlled via environment. Manual quota reset is not available in MVP.',
      },
      catalog: EDITABLE_SETTING_KEYS,
    };
  }

  function patch(updates, { adminUsername, confirmWarmEnable = false } = {}) {
    if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
      return { ok: false, http: 400, code: 'INVALID_BODY', message: 'Expected an object of settings' };
    }
    const keys = Object.keys(updates);
    if (!keys.length) {
      return { ok: false, http: 400, code: 'EMPTY_PATCH', message: 'No settings provided' };
    }
    for (const key of keys) {
      if (!SETTINGS_CATALOG[key]) {
        return { ok: false, http: 400, code: 'UNKNOWN_SETTING', message: `Unknown setting: ${key}` };
      }
    }

    const normalized = {};
    for (const key of keys) {
      const result = validateAndNormalize(key, updates[key]);
      if (!result.ok) {
        return { ok: false, http: 400, code: result.code, message: result.message };
      }
      normalized[key] = result.value;
    }

    if (normalized.warm_enabled === true && !confirmWarmEnable) {
      return {
        ok: false,
        http: 400,
        code: 'CONFIRMATION_REQUIRED',
        message: 'Enabling cache warming requires confirmWarmEnable=true (may consume local Apify attempt budget).',
      };
    }

    // Atomic-ish: validate all first, then write
    for (const [key, value] of Object.entries(normalized)) {
      writeRaw(key, value, adminUsername);
    }

    const runtime = applyToRuntime();

    if (audit) {
      audit.record({
        event: 'settings_patched',
        adminUsername: adminUsername || null,
        targetType: 'settings',
        targetId: keys.join(','),
        outcome: 'ok',
        meta: { keys, pendingRestart: runtime.pendingRestart },
      });
    }

    return {
      ok: true,
      http: 200,
      snapshot: getSnapshot(),
      applied: runtime.applied.filter((k) => keys.includes(k) && SETTINGS_CATALOG[k].apply === 'hot'),
      pendingRestart: runtime.pendingRestart.filter((k) => keys.includes(k)),
    };
  }

  function clearOverride(key, { adminUsername } = {}) {
    if (!SETTINGS_CATALOG[key]) {
      return { ok: false, http: 400, code: 'UNKNOWN_SETTING', message: `Unknown setting: ${key}` };
    }
    deleteRaw(key);
    applyToRuntime();
    if (audit) {
      audit.record({
        event: 'settings_override_cleared',
        adminUsername: adminUsername || null,
        targetType: 'settings',
        targetId: key,
        outcome: 'ok',
        meta: { key },
      });
    }
    return { ok: true, http: 200, snapshot: getSnapshot() };
  }

  /** Warm lists for process start (respect allowlists). */
  function resolvedWarmConfig() {
    const enabledOverride = managedOverride('warm_enabled');
    const fbList = managedOverride('warm_facebook');
    const igList = managedOverride('warm_instagram');
    const interval = managedOverride('warm_interval_seconds');
    const concurrency = managedOverride('warm_concurrency');

    const fbUsernames = Array.isArray(fbList)
      ? fbList
      : String(envSnapshot.warmPagesRaw || '').split(',').map((s) => s.trim()).filter(Boolean);
    const igUsernames = Array.isArray(igList)
      ? igList.map((k) => String(k).replace(/^instagram:/, ''))
      : String(envSnapshot.instagramWarmProfilesRaw || '')
        .split(',')
        .map((s) => s.trim().replace(/^instagram:/i, ''))
        .filter(Boolean);

    const enabled = typeof enabledOverride === 'boolean'
      ? enabledOverride
      : (fbUsernames.length + igUsernames.length) > 0;

    return {
      enabled,
      facebook: fbUsernames,
      instagram: igUsernames,
      intervalSeconds: Number.isInteger(interval) ? interval : envSnapshot.warmIntervalSeconds,
      concurrency: Number.isInteger(concurrency) ? concurrency : envSnapshot.warmConcurrency,
    };
  }

  return {
    getSnapshot,
    patch,
    clearOverride,
    applyToRuntime,
    composeAllowlist,
    resolvedWarmConfig,
    envSnapshot,
    EDITABLE_SETTING_KEYS,
  };
}
