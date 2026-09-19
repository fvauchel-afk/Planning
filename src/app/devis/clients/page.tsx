import { ClientsPage } from "@/components/ClientsPage";
import { requireAdminPage } from "@/lib/auth/require-admin-page";

export default async function ClientsRoute() {
  await requireAdminPage();
  return <ClientsPage />;
}
