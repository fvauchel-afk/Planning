import { ClientFiche } from "@/components/ClientFiche";
import { requireAdminPage } from "@/lib/auth/require-admin-page";

export default async function ClientFicheRoute({
  params,
}: {
  params: { id: string };
}) {
  await requireAdminPage();
  return <ClientFiche clientId={params.id} />;
}
