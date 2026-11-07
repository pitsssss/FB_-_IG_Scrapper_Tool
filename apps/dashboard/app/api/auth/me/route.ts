import { NextResponse } from "next/server";
import { getAdminMe } from "@/lib/auth/api";
import { readSessionToken } from "@/lib/auth/cookies";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const token = await readSessionToken();
    const result = await getAdminMe(token);
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
