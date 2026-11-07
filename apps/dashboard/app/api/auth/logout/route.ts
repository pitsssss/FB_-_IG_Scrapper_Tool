import { NextResponse } from "next/server";
import { adminApiFetch } from "@/lib/auth/api";
import { clearAuthCookies, readCsrfToken, readSessionToken } from "@/lib/auth/cookies";
import { assertBrowserOrigin } from "@/lib/auth/origin";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const originGate = assertBrowserOrigin(request);
  if (!originGate.ok) {
    return NextResponse.json(originGate.body, { status: originGate.status });
  }

  const sessionToken = await readSessionToken();
  const csrfCookie = await readCsrfToken();
  const csrfHeader = request.headers.get("x-csrf-token") || "";

  if (sessionToken) {
    if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
      return NextResponse.json(
        { success: false, error: { code: "CSRF_REJECTED", message: "Invalid CSRF token" } },
        { status: 403 },
      );
    }
    try {
      await adminApiFetch("/api/v1/admin/logout", {
        method: "POST",
        sessionToken,
        csrfToken: csrfHeader,
      });
    } catch {
      /* still clear local cookies after CSRF passed */
    }
  }

  await clearAuthCookies();
  return NextResponse.json({ success: true, data: { loggedOut: true } });
}
