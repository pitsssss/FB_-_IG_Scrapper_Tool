import { NextResponse } from "next/server";
import { revokeApiKey, rotateApiKey, updateApiKeyScopes } from "@/lib/auth/management";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id: idRaw } = await context.params;
  const id = Number(idRaw);
  if (!Number.isInteger(id) || id < 1) {
    return NextResponse.json(
      { success: false, error: { code: "VALIDATION_ERROR", message: "Invalid key id" } },
      { status: 400 },
    );
  }

  let body: { action?: string; scopes?: { facebook?: string[]; instagram?: string[] } };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: { code: "INVALID_JSON", message: "Invalid JSON body" } },
      { status: 400 },
    );
  }

  try {
    if (body.action === "revoke") {
      const result = await revokeApiKey(id);
      return NextResponse.json(result.body, { status: result.status });
    }
    if (body.action === "rotate") {
      const result = await rotateApiKey(id);
      return NextResponse.json(result.body, { status: result.status });
    }
    if (body.action === "scopes") {
      const result = await updateApiKeyScopes(id, {
        facebook: body.scopes?.facebook || [],
        instagram: body.scopes?.instagram || [],
      });
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
