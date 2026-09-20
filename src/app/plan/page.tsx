import { Suspense } from "react";
import { PlanHub } from "@/components/PlanHub";
import { requireAdminPage } from "@/lib/auth/require-admin-page";

export default async function PlanRoute() {
  await requireAdminPage();
  return (
    <Suspense fallback={<p className="text-sm text-stone-500">Chargement…</p>}>
      <PlanHub />
    </Suspense>
  );
}
