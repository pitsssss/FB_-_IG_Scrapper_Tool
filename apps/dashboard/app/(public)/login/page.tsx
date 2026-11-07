import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Alert } from "@/components/ui/alert";
import { LoginForm } from "@/features/auth/login-form";
import { getSetupStatus } from "@/lib/auth/api";
import { redirectIfAuthenticated } from "@/lib/auth/session";

export const metadata = { title: "Login" };
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  await redirectIfAuthenticated();
  let setupHint: string | null = null;
  try {
    const setup = await getSetupStatus();
    if (setup.body.data?.setupRequired) {
      setupHint = setup.body.data.setupAvailable
        ? "Initial setup is available."
        : setup.body.data.message;
    }
  } catch {
    setupHint = "Management API unreachable — start the API server before signing in.";
  }

  return (
    <div>
      <PageHeader
        title="Administrator login"
        description="Server-side sessions with HttpOnly cookies. Public API keys cannot sign in here."
      />
      {setupHint ? (
        <Alert className="mb-6" variant="info" title="Setup required">
          {setupHint}{" "}
          <Link href="/setup" className="underline underline-offset-2">
            Open setup
          </Link>
        </Alert>
      ) : null}
      <LoginForm />
    </div>
  );
}
