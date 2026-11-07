import { NextResponse } from "next/server";
import { fetchCacheSummary, fetchQuotaStatus } from "@/lib/auth/management";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const kind = new URL(request.url).searchParams.get("kind") || "cache";
  try {
    if (kind === "quota") {
      const result = await fetchQuotaStatus();
      return NextResponse.json(result.body, { status: result.status });
    }
    const result = await fetchCacheSummary();
    return NextResponse.json(result.body, { status: result.status });
  } catch {
    return NextResponse.json(
      { success: false, error: { code: "API_UNAVAILABLE", message: "Management API unreachable" } },
      { status: 503 },
    );
  }
}
