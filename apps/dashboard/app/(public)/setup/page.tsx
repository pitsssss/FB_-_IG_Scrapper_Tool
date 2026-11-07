import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Alert } from "@/components/ui/alert";
import { SetupForm } from "@/features/auth/setup-form";
import { getSetupStatus } from "@/lib/auth/api";
import { redirectIfAuthenticated } from "@/lib/auth/session";

export const metadata = { title: "Setup" };
export const dynamic = "force-dynamic";

export default async function SetupPage() {
  await redirectIfAuthenticated();

  let status = {
    setupAvailable: false,
    setupRequired: true,
    smtpConfigured: false,
    message: "Unable to reach the management API.",
  };
  try {
    const result = await getSetupStatus();
    if (result.body.data) {
      status = {
        setupAvailable: Boolean(result.body.data.setupAvailable),
        setupRequired: Boolean(result.body.data.setupRequired),
        smtpConfigured: Boolean(result.body.data.smtpConfigured),
        message: result.body.data.message || status.message,
      };
    }
  } catch {
    /* keep defaults */
  }

  return (
    <div>
      <PageHeader
        title="Create administrator account"
        description="One-time bootstrap with BOOTSTRAP_SETUP_TOKEN. No public registration."
      />
      {!status.setupRequired ? (
        <Alert className="mb-6" variant="info" title="Already configured">
          Continue to{" "}
          <Link href="/login" className="underline underline-offset-2">
            login
          </Link>
          .
        </Alert>
      ) : null}
      <SetupForm
        setupAvailable={status.setupAvailable}
        setupRequired={status.setupRequired}
        smtpConfigured={status.smtpConfigured}
        message={status.message}
      />
    </div>
  );
}
