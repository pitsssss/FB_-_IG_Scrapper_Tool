import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ProviderError, isRetryableStatus } from '../errors.js';
import { normalizeInstagramItems } from '../instagramNormalize.js';
import { isInstagramRef } from '../instagramRef.js';
import { buildApifyRunUrl } from './apify.js';
import { createApifyQuota } from '../apifyQuota.js';

/**
 * Official Actor input (verified from Apify docs):
 * - username: string[]
 * - resultsLimit: integer
 * - skipPinnedPosts: boolean
 * - dataDetailLevel: "basicData" | "detailedData"  (detailed is paid extra — we use basicData)
 * Avoid includeMusicData (paid add-on).
 */
export function buildInstagramApifyInput(ref, limit, template) {
  const base = template && typeof template === 'object'
    ? JSON.parse(JSON.stringify(template))
    : {};
  base.username = [ref.username || ref.url];
  base.resultsLimit = limit;
  if (base.skipPinnedPosts === undefined) base.skipPinnedPosts = true;
  if (!base.dataDetailLevel) base.dataDetailLevel = 'basicData';
  // Never enable paid music add-on by default.
  if (base.includeMusicData === undefined) base.includeMusicData = false;
  return base;
}

/** Field-coverage stats for live acceptance (no full captions/URLs). */
export function summarizeInstagramActorItems(items) {
  const rows = Array.isArray(items) ? items : [];
  const keyCounts = new Map();
  let errorRows = 0;
  let withOwnerPic = 0;
  let withCaption = 0;
  let withTs = 0;
  let withVideo = 0;
  let withChildren = 0;
  let pinned = 0;
  for (const it of rows) {
    if (!it || typeof it !== 'object') continue;
    if (it.error || it.errorDescription || it.errorBody) {
      errorRows += 1;
      continue;
    }
    for (const k of Object.keys(it)) keyCounts.set(k, (keyCounts.get(k) || 0) + 1);
    if (it.ownerProfilePicUrl || it.owner?.profile_pic_url || it.owner?.profilePicUrl) withOwnerPic += 1;
    if (typeof it.caption === 'string' && it.caption.length) withCaption += 1;
    if (it.timestamp || it.takenAt || it.taken_at || it.date) withTs += 1;
    if (it.videoUrl || it.video_url) withVideo += 1;
    if (Array.isArray(it.childPosts) && it.childPosts.length) withChildren += 1;
    if (it.isPinned || it.is_pinned) pinned += 1;
  }
  return {
    rawRows: rows.length,
    errorRows,
    fieldFrequency: Object.fromEntries([...keyCounts.entries()].sort((a, b) => b[1] - a[1])),
    withOwnerPic,
    withCaption,
    withTs,
    withVideo,
    withChildren,
    pinned,
  };
}

async function writeCapture(captureDir, { ref, actor, input, items, httpStatus }) {
  if (!captureDir) return;
  await mkdir(captureDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const summary = summarizeInstagramActorItems(items);
  await writeFile(
    join(captureDir, `raw-items-${stamp}.json`),
    JSON.stringify(items, null, 2),
    'utf8',
  );
  await writeFile(
    join(captureDir, `field-coverage-${stamp}.json`),
    JSON.stringify({
      capturedAt: new Date().toISOString(),
      actor,
      profile: ref?.username || null,
      profileUrl: ref?.url || null,
      httpStatus,
      input: {
        username: input?.username,
        resultsLimit: input?.resultsLimit,
        skipPinnedPosts: input?.skipPinnedPosts,
        dataDetailLevel: input?.dataDetailLevel,
        includeMusicData: input?.includeMusicData,
      },
      summary,
    }, null, 2),
    'utf8',
  );
  await writeFile(
    join(captureDir, 'latest-pointer.json'),
    JSON.stringify({ stamp, actor, profile: ref?.username || null, rawRows: summary.rawRows }, null, 2),
    'utf8',
  );
}

/**
 * Instagram posts via apify/instagram-post-scraper.
 * MUST receive the same quota manager instance as the Facebook Apify provider.
 */
export function createInstagramApifyProvider(config, { quota } = {}) {
  const fbCfg = config.apify;
  const igCfg = config.instagramApify || {};
  // Read token at call time so dashboard-managed credentials hot-reload without restart.
  const getToken = () => fbCfg.token || '';
  const actor = (igCfg.actor || 'apify~instagram-post-scraper').replace('/', '~');
  const runCfg = {
    baseUrl: fbCfg.baseUrl,
    actor,
    maxChargeUsdPerRun: fbCfg.maxChargeUsdPerRun,
  };
  const timeoutMs = igCfg.timeoutMs || fbCfg.timeoutMs || 150000;
  const captureDir = igCfg.captureDir || null;
  const inputTemplate = igCfg.input || {
    username: [],
    resultsLimit: 10,
    skipPinnedPosts: true,
    dataDetailLevel: 'basicData',
    includeMusicData: false,
  };

  const quotaManager = quota || createApifyQuota({
    stateDir: config.cacheDir,
    dailyLimit: fbCfg.dailyRunLimit,
  });

  async function fetchRaw(ref, limit) {
    const reservation = await quotaManager.reserve();
    if (!reservation.ok) {
      throw new ProviderError('apify daily run budget exhausted', {
        retryable: false,
        status: 429,
      });
    }

    const url = buildApifyRunUrl(runCfg);
    const input = buildInstagramApifyInput(ref, limit, inputTemplate);

    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${getToken()}` },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      throw new ProviderError(`apify network/timeout error: ${err.name}`, { retryable: true });
    }

    if (!res.ok) {
      const body = (await res.text().catch(() => '')).slice(0, 200);
      const hint = res.status === 402 ? ' (Apify credits exhausted?)'
        : res.status === 401 ? ' (invalid APIFY_TOKEN?)'
          : res.status === 403 ? ' (forbidden)'
            : '';
      throw new ProviderError(`apify HTTP ${res.status}${hint}: ${body}`, {
        retryable: isRetryableStatus(res.status),
        status: res.status,
      });
    }

    let items;
    try {
      items = await res.json();
    } catch {
      throw new ProviderError('apify returned invalid JSON', { retryable: true });
    }
    if (!Array.isArray(items)) throw new ProviderError('apify returned an unexpected payload', { retryable: true });

    try {
      await writeCapture(captureDir, {
        ref,
        actor,
        input,
        items,
        httpStatus: res.status,
      });
    } catch (err) {
      console.error('[instagram-apify] capture write failed:', err.message);
    }

    return items;
  }

  return {
    name: 'instagram-apify',
    supports: (ref) => Boolean(getToken()) && isInstagramRef(ref),
    quota: quotaManager,
    fetchRaw,
    async fetch(ref, limit) {
      return normalizeInstagramItems(await fetchRaw(ref, limit), ref, limit);
    },
  };
}
