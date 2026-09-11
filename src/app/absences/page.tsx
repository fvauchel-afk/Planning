import { AbsencesPage } from "@/components/AbsencesPage";
import { requireAdminPage } from "@/lib/auth/require-admin-page";

export default async function AbsencesRoute() {
  await requireAdminPage();
  return <AbsencesPage />;
}
