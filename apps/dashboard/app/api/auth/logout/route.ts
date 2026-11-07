import { NextResponse } from "next/server";
import { adminApiFetch } from "@/lib/auth/api";
import { clearAuthCookies, readCsrfToken, readSessionToken } from "@/lib/auth/cookies";

export const dynamic = "force-dynamic";

export async function POST() {
  const sessionToken = await readSessionToken();
  const csrfToken = await readCsrfToken();
  try {
    if (sessionToken) {
      await adminApiFetch("/api/v1/admin/logout", {
        method: "POST",
        sessionToken,
        csrfToken,
      });
    }
  } catch {
    /* still clear local cookies */
  }
  await clearAuthCookies();
  return NextResponse.json({ success: true, data: { loggedOut: true } });
}
