import { CommandesPage } from "@/components/CommandesPage";
import { requireAdminPage } from "@/lib/auth/require-admin-page";

export default async function CommandesRoute() {
  await requireAdminPage();
  return <CommandesPage />;
}
