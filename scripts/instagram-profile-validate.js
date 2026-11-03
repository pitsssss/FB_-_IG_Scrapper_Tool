/**
 * Controlled Instagram PROFILE enrichment validation (profile Actor only).
 *
 * Default: DRY RUN — never calls Apify.
 * Paid path requires BOTH:
 *   --execute-paid
 *   --confirm-cost
 *
 * Usage:
 *   node scripts/instagram-profile-validate.js
 *   npm run postman:instagram:profile
 *   npm run postman:instagram:profile -- --execute-paid --confirm-cost
 *
 * Never invokes the Instagram Post Scraper.
 * Uses shared `.postman-local/live-cache` quota (does not reset it).
 * Post cache files are read-only; paid success writes only instagram-profiles/.
 */
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveSharedCacheDir, resolveMaxChargeUsd } from './postman-shared.js';
import { createApifyQuota } from '../src/apifyQuota.js';
import { parseInstagramRef } from '../src/instagramRef.js';
import { createInstagramProfileEnricher } from '../src/providers/instagramProfileApify.js';
import { createInstagramProfileStore } from '../src/instagramProfileStore.js';
import { createInstagramIdentity } from '../src/instagramIdentity.js';
import { INSTAGRAM_LOGO_FALLBACK } from '../src/instagramNormalize.js';
import { buildApifyRunUrl } from '../src/providers/apify.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const PROFILE = 'https://www.instagram.com/nasa/';
const ACTOR = 'apify~instagram-profile-scraper';
const OFFICIAL_INPUT = {
  usernames: ['nasa'],
  includeAboutSection: false,
};
const CHARGE_CEILING = 0.15;

function log(msg) {
  console.log(msg);
}

function fail(msg) {
  console.error(`ERROR: ${msg}`);
}

