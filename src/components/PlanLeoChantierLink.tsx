"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { DATABASE_UNAVAILABLE_MESSAGE } from "@/lib/supabase/errors";
import type { PlanLeoListe } from "@/lib/plan-leo/types";

async function fetchPlans(query: string): Promise<PlanLeoListe[]> {
  const response = await fetch(`/api/plan-leo${query}`, { cache: "no-store" });
  const data = (await response.json()) as { rows?: PlanLeoListe[]; error?: string };
  if (!response.ok) {
    throw new Error(data.error || DATABASE_UNAVAILABLE_MESSAGE);
  }
  return data.rows ?? [];
}

export function PlanLeoChantierLink({
  chantierId,
  nomClient,
}: {
  chantierId: string;
  nomClient: string;
}) {
  const [plans, setPlans] = useState<PlanLeoListe[] | null>(null);

  const load = useCallback(async () => {
    try {
      const byChantier = await fetchPlans(
        `?chantierId=${encodeURIComponent(chantierId)}`,
      );
      if (byChantier.length > 0) {
        setPlans(byChantier);
        return;
      }
      if (nomClient.trim()) {
        setPlans(await fetchPlans(`?client=${encodeURIComponent(nomClient.trim())}`));
        return;
      }
      setPlans([]);
    } catch {
      setPlans([]);
    }
  }, [chantierId, nomClient]);

  useEffect(() => {
    void load();
  }, [load]);

  const href = `/plan?chantier=${encodeURIComponent(chantierId)}`;
  const saved = (plans ?? []).length > 0;

  return (
    <p className="rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-700">
      {saved ? (
        <>
          Plan LEO enregistré ({plans![0].reference || "sans référence"}, indice{" "}
          {plans![0].indice}).{" "}
        </>
      ) : (
        <>Même nom que le dossier OneDrive. </>
      )}
      <Link href={href} className="font-medium underline">
        {saved ? "Ouvrir le plan" : "Ouvrir / créer le plan LEO"}
      </Link>
    </p>
  );
}
