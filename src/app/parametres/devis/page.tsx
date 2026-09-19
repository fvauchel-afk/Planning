import { DevisSettingsPage } from "@/components/DevisSettingsPage";
import { requireAdminPage } from "@/lib/auth/require-admin-page";

export default async function DevisParametresRoute() {
  await requireAdminPage();
  return <DevisSettingsPage />;
}
