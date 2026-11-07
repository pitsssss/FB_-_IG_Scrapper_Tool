import { NextResponse } from "next/server";
import { adminApiFetch } from "@/lib/auth/api";
import { setAuthCookies } from "@/lib/auth/cookies";
import { assertBrowserOrigin } from "@/lib/auth/origin";

export const dynamic = "force-dynamic";

type SetupData = {
  admin: { id: number; username: string; email?: string | null };
  csrfToken: string;
  sessionToken?: string;
  verificationRequired?: boolean;
  smtpConfigured?: boolean;
};

export async function POST(request: Request) {
  const originGate = assertBrowserOrigin(request);
  if (!originGate.ok) {
    return NextResponse.json(originGate.body, { status: originGate.status });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { success: false, error: { code: "INVALID_JSON", message: "Invalid JSON body" } },
      { status: 400 },
    );
  }

  try {
    const result = await adminApiFetch<SetupData>("/api/v1/admin/setup", {
      method: "POST",
      body: JSON.stringify({
        setupToken: body.setupToken,
        email: body.email,
        username: body.username,
        password: body.password,
        confirmPassword: body.confirmPassword,
      }),
    });

    if (result.ok && result.body.data?.sessionToken && result.body.data.csrfToken) {
      await setAuthCookies(result.body.data.sessionToken, result.body.data.csrfToken);
      return NextResponse.json(
        {
          success: true,
          data: {
            admin: result.body.data.admin,
            csrfToken: result.body.data.csrfToken,
            verificationRequired: Boolean(result.body.data.verificationRequired),
            smtpConfigured: Boolean(result.body.data.smtpConfigured),
          },
        },
        { status: result.status },
      );
    }

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
