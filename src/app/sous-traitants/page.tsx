import { SousTraitantsPage } from "@/components/SousTraitantsPage";
import { requireAdminPage } from "@/lib/auth/require-admin-page";

export default async function SousTraitantsRoute() {
  await requireAdminPage();
  return <SousTraitantsPage />;
}
