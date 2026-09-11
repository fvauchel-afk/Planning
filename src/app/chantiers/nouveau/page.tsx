import { ChantierForm } from "@/components/ChantierForm";
import { requireAdminPage } from "@/lib/auth/require-admin-page";

export default async function NouveauChantierPage() {
  await requireAdminPage();
  return <ChantierForm />;
}
