import "server-only";
import { getApiInternalUrl } from "@/lib/config/env";
import { CSRF_HEADER } from "@/lib/auth/constants";

export type AdminApiResult<T = unknown> = {
  ok: boolean;
  status: number;
  body: {
    success?: boolean;
    data?: T;
    error?: { code: string; message: string };
  };
};

function internalHeaders(extra: HeadersInit = {}): HeadersInit {
  const secret = process.env.ADMIN_INTERNAL_SECRET || "";
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json",
  };
  if (secret) headers["x-admin-internal-secret"] = secret;
  return { ...headers, ...extra };
}

export async function adminApiFetch<T = unknown>(
  pathname: string,
  init: RequestInit & { sessionToken?: string | null; csrfToken?: string | null } = {},
): Promise<AdminApiResult<T>> {
  const { sessionToken, csrfToken, headers: extraHeaders, ...rest } = init;
  const headers: Record<string, string> = {
    ...(internalHeaders() as Record<string, string>),
  };
  if (extraHeaders) {
    const h = new Headers(extraHeaders);
    h.forEach((v, k) => {
      headers[k] = v;
    });
  }
  if (sessionToken) headers["x-admin-session"] = sessionToken;
  if (csrfToken) headers[CSRF_HEADER] = csrfToken;

  const url = `${getApiInternalUrl()}${pathname}`;
  const res = await fetch(url, {
    ...rest,
    headers,
    cache: "no-store",
  });
  let body: AdminApiResult<T>["body"];
  try {
    body = (await res.json()) as AdminApiResult<T>["body"];
  } catch {
    body = { success: false, error: { code: "INVALID_RESPONSE", message: "Invalid response from API" } };
  }
  return { ok: res.ok && body?.success !== false, status: res.status, body };
}

export async function getSetupStatus() {
  return adminApiFetch<{
    status: string;
    setupRequired: boolean;
    setupAvailable: boolean;
    message: string;
  }>("/api/v1/admin/setup/status", { method: "GET" });
}

export async function getAdminMe(sessionToken: string | null) {
  if (!sessionToken) {
    return {
      ok: false,
      status: 401,
      body: { success: false, error: { code: "UNAUTHORIZED", message: "Authentication required" } },
    } satisfies AdminApiResult;
  }
  return adminApiFetch<{ admin: { id: number; username: string } }>("/api/v1/admin/me", {
    method: "GET",
    sessionToken,
  });
}
