import { NextResponse } from "next/server";
import { adminApiFetch } from "@/lib/auth/api";
import { readSessionToken } from "@/lib/auth/cookies";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const sessionToken = await readSessionToken();
  const url = new URL(request.url);
  const kind = url.searchParams.get("kind") || "summary";
  const period = url.searchParams.get("period") || "today";
  const limit = url.searchParams.get("limit") || "50";
  const path =
    kind === "events"
      ? `/api/v1/admin/usage/events?period=${encodeURIComponent(period)}&limit=${encodeURIComponent(limit)}`
      : `/api/v1/admin/usage/summary?period=${encodeURIComponent(period)}`;
  const result = await adminApiFetch(path, {
    method: "GET",
    sessionToken,
  });
  return NextResponse.json(result.body, { status: result.status });
}
