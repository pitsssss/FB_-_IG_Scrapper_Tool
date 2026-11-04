import "server-only";

/**
 * Server-only configuration. Do not expose these via NEXT_PUBLIC_*.
 */
export function getApiInternalUrl(): string {
  const raw = (process.env.API_INTERNAL_URL || "http://127.0.0.1:3000").trim();
  return raw.replace(/\/+$/, "");
}

export function getPublicDocsBasePath(): string {
  return "/docs";
}
