import {
  applyResolvedLogoToPage,
  extractOwnerLogoFromItems,
  logoFromProfileMeta,
  resolveInstagramLogo,
} from './instagramLogo.js';
import { createInstagramProfileStore } from './instagramProfileStore.js';
import { createInstagramProfileEnricher } from './providers/instagramProfileApify.js';
import { isInstagramRef } from './instagramRef.js';

/**
 * Build Instagram identity helpers for logo resolution + optional profile enrichment.
 * Enrichment is disabled by default and never touches Facebook.
 */
export function createInstagramIdentity(config, { quota } = {}) {
  const store = createInstagramProfileStore(config.cacheDir);
  const enricher = createInstagramProfileEnricher(config, { quota });
  const configured = config.instagramProfileLogos || new Map();
  const ttlMs = config.instagramProfileTtlMs || 7 * 24 * 3600 * 1000;

  function configLogo(ref) {
    return configured.get(ref.username) || null;
  }

  /**
   * Resolve page.logo for an Instagram response without mutating disk post cache.
   * May read profile metadata cache; may call enricher only when allowEnrichment=true.
   */
  async function resolvePage(page, ref, { rawItems = null, allowEnrichment = false } = {}) {
    if (!isInstagramRef(ref)) return page;

    const fromPosts = rawItems
      ? extractOwnerLogoFromItems(rawItems, ref)
      : (page?.logo && page.logo !== page.logo_fallback ? page.logo : null);

    let meta = await store.get(ref.username);
    if (meta && !store.isFresh(meta, ttlMs)) {
      // Stale meta may still be used as priority #2 until refresh succeeds.
    }

    if (
      allowEnrichment &&
      enricher.enabled &&
      (!meta || !store.isFresh(meta, ttlMs))
    ) {
      try {
        const fresh = await enricher.fetchProfile(ref);
        if (fresh) {
          const saved = await store.set(ref.username, fresh);
          if (saved.entry) meta = saved.entry;
          else meta = fresh;
        }
      } catch (err) {
        // Profile enrichment must never break the posts endpoint.
        console.error(`[instagram-identity] enrichment failed for "${ref.username}": ${err.message}`);
      }
    }

    const resolved = resolveInstagramLogo({
      fromPosts,
      fromProfileMeta: logoFromProfileMeta(meta, ref),
      fromConfig: configLogo(ref),
    });

    const nextPage = applyResolvedLogoToPage(page || {}, resolved.logo);
    // Prefer enriched/config fullName only when page name is bare username and meta has fullName
    if (
      meta?.fullName &&
      typeof meta.fullName === 'string' &&
      meta.fullName.trim() &&
      (!nextPage.name || nextPage.name === ref.username)
    ) {
      nextPage.name = meta.fullName.trim();
    }
    if (meta?.id && !nextPage.id) nextPage.id = String(meta.id);
    return nextPage;
  }

  function attachPageToPosts(page, posts) {
    return (posts || []).map((p) => ({ ...p, page }));
  }

  return {
    store,
    enricher,
    resolvePage,
    attachPageToPosts,
  };
}
