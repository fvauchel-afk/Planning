import { Suspense } from "react";
import { ChantiersPage } from "@/components/ChantiersPage";
import { requireAdminPage } from "@/lib/auth/require-admin-page";

export default async function ChantiersRoute() {
  await requireAdminPage();
  return (
    <Suspense fallback={<p className="text-sm text-stone-500">Chargement…</p>}>
      <ChantiersPage />
    </Suspense>
  );
}
