import { NextResponse } from "next/server";
import { adminApiFetch } from "@/lib/auth/api";
import { readCsrfToken, readSessionToken } from "@/lib/auth/cookies";

export const dynamic = "force-dynamic";

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

  const sessionToken = await readSessionToken();
  const csrfToken = (await readCsrfToken()) || String(request.headers.get("x-csrf-token") || "");
  if (!sessionToken) {
    return NextResponse.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "Authentication required" } },
      { status: 401 },
    );
  }

  try {
    const result = await adminApiFetch("/api/v1/admin/mfa/verify", {
      method: "POST",
      sessionToken,
      csrfToken,
      body: JSON.stringify({ code: body.code }),
    });
    return NextResponse.json(result.body, { status: result.status });
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: { code: "API_UNAVAILABLE", message: "Management API is unreachable" },
      },
      { status: 503 },
    );
  }
}
