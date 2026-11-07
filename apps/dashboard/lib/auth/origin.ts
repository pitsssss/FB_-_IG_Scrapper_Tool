import "server-only";

/**
 * Browser Origin / Referer allow-list for BFF mutations.
 * Must match the public browser origin (not Docker DNS names).
 */
export function getAllowedBrowserOrigins(): string[] {
  const raw = (process.env.ADMIN_ALLOWED_ORIGINS || "").trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((value) => {
      try {
        const u = new URL(value);
        return `${u.protocol}//${u.host}`;
      } catch {
        return "";
      }
    })
    .filter(Boolean);
}

function candidateFromRequest(request: Request): string | null {
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      const u = new URL(origin);
      return `${u.protocol}//${u.host}`;
    } catch {
      /* ignore */
    }
  }
  const referer = request.headers.get("referer");
  if (referer) {
    try {
      const u = new URL(referer);
      return `${u.protocol}//${u.host}`;
    } catch {
      /* ignore */
    }
  }
  return null;
}

export function assertBrowserOrigin(request: Request): { ok: true } | { ok: false; status: number; body: object } {
  const allowed = getAllowedBrowserOrigins();
  if (!allowed.length) {
    return {
      ok: false,
      status: 403,
      body: {
        success: false,
        error: { code: "CSRF_REJECTED", message: "ADMIN_ALLOWED_ORIGINS is not configured" },
      },
    };
  }
  const candidate = candidateFromRequest(request);
  if (!candidate || !allowed.includes(candidate)) {
    return {
      ok: false,
      status: 403,
      body: {
        success: false,
        error: { code: "CSRF_REJECTED", message: "Origin check failed" },
      },
    };
  }
  return { ok: true };
}
