"use client";

import { Suspense } from "react";
import { SignalerRetardPage } from "@/components/SignalerRetardPage";
import { MobileShell } from "@/components/MobileShell";

export default function RetardRoute() {
  return (
    <Suspense
      fallback={
        <MobileShell>
          <p className="text-sm text-stone-500">Chargement…</p>
        </MobileShell>
      }
    >
      <SignalerRetardPage />
    </Suspense>
  );
}
