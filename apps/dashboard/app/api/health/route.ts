import { NextResponse } from "next/server";

/** Lightweight readiness for Docker healthchecks — no secrets, no upstream calls. */
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ status: "ok", service: "dashboard" }, { status: 200 });
}
