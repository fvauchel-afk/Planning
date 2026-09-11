import { SignalementsPage } from "@/components/SignalementsPage";
import { requireAdminPage } from "@/lib/auth/require-admin-page";

export default async function SignalementsRoute() {
  await requireAdminPage();
  return <SignalementsPage />;
}
