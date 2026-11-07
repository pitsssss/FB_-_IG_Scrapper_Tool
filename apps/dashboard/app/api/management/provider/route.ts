import { NextResponse } from "next/server";
import {
  connectProvider,
  disconnectProvider,
  fetchProviderStatus,
  validateProvider,
} from "@/lib/auth/management";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await fetchProviderStatus();
    return NextResponse.json(result.body, { status: result.status });
  } catch {
    return NextResponse.json(
      { success: false, error: { code: "API_UNAVAILABLE", message: "Management API unreachable" } },
      { status: 503 },
    );
  }
}

export async function POST(request: Request) {
  let body: { action?: string; token?: string };
  try {
    body = (await request.json()) as { action?: string; token?: string };
  } catch {
    return NextResponse.json(
      { success: false, error: { code: "INVALID_JSON", message: "Invalid JSON body" } },
      { status: 400 },
    );
  }

  try {
    if (body.action === "validate") {
      const result = await validateProvider(String(body.token || ""));
      return NextResponse.json(result.body, { status: result.status });
    }
    if (body.action === "connect") {
      const result = await connectProvider(String(body.token || ""));
      return NextResponse.json(result.body, { status: result.status });
    }
    if (body.action === "disconnect") {
      const result = await disconnectProvider();
      return NextResponse.json(result.body, { status: result.status });
    }
    return NextResponse.json(
      { success: false, error: { code: "VALIDATION_ERROR", message: "Unknown action" } },
      { status: 400 },
    );
  } catch {
    return NextResponse.json(
      { success: false, error: { code: "API_UNAVAILABLE", message: "Management API unreachable" } },
      { status: 503 },
    );
  }
}
