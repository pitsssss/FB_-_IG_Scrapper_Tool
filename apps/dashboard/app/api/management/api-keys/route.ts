import { NextResponse } from "next/server";
import { createApiKey, fetchApiKeys } from "@/lib/auth/management";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await fetchApiKeys();
    return NextResponse.json(result.body, { status: result.status });
  } catch {
    return NextResponse.json(
      { success: false, error: { code: "API_UNAVAILABLE", message: "Management API unreachable" } },
      { status: 503 },
    );
  }
}

export async function POST(request: Request) {
  let body: {
    clientName?: string;
    scopes?: { facebook?: string[]; instagram?: string[] };
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: { code: "INVALID_JSON", message: "Invalid JSON body" } },
      { status: 400 },
    );
  }

  try {
    const result = await createApiKey({
      clientName: String(body.clientName || ""),
      scopes: {
        facebook: body.scopes?.facebook || [],
        instagram: body.scopes?.instagram || [],
      },
    });
    return NextResponse.json(result.body, { status: result.status });
  } catch {
    return NextResponse.json(
      { success: false, error: { code: "API_UNAVAILABLE", message: "Management API unreachable" } },
      { status: 503 },
    );
  }
}