async function readDotEnv() {
  try {
    const text = await readFile(join(root, '.env'), 'utf8');
    const out = {};
    for (const line of text.split(/\r?\n/)) {
      if (!line || line.trim().startsWith('#')) continue;
      const i = line.indexOf('=');
      if (i <= 0) continue;
      const k = line.slice(0, i).trim();
      let v = line.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

/** Enforce maxTotalChargeUsd <= 0.15; keep a lower positive env value. */
export function resolveProfileChargeCap(dotenv = {}) {
  const raw = resolveMaxChargeUsd(dotenv);
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`Invalid APIFY_MAX_CHARGE_USD_PER_RUN="${raw}"`);
  }
  if (n > CHARGE_CEILING) return String(CHARGE_CEILING);
  return String(raw);
}

function parseConfiguredDailyLimit(dotenv) {
  const raw = dotenv.APIFY_DAILY_RUN_LIMIT;
  if (raw === undefined || raw === null || String(raw).trim() === '') return 12;
  const n = Number.parseInt(String(raw).trim(), 10);
  if (!Number.isInteger(n) || n < 0) {
    throw new Error('APIFY_DAILY_RUN_LIMIT must be a non-negative integer');
  }
  return n;
}

async function readQuota(sharedCacheDir) {
  const today = new Date().toISOString().slice(0, 10);
  try {
    const q = JSON.parse(await readFile(join(sharedCacheDir, 'apify-quota.json'), 'utf8'));
    const consumed = q && q.utcDate === today ? Number(q.consumed) || 0 : 0;
    return { utcDate: q?.utcDate || today, consumed, today };
  } catch (e) {
    if (e && e.code === 'ENOENT') return { utcDate: today, consumed: 0, today };
    throw e;
  }
}

async function listPostCaches(sharedCacheDir) {
  const out = [];
  const files = await readdir(sharedCacheDir);
  for (const f of files) {
    if (!f.endsWith('.json') || f === 'apify-quota.json') continue;
    if (f.includes('instagram-profiles')) continue;
    try {
      const j = JSON.parse(await readFile(join(sharedCacheDir, f), 'utf8'));
      if (!j || !j.key) continue;
      out.push({
        file: f,
        key: j.key,
        posts: Array.isArray(j.posts) ? j.posts.length : 0,
      });
    } catch {
      /* skip */
    }
  }
  return out;
}

async function loadNasaPostEntry(sharedCacheDir) {
  const key = 'instagram:nasa';
  const file = join(sharedCacheDir, `${createHash('sha1').update(key).digest('hex')}.json`);
  try {
    const entry = JSON.parse(await readFile(file, 'utf8'));
    if (entry?.key !== key) return { file, entry: null };
    return { file, entry };
  } catch {
    return { file, entry: null };
  }
}

function redactUrl(u) {
  if (typeof u !== 'string') return u;
  if (u.length <= 72) return u;
  return `${u.slice(0, 72)}…`;
}

async function main() {
  const argv = process.argv.slice(2);
  const executePaid = argv.includes('--execute-paid');
  const confirmCost = argv.includes('--confirm-cost');
  const dryRun = !executePaid;

  if (executePaid && !confirmCost) {
    fail('Paid path refused: --execute-paid also requires --confirm-cost.');
    fail('Default mode is dry-run. Re-run without flags for the plan, or get explicit approval first.');
    process.exit(2);
  }

  const dotenv = await readDotEnv();
  const token = (dotenv.APIFY_TOKEN || '').trim();
  const tokenPresent = Boolean(token);
  const sharedCacheDir = resolveSharedCacheDir(root);
  const chargeCap = resolveProfileChargeCap(dotenv);
  const configuredDailyLimit = parseConfiguredDailyLimit(dotenv);
  const quota = await readQuota(sharedCacheDir);
  const remaining = Math.max(0, configuredDailyLimit - quota.consumed);
  const caches = await listPostCaches(sharedCacheDir);
  const nasa = await loadNasaPostEntry(sharedCacheDir);
  const ref = parseInstagramRef(PROFILE);

  const runUrl = buildApifyRunUrl({
    baseUrl: (dotenv.APIFY_BASE_URL || 'https://api.apify.com').replace(/\/+$/, ''),
    actor: ACTOR,
    maxChargeUsdPerRun: Number(chargeCap),
  });

  let outboundUrlHostPath = '(invalid)';
  try {
    const u = new URL(runUrl);
    outboundUrlHostPath = `${u.origin}${u.pathname}?${u.searchParams.toString()}`;
  } catch { /* ignore */ }

  const report = {
    mode: dryRun ? 'DRY_RUN' : 'EXECUTE_PAID',
    actor: ACTOR,
    profileUrl: PROFILE,
    username: ref?.username || null,
    officialInput: OFFICIAL_INPUT,
    tokenPresent,
    tokenLength: tokenPresent ? token.length : 0,
    sharedCacheDir: '.postman-local/live-cache',
    quota: {
      utcDate: quota.utcDate,
      consumed: quota.consumed,
      configuredDailyLimit,
      remainingUnderConfiguredLimit: remaining,
    },
    maxTotalChargeUsd: chargeCap,
    chargeCeilingUsd: CHARGE_CEILING,
    outboundUrlHostPath,
    willCallPostScraper: false,
    willResetQuota: false,
    willModifyPostCaches: false,
    retries: 0,
    warming: 'disabled',
    postCaches: caches.map((c) => ({ key: c.key, posts: c.posts })),
    nasaPostsPresent: Boolean(nasa.entry && nasa.entry.posts?.length),
    nasaPostCount: nasa.entry?.posts?.length || 0,
    paidCommand: 'npm run postman:instagram:profile -- --execute-paid --confirm-cost',
    blockers: [],
  };

  if (!ref) report.blockers.push('Invalid Instagram profile URL');
  if (!tokenPresent) report.blockers.push('APIFY_TOKEN missing/empty in .env');
  if (remaining < 1) {
    report.blockers.push(
      `No quota headroom under configured APIFY_DAILY_RUN_LIMIT=${configuredDailyLimit} (consumed=${quota.consumed}). Do not raise the limit automatically.`,
    );
  }
  if (!nasa.entry) {
    report.blockers.push(
      'instagram:nasa post cache missing (profile-only can still run, but dual-platform delivery evidence is incomplete)',
    );
  }

  log('== Instagram profile enrichment validation ==');
  log(JSON.stringify(report, null, 2));

  if (dryRun) {
    log('');
    log('DRY RUN complete — no Apify HTTP calls were made.');
    log('Quota and all post cache files were left untouched.');
    log('To run the single paid profile Actor (requires explicit user approval):');
    log(`  ${report.paidCommand}`);
    const hard = report.blockers.some((b) => b.includes('APIFY_TOKEN') || b.includes('quota'));
    process.exit(hard ? 3 : 0);
  }

  const hardBlock = report.blockers.some(
    (b) => b.includes('APIFY_TOKEN') || b.includes('quota') || b.includes('Invalid'),
  );
  if (hardBlock) {
    fail('Refusing paid execution due to blockers above.');
    process.exit(3);
  }

  log('Executing ONE Instagram profile Actor run (posts Actor will NOT be called)…');
  const consumedBefore = quota.consumed;

  const config = {
    cacheDir: sharedCacheDir,
    apify: {
      token,
      baseUrl: (dotenv.APIFY_BASE_URL || 'https://api.apify.com').replace(/\/+$/, ''),
      dailyRunLimit: configuredDailyLimit,
      maxChargeUsdPerRun: Number(chargeCap),
    },
    instagramProfileEnrichment: {
      enabled: true,
      actor: ACTOR,
      timeoutMs: Number.parseInt(dotenv.INSTAGRAM_PROFILE_TIMEOUT_MS || '60000', 10) || 60000,
    },
    instagramProfileLogos: new Map(),
    instagramProfileTtlMs: 604800 * 1000,
  };

  const quotaManager = createApifyQuota({
    stateDir: sharedCacheDir,
    dailyLimit: configuredDailyLimit,
  });
  const enricher = createInstagramProfileEnricher(config, { quota: quotaManager });
  const store = createInstagramProfileStore(sharedCacheDir);
  const identity = createInstagramIdentity(config, { quota: quotaManager });

  let profileMeta;
  try {
    profileMeta = await enricher.fetchProfile(ref);
  } catch (err) {
    fail(`Profile Actor failed (no automatic retry): ${err.message}`);
    const qAfterFail = await readQuota(sharedCacheDir);
    log(JSON.stringify({
      paidAttempt: true,
      success: false,
      quotaBefore: consumedBefore,
      quotaAfter: qAfterFail.consumed,
      note: 'Failed attempts still consume a reservation when reserve() succeeded before the HTTP error.',
    }, null, 2));
    process.exit(1);
  }

  const saved = await store.set(ref.username, profileMeta);
  const qAfter = await readQuota(sharedCacheDir);

  let overlay = null;
  if (nasa.entry) {
    const page = await identity.resolvePage(nasa.entry.page, ref, { allowEnrichment: false });
    const posts = identity.attachPageToPosts(page, nasa.entry.posts);
    overlay = {
      pageLogo: redactUrl(page.logo),
      isFallback: page.logo === INSTAGRAM_LOGO_FALLBACK,
      postCount: posts.length,
      everyPostPageLogoMatches: posts.every((p) => p.page.logo === page.logo && p.page.name === page.name),
      postCacheFileRewritten: false,
    };
  }

  let nasaIntact = true;
  if (nasa.entry) {
    const again = await loadNasaPostEntry(sharedCacheDir);
    nasaIntact =
      Boolean(again.entry) &&
      again.entry.posts?.length === nasa.entry.posts.length &&
      again.entry.posts[0]?.id === nasa.entry.posts[0]?.id;
  }

  const result = {
    paidAttempt: true,
    success: true,
    username: profileMeta.username,
    id: profileMeta.id,
    fullName: profileMeta.fullName,
    profilePicUrl: redactUrl(profileMeta.profilePicUrl),
    profilePicUrlHD: redactUrl(profileMeta.profilePicUrlHD),
    profileMetaPersisted: Boolean(saved.persisted),
    quotaBefore: consumedBefore,
    quotaAfter: qAfter.consumed,
    quotaDelta: qAfter.consumed - consumedBefore,
    expectedQuotaDelta: 1,
    overlay,
    nasaPostCacheIntact: nasaIntact,
    postCachesAfter: (await listPostCaches(sharedCacheDir)).map((c) => ({ key: c.key, posts: c.posts })),
  };

  log('--- PAID PROFILE VALIDATION RESULT ---');
  log(JSON.stringify(result, null, 2));

  const ok =
    result.quotaDelta === 1 &&
    result.username === 'nasa' &&
    result.profileMetaPersisted &&
    result.nasaPostCacheIntact &&
    overlay &&
    overlay.everyPostPageLogoMatches &&
    !overlay.isFallback;

  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  fail(err?.stack || err?.message || String(err));
  process.exit(1);
});
