import { ChantiersPage } from "@/components/ChantiersPage";
import { requireAdminPage } from "@/lib/auth/require-admin-page";

export default async function ChantiersRoute() {
  await requireAdminPage();
  return <ChantiersPage />;
}
