import "server-only";

/**
 * Server-only configuration. Do not expose these via NEXT_PUBLIC_*.
 */
export function getApiInternalUrl(): string {
  const raw = (process.env.API_INTERNAL_URL || "http://127.0.0.1:3000").trim();
  return raw.replace(/\/+$/, "");
}

/** Shared BFF↔API secret. Never send to the browser. */
export function getAdminInternalSecret(): string {
  return (process.env.ADMIN_INTERNAL_SECRET || "").trim();
}

export function getPublicDocsBasePath(): string {
  return "/docs";
}
