import { redirect } from "next/navigation";
import { getCurrentAdmin } from "@/lib/auth/session";
import { getSetupStatus } from "@/lib/auth/api";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const admin = await getCurrentAdmin();
  if (admin) redirect("/overview");
  try {
    const setup = await getSetupStatus();
    if (setup.body.data?.setupRequired) redirect("/setup");
  } catch {
    /* fall through to login */
  }
  redirect("/login");
}
