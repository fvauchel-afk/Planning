import { Suspense } from "react";
import { DevisEditor } from "@/components/DevisEditor";
import { requireAdminPage } from "@/lib/auth/require-admin-page";

export default async function NouveauDevisRoute() {
  await requireAdminPage();
  return (
    <Suspense fallback={<p className="text-sm text-stone-500">Chargement…</p>}>
      <DevisEditor />
    </Suspense>
  );
}
