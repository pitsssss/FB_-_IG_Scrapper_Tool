import { openManagementDb, integrityCheck } from './db.js';
import { createAuthService } from './authService.js';
import { createCredentialRuntime } from './credentialRuntime.js';
import { createProviderCredentialService } from './providerCredentials.js';
import { createApiKeyService } from './apiKeys.js';
import { createAuditLogger } from './audit.js';
import { createKeyAuthenticator } from './keyAuthenticator.js';
import { listCacheEntries, sanitizeQuotaStatus } from './opsInspect.js';
import { createPlaygroundService } from './playground.js';

/**
 * Single management hub: shared SQLite + auth + provider + API keys.
 */
export function createManagementHub(config, {
  verifyOpts,
  getEncryptionKey,
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
  const runtime = createCredentialRuntime({ envToken: config.apify?.token || '' });

  // Bind runtime token onto config.apify so existing providers see hot updates.
  if (config.apify && typeof config.apify === 'object') {
    const envSnapshot = config.apify.token || '';
    // Preserve env for runtime constructor already captured; redefine getter.
    runtime.applyManagedState({ status: 'none' });
    Object.defineProperty(config.apify, 'token', {
      configurable: true,
      enumerable: true,
      get() {
        return runtime.getApifyToken();
      },
      // Allow tests that assign token directly before hub — ignored after defineProperty
      set() { /* no-op: use provider service */ },
    });
    // Re-seed env into runtime (constructor used pre-redefine value)
    // createCredentialRuntime already received envToken string copy — OK.
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
    allowedPages: config.allowedPages || [],
    instagramAllowedProfiles: config.instagramAllowedProfiles || [],
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

  /** Playground is bound later via bindService(service) once HTTP app has createService(). */
  let playground = null;

  return {
    auth,
    db,
    path: opened.path,
    audit,
    runtime,
    providers,
    apiKeys,
    keyAuth,
    get playground() {
      return playground;
    },
    bindService(service) {
      playground = createPlaygroundService({
        db,
        service,
        config,
        getProviderStatus: () => providers.status(),
        audit,
      });
      return playground;
    },
    async cacheSummary() {
      return listCacheEntries({
        cacheDir: config.cacheDir,
        freshTtlMs: config.freshTtlMs,
        limit: 200,
      });
    },
    async quotaStatus(quota) {
      const raw = quota && typeof quota.getStatus === 'function' ? await quota.getStatus() : null;
      return sanitizeQuotaStatus(raw, {
        dailyLimit: config.apify?.dailyRunLimit,
        maxChargeUsdPerRun: config.apify?.maxChargeUsdPerRun,
      });
    },
    close() {
      auth.close();
    },
  };
}
