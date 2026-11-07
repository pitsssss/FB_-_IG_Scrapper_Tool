import "server-only";
import { redirect } from "next/navigation";
import { getAdminMe, getSetupStatus } from "@/lib/auth/api";
import { readSessionToken } from "@/lib/auth/cookies";

export async function getCurrentAdmin() {
  const token = await readSessionToken();
  const me = await getAdminMe(token);
  if (!me.ok || !me.body.data?.admin) return null;
  return {
    ...me.body.data.admin,
    mfaPending: Boolean(me.body.data.mfaPending),
    authLevel: me.body.data.authLevel || "full",
  };
}

export async function requireAdmin() {
  const admin = await getCurrentAdmin();
  if (!admin) {
    const setup = await getSetupStatus();
    if (setup.body.data?.setupRequired) {
      redirect("/setup");
    }
    redirect("/login");
  }
  if (admin.mfaPending) {
    redirect("/mfa");
  }
  return admin;
}

export async function redirectIfAuthenticated() {
  const admin = await getCurrentAdmin();
  if (!admin) return;
  if (admin.mfaPending) redirect("/mfa");
  redirect("/overview");
}
