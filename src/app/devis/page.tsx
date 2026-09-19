import { DevisPage } from "@/components/DevisPage";
import { requireAdminPage } from "@/lib/auth/require-admin-page";

export default async function DevisRoute() {
  await requireAdminPage();
  return <DevisPage />;
}
