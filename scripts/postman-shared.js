/**
 * Shared helpers for Postman local runners (live acceptance + Desktop serve).
 * Keeps cache/quota path and CLI flags consistent without duplicating logic.
 */
import { join } from 'node:path';

/** Directory name under `.postman-local/` used by both `postman:live` and `postman:serve`. */
export const SHARED_CACHE_NAME = 'live-cache';

/** Default Apify daily invocation budget for `postman:serve -- --live` (total per UTC day). */
export const DEFAULT_LIVE_DAILY_LIMIT = 1;

/** Hard ceiling for `--daily-limit=N` (total daily invocations, not extra calls). */
export const MAX_CLI_DAILY_LIMIT = 10;

export function resolveSharedCacheDir(rootDir) {
  return join(rootDir, '.postman-local', SHARED_CACHE_NAME);
}

/**
 * Parse serve/live CLI flags from process.argv (or a custom array).
 * @returns {{ live: boolean, dailyLimit: number, dailyLimitExplicit: boolean }}
 */
export function parseServeFlags(argv = process.argv) {
  const live = argv.includes('--live');
  let dailyLimitExplicit = false;
  let dailyLimit = live ? DEFAULT_LIVE_DAILY_LIMIT : 0;

  for (const arg of argv) {
    const m = /^--daily-limit=(\d+)$/.exec(arg);
    if (m) {
      const n = Number.parseInt(m[1], 10);
      if (!Number.isInteger(n) || n < 1 || n > MAX_CLI_DAILY_LIMIT) {
        throw new Error(
          `--daily-limit must be an integer from 1 to ${MAX_CLI_DAILY_LIMIT} (got ${m[1]}). ` +
            'This is the TOTAL Apify invocations allowed for the UTC day in the shared cache, ' +
            'including any already consumed — not extra calls and not a USD budget.',
        );
      }
      dailyLimitExplicit = true;
      dailyLimit = n;
      continue;
    }
    if (arg === '--daily-limit' || arg.startsWith('--daily-limit')) {
      throw new Error('Use --daily-limit=N with a positive integer (example: --daily-limit=3).');
    }
  }

  if (dailyLimitExplicit && !live) {
    throw new Error('--daily-limit requires --live (cache-only serve always uses APIFY_DAILY_RUN_LIMIT=0).');
  }

  return { live, dailyLimit, dailyLimitExplicit };
}

export function resolveMaxChargeUsd(dotenv = {}) {
  const raw = dotenv.APIFY_MAX_CHARGE_USD_PER_RUN;
  if (raw !== undefined && raw !== null && String(raw).trim() !== '') {
    return String(raw).trim();
  }
  return '0.15';
}
