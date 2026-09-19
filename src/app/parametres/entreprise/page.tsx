import { EntrepriseSettingsPage } from "@/components/EntrepriseSettingsPage";
import { requireAdminPage } from "@/lib/auth/require-admin-page";

export default async function EntrepriseRoute() {
  await requireAdminPage();
  return <EntrepriseSettingsPage />;
}
