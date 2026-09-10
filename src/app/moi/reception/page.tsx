"use client";

import { Suspense } from "react";
import { ReceptionPage } from "@/components/ReceptionPage";
import { MobileShell } from "@/components/MobileShell";

export default function ReceptionRoute() {
  return (
    <Suspense
      fallback={
        <MobileShell>
          <p className="text-sm text-stone-500">Chargement…</p>
        </MobileShell>
      }
    >
      <ReceptionPage />
    </Suspense>
  );
}
