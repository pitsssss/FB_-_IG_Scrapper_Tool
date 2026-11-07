import { openManagementDb, integrityCheck } from './db.js';
import { createAuthService } from './authService.js';
import { createCredentialRuntime } from './credentialRuntime.js';
import { createProviderCredentialService } from './providerCredentials.js';
import { createApiKeyService } from './apiKeys.js';
import { createAuditLogger } from './audit.js';
import { createKeyAuthenticator } from './keyAuthenticator.js';
import { listCacheEntries, sanitizeQuotaStatus } from './opsInspect.js';
import { createPlaygroundService } from './playground.js';
import { createSettingsService } from './settings.js';
import { createTelemetry } from './telemetry.js';
import { parseFacebookUsername } from '../pageRef.js';
import { parseInstagramUsername } from '../instagramRef.js';

/**
 * Single management hub: shared SQLite + auth + provider + API keys + settings + telemetry.
 */
export function createManagementHub(config, {
  verifyOpts,
  getEncryptionKey,
  getQuota,
} = {}) {
  const opened = openManagementDb(config.managementDir);
  integrityCheck(opened.db);

  const auth = createAuthService({
    managementDir: config.managementDir,
    db: opened.db,
    closeDb: () => opened.close(),
    getSetupToken: () => config.bootstrapSetupToken || process.env.BOOTSTRAP_SETUP_TOKEN || '',
    allowedOrigins: (config.adminAllowedOrigins || []).join(','),
    trustProxy: config.trustProxy,
    internalSecret: config.adminInternalSecret || process.env.ADMIN_INTERNAL_SECRET || '',
    getEncryptionKey: getEncryptionKey || (() => config.dataEncryptionKey || process.env.DATA_ENCRYPTION_KEY || ''),
  });

  const db = auth.db;
  const audit = createAuditLogger(db);
  const telemetry = createTelemetry(db);
  const runtime = createCredentialRuntime({ envToken: config.apify?.token || '' });

  // Bind runtime token onto config.apify so existing providers see hot updates.
  if (config.apify && typeof config.apify === 'object') {
    const envSnapshot = config.apify.token || '';
    runtime.applyManagedState({ status: 'none' });
    Object.defineProperty(config.apify, 'token', {
      configurable: true,
      enumerable: true,
      get() {
        return runtime.getApifyToken();
      },
      set() { /* no-op: use provider service */ },
    });
    void envSnapshot;
  }

  let keyAuth = null;
  const apiKeys = createApiKeyService(db, {
    onChange() {
      keyAuth?.refreshManaged();
    },
  });

  keyAuth = createKeyAuthenticator({
    envKeys: config.apiKeys || [],
    envPageScopes: config.pageScopes,
    getManagedSnapshot: () => apiKeys.activeSnapshot(),
    getAllowedPages: () => config.allowedPages || [],
    getInstagramAllowedProfiles: () => config.instagramAllowedProfiles || [],
    onManagedUse(id) {
      apiKeys.markUsed(id);
    },
  });

  const providers = createProviderCredentialService(db, {
    runtime,
    getEncryptionKey: getEncryptionKey || (() => config.dataEncryptionKey || process.env.DATA_ENCRYPTION_KEY || ''),
    verifyOpts: verifyOpts || {
      baseUrl: (config.apify?.baseUrl && !String(config.apify.baseUrl).includes('127.0.0.1'))
        ? 'https://api.apify.com'
        : 'https://api.apify.com',
      allowCustomBase: Boolean(config.apifyVerifyAllowCustomBase),
      timeoutMs: 15_000,
      ...(config.apifyVerifyFetch ? { fetchImpl: config.apifyVerifyFetch } : {}),
      ...(config.apifyVerifyBaseUrl ? { baseUrl: config.apifyVerifyBaseUrl, allowCustomBase: true } : {}),
    },
  });

  providers.loadIntoRuntime();

  let playground = null;
  let boundService = null;
  /** Optional external keyAuth (server request authenticator) synced on settings apply. */
  let externalKeyAuth = null;

  const settings = createSettingsService(db, {
    config,
    getQuota: () => (typeof getQuota === 'function' ? getQuota() : boundService?.quota) || null,
    audit,
    onApplied({ allowedPages, instagramAllowedProfiles }) {
      keyAuth?.setAllowlists(allowedPages, instagramAllowedProfiles);
      externalKeyAuth?.setAllowlists?.(allowedPages, instagramAllowedProfiles);
    },
  });

  // Apply managed overrides at hub start (before serving traffic when possible).
  settings.applyToRuntime();

  return {
    auth,
    db,
    path: opened.path,
    audit,
    telemetry,
    settings,
    runtime,
    providers,
    apiKeys,
    keyAuth,
    get playground() {
      return playground;
    },
    bindService(service) {
      boundService = service;
      playground = createPlaygroundService({
        db,
        service,
        config,
        getProviderStatus: () => providers.status(),
        audit,
      });
      settings.applyToRuntime();
      return playground;
    },
    /** Sync allowlists into the public request authenticator in server.js */
    bindPublicKeyAuth(ka) {
      externalKeyAuth = ka;
      ka?.setAllowlists?.(config.allowedPages || [], config.instagramAllowedProfiles || []);
    },
    async cacheSummary() {
      return listCacheEntries({
        cacheDir: config.cacheDir,
        freshTtlMs: config.freshTtlMs,
        limit: 200,
      });
    },
    async deleteCacheEntry({ platform, username, currentPassword, confirm, adminUsername }) {
      if (confirm !== true) {
        return {
          ok: false,
          http: 400,
          code: 'CONFIRMATION_REQUIRED',
          message: 'Set confirm=true to delete this cache entry',
        };
      }
      const pwd = await auth.accountSecurity.assertCurrentPassword(currentPassword);
      if (!pwd.ok) {
        return { ok: false, http: 401, code: pwd.code, message: pwd.message };
      }
      const plat = String(platform || '').toLowerCase();
      if (plat !== 'facebook' && plat !== 'instagram') {
        return { ok: false, http: 400, code: 'INVALID_PLATFORM', message: 'platform must be facebook or instagram' };
      }
      const ref = plat === 'instagram'
        ? parseInstagramUsername(String(username || '').trim())
        : parseFacebookUsername(String(username || '').trim());
      if (!ref) {
        return { ok: false, http: 400, code: 'INVALID_USERNAME', message: 'Invalid username' };
      }
      if (!boundService || typeof boundService.deleteCacheEntry !== 'function') {
        return { ok: false, http: 503, code: 'SERVICE_UNAVAILABLE', message: 'Cache service unavailable' };
      }
      const result = await boundService.deleteCacheEntry(ref.key);
      if (!result.ok) {
        const http = result.code === 'REFRESH_IN_PROGRESS' ? 409 : 400;
        return { ok: false, http, code: result.code, message: result.message };
      }
      audit.record({
        event: 'cache_entry_deleted',
        adminUsername: adminUsername || null,
        targetType: 'cache',
        targetId: ref.key,
        outcome: 'ok',
        meta: { platform: plat, username: ref.username || ref.key, memoryDeleted: result.memoryDeleted, diskDeleted: result.diskDeleted },
      });
      telemetry.record({
        category: 'cache_delete',
        outcome: 'ok',
        platform: plat,
        meta: { username: ref.username || String(ref.key).replace(/^instagram:/, '') },
      });
      return {
        ok: true,
        http: 200,
        data: {
          platform: plat,
          username: ref.username || String(ref.key).replace(/^instagram:/, ''),
          memoryDeleted: result.memoryDeleted,
          diskDeleted: result.diskDeleted,
          note: 'Entry removed from memory and disk. Future public requests may re-fetch subject to quota; no automatic refetch was triggered.',
        },
      };
    },
    async quotaStatus(quota) {
      const raw = quota && typeof quota.getStatus === 'function' ? await quota.getStatus() : null;
      return sanitizeQuotaStatus(raw, {
        dailyLimit: config.apify?.dailyRunLimit,
        maxChargeUsdPerRun: config.apify?.maxChargeUsdPerRun,
      });
    },
    usageSummary(period) {
      return telemetry.summarize(period);
    },
    usageEvents(opts) {
      return telemetry.listEvents(opts);
    },
    close() {
      auth.close();
    },
  };
}
