/**
 * Explicit allowlist of dashboard-editable management settings.
 * Unknown keys are rejected. Secrets and infrastructure are never editable here.
 */

export const MAX_ALLOWLIST_SIZE = 200;
export const MAX_WARM_LIST_SIZE = 50;
export const FRESH_TTL_MIN_SECONDS = 60;
export const FRESH_TTL_MAX_SECONDS = 7 * 24 * 3600;
export const WARM_INTERVAL_MIN_SECONDS = 300;
export const WARM_INTERVAL_MAX_SECONDS = 86400;
export const WARM_CONCURRENCY_MAX = 8;

/** @typedef {'hot' | 'restart'} ApplyMode */

/**
 * @type {Record<string, {
 *   type: 'string[]' | 'integer' | 'boolean',
 *   apply: ApplyMode,
 *   description: string,
 * }>}
 */
export const SETTINGS_CATALOG = {
  allowed_facebook: {
    type: 'string[]',
    apply: 'hot',
    description: 'Managed Facebook username allowlist override (intersected with env ALLOWED_PAGES when set).',
  },
  allowed_instagram: {
    type: 'string[]',
    apply: 'hot',
    description: 'Managed Instagram username allowlist override (intersected with env INSTAGRAM_ALLOWED_PROFILES when set).',
  },
  fresh_ttl_seconds: {
    type: 'integer',
    apply: 'hot',
    description: 'Seconds a cache entry is considered fresh before stale-cache background refresh.',
  },
  warm_enabled: {
    type: 'boolean',
    apply: 'restart',
    description: 'Whether the background cache warmer should run (requires process restart to apply).',
  },
  warm_facebook: {
    type: 'string[]',
    apply: 'restart',
    description: 'Facebook usernames for cache warming (restart required; saving does not scrape).',
  },
  warm_instagram: {
    type: 'string[]',
    apply: 'restart',
    description: 'Instagram usernames for cache warming (restart required; saving does not scrape).',
  },
  warm_interval_seconds: {
    type: 'integer',
    apply: 'restart',
    description: 'Seconds between warm cycles (restart required).',
  },
  warm_concurrency: {
    type: 'integer',
    apply: 'restart',
    description: 'Max concurrent warm refreshes (1–8; restart required).',
  },
  instagram_profile_enrichment: {
    type: 'boolean',
    apply: 'hot',
    description: 'Optional Instagram profile Actor enrichment (shares local Apify attempt budget).',
  },
  apify_daily_run_limit: {
    type: 'integer',
    apply: 'hot',
    description: 'Effective local daily Apify attempt limit (cannot exceed env ceiling; 0 disables paid attempts).',
  },
};

export const EDITABLE_SETTING_KEYS = Object.freeze(Object.keys(SETTINGS_CATALOG));
