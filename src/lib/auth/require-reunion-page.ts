import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/guard";
import { requireAdminPage } from "@/lib/auth/require-admin-page";
import { canManageReunionDirection } from "@/lib/auth/reunion-access";

export async function requireReunionPage() {
  await requireAdminPage();
  const session = await getSession();
  if (!canManageReunionDirection(session?.nom)) {
    redirect("/");
  }
}
