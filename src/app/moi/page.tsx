"use client";

import { Suspense } from "react";
import { MonPlanningPage } from "@/components/MonPlanningPage";
import { MobileShell } from "@/components/MobileShell";

export default function MoiRoute() {
  return (
    <Suspense
      fallback={
        <MobileShell>
          <p className="text-sm text-stone-500">Chargement…</p>
        </MobileShell>
      }
    >
      <MonPlanningPage />
    </Suspense>
  );
}
