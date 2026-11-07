import { ProviderError } from '../errors.js';
import { buildApifyRunUrl } from './apify.js';
import { createApifyQuota } from '../apifyQuota.js';
import { isVerifiedHttpsLogoUrl } from '../instagramLogo.js';

/**
 * Optional Instagram Profile Scraper (apify/instagram-profile-scraper).
 * Official input (verified): usernames[], includeAboutSection (paid — keep false).
 * Output fields used: id, username, fullName, profilePicUrl, profilePicUrlHD.
 *
 * DISABLED unless config.instagramProfileEnrichment.enabled === true.
 * Shares APIFY_TOKEN + the SAME durable quota manager as post scrapers.
 */
export function createInstagramProfileEnricher(config, { quota } = {}) {
  const fbCfg = config.apify || {};
  const igCfg = config.instagramProfileEnrichment || {};
  const enabled = Boolean(igCfg.enabled);
  const getToken = () => fbCfg.token || '';
  const actor = (igCfg.actor || 'apify~instagram-profile-scraper').replace('/', '~');
  const timeoutMs = igCfg.timeoutMs || 60000;
  const inflight = new Map();

  const quotaManager = quota || createApifyQuota({
    stateDir: config.cacheDir,
    dailyLimit: fbCfg.dailyRunLimit,
  });

  async function fetchProfileOnce(ref) {
    const reservation = await quotaManager.reserve();
    if (!reservation.ok) {
      throw new ProviderError('apify daily run budget exhausted', {
        retryable: false,
        status: 429,
      });
    }

    const url = buildApifyRunUrl({
      baseUrl: fbCfg.baseUrl,
      actor,
      maxChargeUsdPerRun: fbCfg.maxChargeUsdPerRun,
    });
    // Official input — do not enable includeAboutSection (paid add-on).
    const input = {
      usernames: [ref.username],
      includeAboutSection: false,
    };

    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${getToken()}` },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      throw new ProviderError(`instagram-profile network/timeout: ${err.name}`, { retryable: false });
    }

    if (!res.ok) {
      const body = (await res.text().catch(() => '')).slice(0, 200);
      throw new ProviderError(`instagram-profile HTTP ${res.status}: ${body}`, {
        retryable: false,
        status: res.status,
      });
    }

    let items;
    try {
      items = await res.json();
    } catch {
      throw new ProviderError('instagram-profile returned invalid JSON', { retryable: false });
    }
    if (!Array.isArray(items)) {
      throw new ProviderError('instagram-profile unexpected payload', { retryable: false });
    }

    const match = items.find((it) => {
      if (!it || typeof it !== 'object' || it.error) return false;
      return String(it.username || '').toLowerCase() === ref.username;
    });
    if (!match) {
      throw new ProviderError('instagram-profile returned no matching username', { retryable: false });
    }
    const pic = match.profilePicUrlHD || match.profilePicUrl;
    if (!isVerifiedHttpsLogoUrl(pic)) {
      throw new ProviderError('instagram-profile missing verified HTTPS profile picture', { retryable: false });
    }
    return {
      username: ref.username,
      id: match.id != null ? String(match.id) : null,
      fullName: typeof match.fullName === 'string' ? match.fullName : null,
      profilePicUrl: match.profilePicUrl || null,
      profilePicUrlHD: match.profilePicUrlHD || null,
      fetchedAt: Date.now(),
      provider: 'instagram-profile-apify',
    };
  }

  /**
   * Single-flight fetch for one username. Never retries (retryable:false) — one reservation only.
   */
  async function fetchProfile(ref) {
    if (!enabled) return null;
    if (!getToken()) return null;
    if (!ref?.username) return null;
    if (inflight.has(ref.username)) return inflight.get(ref.username);
    const p = fetchProfileOnce(ref).finally(() => inflight.delete(ref.username));
    inflight.set(ref.username, p);
    return p;
  }

  return {
    name: 'instagram-profile-apify',
    enabled,
    quota: quotaManager,
    fetchProfile,
  };
}
