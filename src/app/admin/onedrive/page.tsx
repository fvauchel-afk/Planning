import { OnedriveAdminPage } from "@/components/OnedriveAdminPage";
import { requireAdminPage } from "@/lib/auth/require-admin-page";

export default async function AdminOnedriveRoute() {
  await requireAdminPage();
  return <OnedriveAdminPage />;
}
