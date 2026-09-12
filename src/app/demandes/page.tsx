import { DemandesPage } from "@/components/DemandesPage";
import { requireAdminPage } from "@/lib/auth/require-admin-page";

export default async function DemandesRoute() {
  await requireAdminPage();
  return <DemandesPage />;
}
