import "server-only";
import { getApiInternalUrl } from "@/lib/config/env";

export class ApiClientError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = code;
  }
}

export type HealthResponse = { status: string };

type FetchOptions = {
  timeoutMs?: number;
  signal?: AbortSignal;
};

/**
 * Minimal server-only HTTP client for future BFF integration.
 * Does not attach API keys or admin sessions (7C+).
 * Never logs response bodies that might contain secrets.
 */
export async function apiGetJson<T>(
  path: string,
  options: FetchOptions = {},
): Promise<T> {
  const base = getApiInternalUrl();
  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
  const timeoutMs = options.timeoutMs ?? 5_000;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  if (options.signal) {
    options.signal.addEventListener("abort", () => ctrl.abort(), { once: true });
  }

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { accept: "application/json" },
      cache: "no-store",
      signal: ctrl.signal,
    });
    if (!res.ok) {
      throw new ApiClientError("Upstream request failed", res.status);
    }
    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof ApiClientError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new ApiClientError("Upstream request timed out", 504);
    }
    throw new ApiClientError("Upstream unreachable", 502);
  } finally {
    clearTimeout(timer);
  }
}

/** Optional read-only health probe. Never treated as admin authentication. */
export async function fetchHealth(): Promise<
  | { ok: true; data: HealthResponse }
  | { ok: false; reason: string }
> {
  try {
    const data = await apiGetJson<HealthResponse>("/health", { timeoutMs: 3_000 });
    if (data?.status === "ok") return { ok: true, data };
    return { ok: false, reason: "Unexpected health payload" };
  } catch {
    return { ok: false, reason: "API health unreachable" };
  }
}
