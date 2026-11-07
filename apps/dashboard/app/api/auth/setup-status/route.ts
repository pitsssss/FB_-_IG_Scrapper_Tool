import { NextResponse } from "next/server";
import { getSetupStatus } from "@/lib/auth/api";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await getSetupStatus();
    return NextResponse.json(result.body, { status: result.status });
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "API_UNAVAILABLE",
          message: "Management API is unreachable. Ensure the API server is running and API_INTERNAL_URL is set.",
        },
      },
      { status: 503 },
    );
  }
}
