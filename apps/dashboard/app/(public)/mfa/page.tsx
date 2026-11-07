import { PageHeader } from "@/components/layout/page-header";
import { MfaForm } from "@/features/auth/mfa-form";
import { getAdminMe } from "@/lib/auth/api";
import { readSessionToken } from "@/lib/auth/cookies";
import { redirect } from "next/navigation";

export const metadata = { title: "Verify MFA" };
export const dynamic = "force-dynamic";

export default async function MfaPage() {
  const token = await readSessionToken();
  if (!token) redirect("/login");
  const me = await getAdminMe(token);
  if (!me.ok) redirect("/login");
  if (!me.body.data?.mfaPending) redirect("/overview");

  return (
    <div>
      <PageHeader
        title="Confirm sign-in"
        description="Complete multi-factor authentication to access the dashboard."
      />
      <MfaForm />
    </div>
  );
}
