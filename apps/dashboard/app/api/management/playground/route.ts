import { NextResponse } from "next/server";
import { adminApiFetch } from "@/lib/auth/api";
import { readCsrfToken, readSessionToken } from "@/lib/auth/cookies";

export const dynamic = "force-dynamic";

async function session() {
  const sessionToken = await readSessionToken();
  const csrfToken = await readCsrfToken();
  return { sessionToken, csrfToken };
}

export async function GET(request: Request) {
  const { sessionToken } = await session();
  if (!sessionToken) {
    return NextResponse.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "Authentication required" } },
      { status: 401 },
    );
  }
  const url = new URL(request.url);
  const qs = url.searchParams.toString();
  try {
    const result = await adminApiFetch(`/api/v1/admin/playground/cache?${qs}`, {
      method: "GET",
      sessionToken,
    });
    return NextResponse.json(result.body, { status: result.status });
  } catch {
    return NextResponse.json(
      { success: false, error: { code: "API_UNAVAILABLE", message: "Management API unreachable" } },
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
  const map: Record<string, string> = {
    prepare: "/api/v1/admin/playground/prepare",
    confirm: "/api/v1/admin/playground/confirm",
    cancel: "/api/v1/admin/playground/cancel",
  };
  const path = map[action];
  if (!path) {
    return NextResponse.json(
      { success: false, error: { code: "VALIDATION_ERROR", message: "Unknown playground action" } },
      { status: 400 },
    );
  }

  const { sessionToken, csrfToken } = await session();
  if (!sessionToken) {
    return NextResponse.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "Authentication required" } },
      { status: 401 },
    );
  }

  const payload = { ...body };
  delete payload.action;

  try {
    const result = await adminApiFetch(path, {
      method: "POST",
      sessionToken,
      csrfToken,
      body: JSON.stringify(payload),
    });
    return NextResponse.json(result.body, { status: result.status });
  } catch {
    return NextResponse.json(
      { success: false, error: { code: "API_UNAVAILABLE", message: "Management API unreachable" } },
      { status: 503 },
    );
  }
}
