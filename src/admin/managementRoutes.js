/**
 * Admin management routes for provider credentials, API keys, cache, and quota.
 * All handlers assume the caller already authenticated the admin session (CSRF for mutations).
 */

export function createManagementHandlers({ hub, service, config }) {
  const err = (code, message) => ({ success: false, error: { code, message } });

  function requireAdmin(req, { csrf = true } = {}) {
    return hub.auth.requireSession(req, { requireCsrf: csrf });
  }

  return {
    async providerStatus(req) {
      const gate = requireAdmin(req, { csrf: false });
      if (!gate.ok) return { http: gate.http, body: err(gate.code, gate.message) };
      return { http: 200, body: { success: true, data: hub.providers.status() } };
    },

    async providerValidate(req, body) {
      const gate = requireAdmin(req, { csrf: true });
      if (!gate.ok) return { http: gate.http, body: err(gate.code, gate.message) };
      const result = await hub.providers.validate(body?.token);
      if (!result.ok) {
        return {
          http: result.code === 'NETWORK_TIMEOUT' || result.code === 'NETWORK_ERROR' ? 502 : 400,
          body: err(result.code, result.message),
        };
      }
      return {
        http: 200,
        body: {
          success: true,
          data: {
            valid: true,
            usernameHint: result.usernameHint,
            note: 'Validation confirms token authenticity only — not available credit or Actor access.',
          },
        },
      };
    },

    async providerConnect(req, body) {
      const gate = requireAdmin(req, { csrf: true });
      if (!gate.ok) return { http: gate.http, body: err(gate.code, gate.message) };
      const result = await hub.providers.connect(body?.token, { adminUsername: gate.admin.username });
      if (!result.ok) return { http: result.http, body: err(result.code, result.message) };
      if (result.audit) hub.audit.record({ ...result.audit, adminUsername: gate.admin.username });
      return { http: 200, body: { success: true, data: result.status } };
    },

    async providerDisconnect(req) {
      const gate = requireAdmin(req, { csrf: true });
      if (!gate.ok) return { http: gate.http, body: err(gate.code, gate.message) };
      const result = await hub.providers.disconnect({ adminUsername: gate.admin.username });
      if (result.audit) hub.audit.record({ ...result.audit, adminUsername: gate.admin.username });
      return { http: 200, body: { success: true, data: result.status } };
    },

    async listApiKeys(req) {
      const gate = requireAdmin(req, { csrf: false });
      if (!gate.ok) return { http: gate.http, body: err(gate.code, gate.message) };
      const managed = hub.apiKeys.list();
      const environment = hub.keyAuth.listEnvironmentMeta();
      return {
        http: 200,
        body: {
          success: true,
          data: { managed, environment },
        },
      };
    },

    async createApiKey(req, body) {
      const gate = requireAdmin(req, { csrf: true });
      if (!gate.ok) return { http: gate.http, body: err(gate.code, gate.message) };
      const result = hub.apiKeys.create({
        clientName: body?.clientName,
        scopes: body?.scopes,
        envClientNames: hub.keyAuth.envClientNames(),
      });
      if (!result.ok) {
        const http = result.code === 'NAME_COLLISION' ? 409 : 400;
        return { http, body: err(result.code, result.message) };
      }
      hub.audit.record({
        event: 'api_key_created',
        adminUsername: gate.admin.username,
        targetType: 'api_key',
        targetId: result.meta.id,
        outcome: 'ok',
        meta: { clientName: result.meta.clientName },
      });
      return {
        http: 201,
        body: {
          success: true,
          data: {
            key: result.key,
            meta: result.meta,
            message: 'Copy this key now. It will not be shown again.',
          },
        },
      };
    },

    async revokeApiKey(req, id) {
      const gate = requireAdmin(req, { csrf: true });
      if (!gate.ok) return { http: gate.http, body: err(gate.code, gate.message) };
      const result = hub.apiKeys.revoke(Number(id));
      if (!result.ok) {
        const http = result.code === 'NOT_FOUND' ? 404 : 400;
        return { http, body: err(result.code, result.message) };
      }
      hub.audit.record({
        event: 'api_key_revoked',
        adminUsername: gate.admin.username,
        targetType: 'api_key',
        targetId: id,
        outcome: 'ok',
      });
      return { http: 200, body: { success: true, data: { meta: result.meta } } };
    },

    async rotateApiKey(req, id) {
      const gate = requireAdmin(req, { csrf: true });
      if (!gate.ok) return { http: gate.http, body: err(gate.code, gate.message) };
      const result = hub.apiKeys.rotate(Number(id));
      if (!result.ok) {
        const http = result.code === 'NOT_FOUND' ? 404 : 400;
        return { http, body: err(result.code, result.message) };
      }
      hub.audit.record({
        event: 'api_key_rotated',
        adminUsername: gate.admin.username,
        targetType: 'api_key',
        targetId: id,
        outcome: 'ok',
      });
      return {
        http: 200,
        body: {
          success: true,
          data: {
            key: result.key,
            meta: result.meta,
            message: 'Copy this key now. It will not be shown again.',
          },
        },
      };
    },

    async updateApiKeyScopes(req, id, body) {
      const gate = requireAdmin(req, { csrf: true });
      if (!gate.ok) return { http: gate.http, body: err(gate.code, gate.message) };
      const result = hub.apiKeys.updateScopes(Number(id), body?.scopes);
      if (!result.ok) {
        const http = result.code === 'NOT_FOUND' ? 404 : 400;
        return { http, body: err(result.code, result.message) };
      }
      hub.audit.record({
        event: 'api_key_scopes_updated',
        adminUsername: gate.admin.username,
        targetType: 'api_key',
        targetId: id,
        outcome: 'ok',
      });
      return { http: 200, body: { success: true, data: { meta: result.meta } } };
    },

    async cacheSummary(req) {
      const gate = requireAdmin(req, { csrf: false });
      if (!gate.ok) return { http: gate.http, body: err(gate.code, gate.message) };
      const data = await hub.cacheSummary();
      return { http: 200, body: { success: true, data } };
    },

    async quotaStatus(req) {
      const gate = requireAdmin(req, { csrf: false });
      if (!gate.ok) return { http: gate.http, body: err(gate.code, gate.message) };
      const quota = service?.quota || null;
      const data = await hub.quotaStatus(quota);
      return { http: 200, body: { success: true, data } };
    },

    async healthDetail(req) {
      const gate = requireAdmin(req, { csrf: false });
      if (!gate.ok) return { http: gate.http, body: err(gate.code, gate.message) };
      const provider = hub.providers.status();
      return {
        http: 200,
        body: {
          success: true,
          data: {
            status: 'ok',
            provider: {
              connected: provider.connected,
              source: provider.source,
            },
            envApiKeyCount: (config.apiKeys || []).length,
            managedApiKeyCount: hub.apiKeys.list().filter((k) => !k.revoked).length,
          },
        },
      };
    },

    async playgroundCache(req, query) {
      const gate = requireAdmin(req, { csrf: false });
      if (!gate.ok) return { http: gate.http, body: err(gate.code, gate.message) };
      const pg = hub.playground;
      if (!pg) return { http: 503, body: err('PLAYGROUND_UNAVAILABLE', 'Playground service is not bound') };
      const result = await pg.readCache({
        platform: query?.platform,
        username: query?.username || query?.page,
        limit: query?.limit,
      });
      if (!result.ok) return { http: result.http, body: err(result.code, result.message) };
      return { http: 200, body: result.body };
    },

    async playgroundPrepare(req, body) {
      const gate = requireAdmin(req, { csrf: true });
      if (!gate.ok) return { http: gate.http, body: err(gate.code, gate.message) };
      const pg = hub.playground;
      if (!pg) return { http: 503, body: err('PLAYGROUND_UNAVAILABLE', 'Playground service is not bound') };
      const result = await pg.prepareRefresh({
        platform: body?.platform,
        username: body?.username || body?.page,
        limit: body?.limit,
        adminId: gate.admin.id,
        sessionId: gate.sessionId,
      });
      if (!result.ok) {
        const bodyOut = err(result.code, result.message);
        if (result.quota) bodyOut.error.quota = result.quota;
        return { http: result.http, body: bodyOut };
      }
      return { http: 200, body: { success: true, data: result.data } };
    },

    async playgroundConfirm(req, body) {
      const gate = requireAdmin(req, { csrf: true });
      if (!gate.ok) return { http: gate.http, body: err(gate.code, gate.message) };
      const pg = hub.playground;
      if (!pg) return { http: 503, body: err('PLAYGROUND_UNAVAILABLE', 'Playground service is not bound') };
      const result = await pg.confirmRefresh({
        confirmationToken: body?.confirmationToken,
        adminId: gate.admin.id,
        sessionId: gate.sessionId,
        adminUsername: gate.admin.username,
      });
      if (!result.ok) {
        const bodyOut = err(result.code, result.message);
        if (result.quota) bodyOut.error.quota = result.quota;
        return { http: result.http, body: bodyOut };
      }
      return { http: 200, body: result.body };
    },

    async playgroundCancel(req, body) {
      const gate = requireAdmin(req, { csrf: true });
      if (!gate.ok) return { http: gate.http, body: err(gate.code, gate.message) };
      const pg = hub.playground;
      if (!pg) return { http: 503, body: err('PLAYGROUND_UNAVAILABLE', 'Playground service is not bound') };
      const result = await pg.cancelConfirmation({
        confirmationToken: body?.confirmationToken,
        adminId: gate.admin.id,
        sessionId: gate.sessionId,
      });
      if (!result.ok) return { http: result.http, body: err(result.code, result.message) };
      return { http: 200, body: { success: true, data: result.data || { cancelled: true } } };
    },

    async getSettings(req) {
      const gate = requireAdmin(req, { csrf: false });
      if (!gate.ok) return { http: gate.http, body: err(gate.code, gate.message) };
      if (!hub.settings) return { http: 503, body: err('SETTINGS_UNAVAILABLE', 'Settings service unavailable') };
      return { http: 200, body: { success: true, data: hub.settings.getSnapshot() } };
    },

    async patchSettings(req, body) {
      const gate = requireAdmin(req, { csrf: true });
      if (!gate.ok) return { http: gate.http, body: err(gate.code, gate.message) };
      if (!hub.settings) return { http: 503, body: err('SETTINGS_UNAVAILABLE', 'Settings service unavailable') };
      const result = hub.settings.patch(body?.settings || body, {
        adminUsername: gate.admin.username,
        confirmWarmEnable: Boolean(body?.confirmWarmEnable),
      });
      if (!result.ok) return { http: result.http, body: err(result.code, result.message) };
      hub.telemetry?.record({
        category: 'settings_change',
        outcome: 'ok',
        meta: { applied: result.applied, pendingRestart: result.pendingRestart },
      });
      return {
        http: 200,
        body: {
          success: true,
          data: {
            ...result.snapshot,
            applied: result.applied,
            pendingRestart: result.pendingRestart,
          },
        },
      };
    },

    async clearSetting(req, body) {
      const gate = requireAdmin(req, { csrf: true });
      if (!gate.ok) return { http: gate.http, body: err(gate.code, gate.message) };
      if (!hub.settings) return { http: 503, body: err('SETTINGS_UNAVAILABLE', 'Settings service unavailable') };
      const result = hub.settings.clearOverride(body?.key, { adminUsername: gate.admin.username });
      if (!result.ok) return { http: result.http, body: err(result.code, result.message) };
      return { http: 200, body: { success: true, data: result.snapshot } };
    },

    async deleteCacheEntry(req, body) {
      const gate = requireAdmin(req, { csrf: true });
      if (!gate.ok) return { http: gate.http, body: err(gate.code, gate.message) };
      const result = await hub.deleteCacheEntry({
        platform: body?.platform,
        username: body?.username || body?.page,
        currentPassword: body?.currentPassword,
        confirm: body?.confirm,
        adminUsername: gate.admin.username,
      });
      if (!result.ok) return { http: result.http, body: err(result.code, result.message) };
      return { http: 200, body: { success: true, data: result.data } };
    },

    async usageSummary(req, query) {
      const gate = requireAdmin(req, { csrf: false });
      if (!gate.ok) return { http: gate.http, body: err(gate.code, gate.message) };
      const period = ['today', '7d', '30d'].includes(query?.period) ? query.period : 'today';
      const summary = hub.usageSummary(period);
      const quota = service?.quota || null;
      const quotaData = await hub.quotaStatus(quota);
      return {
        http: 200,
        body: {
          success: true,
          data: {
            ...summary,
            quota: quotaData,
          },
        },
      };
    },

    async usageEvents(req, query) {
      const gate = requireAdmin(req, { csrf: false });
      if (!gate.ok) return { http: gate.http, body: err(gate.code, gate.message) };
      const period = ['today', '7d', '30d'].includes(query?.period) ? query.period : 'today';
      const limit = Number.parseInt(query?.limit || '50', 10);
      const offset = Number.parseInt(query?.offset || '0', 10);
      return {
        http: 200,
        body: {
          success: true,
          data: hub.usageEvents({ period, limit, offset }),
        },
      };
    },
  };
}
