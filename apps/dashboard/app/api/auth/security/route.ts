import { NextResponse } from "next/server";
import { adminApiFetch } from "@/lib/auth/api";
import { readCsrfToken, readSessionToken, setAuthCookies } from "@/lib/auth/cookies";

export const dynamic = "force-dynamic";

async function withSession() {
  const sessionToken = await readSessionToken();
  const csrfToken = await readCsrfToken();
  return { sessionToken, csrfToken };
}

export async function GET() {
  const { sessionToken } = await withSession();
  if (!sessionToken) {
    return NextResponse.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "Authentication required" } },
      { status: 401 },
    );
  }
  try {
    const result = await adminApiFetch("/api/v1/admin/security", {
      method: "GET",
      sessionToken,
    });
    return NextResponse.json(result.body, { status: result.status });
  } catch {
    return NextResponse.json(
      { success: false, error: { code: "API_UNAVAILABLE", message: "Management API is unreachable" } },
      { status: 503 },
    );
  }
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { success: false, error: { code: "INVALID_JSON", message: "Invalid JSON body" } },
      { status: 400 },
    );
  }

  const action = String(body.action || "");
  const { sessionToken, csrfToken } = await withSession();
  if (!sessionToken) {
    return NextResponse.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "Authentication required" } },
      { status: 401 },
    );
  }

  const map: Record<string, string> = {
    enrollEmail: "/api/v1/admin/security/email",
    verifyEmail: "/api/v1/admin/security/email/verify",
    resendEmail: "/api/v1/admin/security/email/resend",
    totpStart: "/api/v1/admin/security/totp/start",
    totpConfirm: "/api/v1/admin/security/totp/confirm",
    totpDisable: "/api/v1/admin/security/totp/disable",
    recoveryCodes: "/api/v1/admin/security/recovery-codes",
    changePassword: "/api/v1/admin/password",
  };
  const path = map[action];
  if (!path) {
    return NextResponse.json(
      { success: false, error: { code: "VALIDATION_ERROR", message: "Unknown security action" } },
      { status: 400 },
    );
  }

  try {
    const payload = { ...body };
    delete payload.action;
    const result = await adminApiFetch(path, {
      method: "POST",
      sessionToken,
      csrfToken,
      body: JSON.stringify(payload),
    });
    if (result.ok && result.body.data && typeof result.body.data === "object") {
      const data = result.body.data as { sessionToken?: string; csrfToken?: string };
      if (data.sessionToken && data.csrfToken) {
        await setAuthCookies(data.sessionToken, data.csrfToken);
      }
    }
    return NextResponse.json(result.body, { status: result.status });
  } catch {
    return NextResponse.json(
      { success: false, error: { code: "API_UNAVAILABLE", message: "Management API is unreachable" } },
      { status: 503 },
    );
  }
}
