import { SauvegardePage } from "@/components/SauvegardePage";
import { requireAdminPage } from "@/lib/auth/require-admin-page";

export default async function SauvegardeRoute() {
  await requireAdminPage();
  return <SauvegardePage />;
}
