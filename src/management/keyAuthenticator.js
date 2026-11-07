import { createHash, timingSafeEqual } from 'node:crypto';

const sha = (s) => createHash('sha256').update(s).digest();

/**
 * Dual-source API key authenticator: environment keys + managed SQLite keys.
 * Hot-reload via refreshManaged().
 */
export function createKeyAuthenticator({
  envKeys = [],
  envPageScopes = null,
  getManagedSnapshot,
  allowedPages = [],
  instagramAllowedProfiles = [],
  getAllowedPages,
  getInstagramAllowedProfiles,
  onManagedUse,
} = {}) {
  const env = envKeys.map((k) => ({
    name: k.name,
    hash: sha(k.key),
    source: 'environment',
    // null scopes => unscoped (legacy)
    scopes: envPageScopes ? (envPageScopes.get(k.name) || new Set()) : null,
    unscoped: !envPageScopes,
  }));

  let managed = [];
  let pages = Array.isArray(allowedPages) ? allowedPages : [];
  let igProfiles = Array.isArray(instagramAllowedProfiles) ? instagramAllowedProfiles : [];

  function refreshManaged() {
    managed = typeof getManagedSnapshot === 'function' ? getManagedSnapshot() : [];
  }

  function refreshAllowlists() {
    if (typeof getAllowedPages === 'function') pages = getAllowedPages() || [];
    if (typeof getInstagramAllowedProfiles === 'function') {
      igProfiles = getInstagramAllowedProfiles() || [];
    }
  }

  refreshManaged();
  refreshAllowlists();

  function authenticate(req) {
    const bearer = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '');
    const headerKey = req.headers['x-api-key'];
    const supplied = (typeof headerKey === 'string' && headerKey) || (bearer && bearer[1]) || null;
    if (!supplied || typeof supplied !== 'string') return null;

    const given = sha(supplied);

    for (const k of env) {
      if (given.length === k.hash.length && timingSafeEqual(given, k.hash)) {
        return { name: k.name, source: 'environment', scopes: k.scopes, unscoped: k.unscoped };
      }
    }

    for (const k of managed) {
      if (!k.hash || given.length !== k.hash.length) continue;
      if (timingSafeEqual(given, k.hash)) {
        if (typeof onManagedUse === 'function') onManagedUse(k.id);
        return {
          name: k.name,
          source: 'managed',
          id: k.id,
          scopes: k.scopes,
          unscoped: false,
        };
      }
    }
    return null;
  }

  function pageAllowedForClient(client, ref) {
    if (!client) return false;
    refreshAllowlists();
    const isIg = ref.platform === 'instagram' || String(ref.key || '').startsWith('instagram:');
    if (isIg) {
      const allow = igProfiles || [];
      if (allow.length && !allow.includes(ref.key)) return false;
    } else if (pages.length && !pages.includes(ref.key)) {
      return false;
    }

    // Managed keys: deny-by-default until scopes assigned
    if (client.source === 'managed') {
      return Boolean(client.scopes && client.scopes.has(ref.key));
    }

    // Environment: legacy unscoped or explicit pageScopes
    if (client.unscoped) return true;
    return Boolean(client.scopes && client.scopes.has(ref.key));
  }

  function listEnvironmentMeta() {
    return env.map((k) => ({
      clientName: k.name,
      source: 'environment',
      keyPrefix: '(environment)',
      revoked: false,
      readOnly: true,
      scopes: k.unscoped
        ? { facebook: ['*'], instagram: ['*'], note: 'Unscoped environment key (subject to global allowlists)' }
        : {
          facebook: [...(k.scopes || [])].filter((x) => !String(x).startsWith('instagram:')),
          instagram: [...(k.scopes || [])]
            .filter((x) => String(x).startsWith('instagram:'))
            .map((x) => String(x).slice('instagram:'.length)),
        },
    }));
  }

  return {
    authenticate,
    pageAllowedForClient,
    refreshManaged,
    refreshAllowlists,
    setAllowlists(nextPages, nextIg) {
      if (Array.isArray(nextPages)) pages = nextPages;
      if (Array.isArray(nextIg)) igProfiles = nextIg;
    },
    listEnvironmentMeta,
    envClientNames: () => env.map((k) => k.name),
  };
}
