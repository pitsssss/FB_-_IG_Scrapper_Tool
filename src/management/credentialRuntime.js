/**
 * Authoritative runtime Apify credential selection.
 *
 * Precedence:
 * 1. Active managed token (decrypted in memory) when status === 'active'
 * 2. Environment token ONLY when no managed row exists (or never connected)
 * 3. Explicit disconnect (tombstone) disables managed use AND blocks env fallback
 */

export function createCredentialRuntime({ envToken = '' } = {}) {
  let managed = {
    status: 'none', // none | active | disconnected | invalid
    token: null,
    usernameHint: null,
    lastVerifiedAt: null,
    lastVerifyOk: null,
    lastVerifyCode: null,
  };

  return {
    /** Load snapshot from persistence (does not log secrets). */
    applyManagedState(state) {
      managed = {
        status: state?.status || 'none',
        token: state?.token ?? null,
        usernameHint: state?.usernameHint ?? null,
        lastVerifiedAt: state?.lastVerifiedAt ?? null,
        lastVerifyOk: state?.lastVerifyOk ?? null,
        lastVerifyCode: state?.lastVerifyCode ?? null,
      };
    },

    setActiveToken(token, meta = {}) {
      managed = {
        status: 'active',
        token,
        usernameHint: meta.usernameHint ?? managed.usernameHint,
        lastVerifiedAt: meta.lastVerifiedAt ?? new Date().toISOString(),
        lastVerifyOk: true,
        lastVerifyCode: 'ok',
      };
    },

    setDisconnected() {
      managed = {
        status: 'disconnected',
        token: null,
        usernameHint: null,
        lastVerifiedAt: managed.lastVerifiedAt,
        lastVerifyOk: managed.lastVerifyOk,
        lastVerifyCode: managed.lastVerifyCode,
      };
    },

    setInvalid(code = 'invalid') {
      managed = {
        ...managed,
        status: managed.status === 'disconnected' ? 'disconnected' : 'invalid',
        token: null,
        lastVerifyOk: false,
        lastVerifyCode: code,
        lastVerifiedAt: new Date().toISOString(),
      };
    },

    getApifyToken() {
      if (managed.status === 'active' && managed.token) return managed.token;
      if (managed.status === 'disconnected') return '';
      if (managed.status === 'invalid') return '';
      // no managed state → env bootstrap fallback
      return envToken || '';
    },

    /**
     * Safe public status for admin UI (never includes token).
     */
    getStatus() {
      const token = this.getApifyToken();
      let source = 'none';
      if (managed.status === 'active' && managed.token) source = 'managed';
      else if (managed.status === 'disconnected') source = 'disconnected';
      else if (managed.status === 'invalid') source = 'invalid';
      else if (envToken) source = 'environment';

      return {
        connected: Boolean(token),
        source,
        managedStatus: managed.status,
        usernameHint: managed.usernameHint,
        lastVerifiedAt: managed.lastVerifiedAt,
        lastVerifyOk: managed.lastVerifyOk,
        lastVerifyCode: managed.lastVerifyCode,
        envTokenConfigured: Boolean(envToken),
        envFallbackSuppressed: managed.status === 'disconnected' || managed.status === 'invalid',
      };
    },
  };
}
