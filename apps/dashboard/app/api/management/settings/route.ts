import { NextResponse } from "next/server";
import { adminApiFetch } from "@/lib/auth/api";
import { readCsrfToken, readSessionToken } from "@/lib/auth/cookies";

export const dynamic = "force-dynamic";

export async function GET() {
  const sessionToken = await readSessionToken();
  const result = await adminApiFetch("/api/v1/admin/settings", {
    method: "GET",
    sessionToken,
  });
  return NextResponse.json(result.body, { status: result.status });
}

export async function PATCH(request: Request) {
  const sessionToken = await readSessionToken();
  const csrfToken = await readCsrfToken();
  const body = await request.json().catch(() => ({}));
  const result = await adminApiFetch("/api/v1/admin/settings", {
    method: "PATCH",
    sessionToken,
    csrfToken,
    body: JSON.stringify(body),
  });
  return NextResponse.json(result.body, { status: result.status });
}
