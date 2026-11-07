import "server-only";
import { redirect } from "next/navigation";
import { getAdminMe, getSetupStatus } from "@/lib/auth/api";
import { readSessionToken } from "@/lib/auth/cookies";

export async function getCurrentAdmin() {
  const token = await readSessionToken();
  const me = await getAdminMe(token);
  if (!me.ok || !me.body.data?.admin) return null;
  return me.body.data.admin;
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
  return admin;
}

export async function redirectIfAuthenticated() {
  const admin = await getCurrentAdmin();
  if (admin) redirect("/overview");
}
