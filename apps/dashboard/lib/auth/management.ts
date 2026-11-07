import "server-only";
import { adminApiFetch } from "@/lib/auth/api";
import { readCsrfToken, readSessionToken } from "@/lib/auth/cookies";

async function withSession<T>(
  pathname: string,
  init: RequestInit & { csrf?: boolean } = {},
) {
  const sessionToken = await readSessionToken();
  const csrfToken = init.csrf === false ? null : await readCsrfToken();
  const { csrf, ...rest } = init;
  void csrf;
  return adminApiFetch<T>(pathname, {
    ...rest,
    sessionToken,
    csrfToken,
  });
}

export async function fetchProviderStatus() {
  return withSession("/api/v1/admin/provider", { method: "GET", csrf: false });
}

export async function connectProvider(token: string) {
  return withSession("/api/v1/admin/provider/connect", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

export async function validateProvider(token: string) {
  return withSession("/api/v1/admin/provider/validate", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

export async function disconnectProvider() {
  return withSession("/api/v1/admin/provider/disconnect", { method: "POST" });
}

export async function fetchApiKeys() {
  return withSession("/api/v1/admin/api-keys", { method: "GET", csrf: false });
}

export async function createApiKey(payload: {
  clientName: string;
  scopes: { facebook: string[]; instagram: string[] };
}) {
  return withSession("/api/v1/admin/api-keys", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function revokeApiKey(id: number) {
  return withSession(`/api/v1/admin/api-keys/${id}/revoke`, { method: "POST" });
}

export async function rotateApiKey(id: number) {
  return withSession(`/api/v1/admin/api-keys/${id}/rotate`, { method: "POST" });
}

export async function updateApiKeyScopes(
  id: number,
  scopes: { facebook: string[]; instagram: string[] },
) {
  return withSession(`/api/v1/admin/api-keys/${id}/scopes`, {
    method: "PUT",
    body: JSON.stringify({ scopes }),
  });
}

export async function fetchCacheSummary() {
  return withSession("/api/v1/admin/cache", { method: "GET", csrf: false });
}

export async function fetchQuotaStatus() {
  return withSession("/api/v1/admin/quota", { method: "GET", csrf: false });
}
