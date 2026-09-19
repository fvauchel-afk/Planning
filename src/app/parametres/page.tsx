import { ParametresPage } from "@/components/ParametresPage";
import { requireAdminPage } from "@/lib/auth/require-admin-page";

export default async function ParametresRoute() {
  await requireAdminPage();
  return <ParametresPage />;
}
