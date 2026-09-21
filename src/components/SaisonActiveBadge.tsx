"use client";

import { activeSaisonStatus } from "@/lib/engine/hours";
import { usePlanning } from "@/lib/planning-context";

export function saisonActiveCopy(snapshot: Parameters<typeof activeSaisonStatus>[0]) {
  const status = activeSaisonStatus(snapshot);
  const nom = status.kind === "ete" ? "Été" : "Hiver";
  const source =
    status.source === "auto" ? "calcul automatique" : "forcée manuellement";
  return { ...status, nom, source };
}

export function SaisonActiveBadge({
  detail = false,
}: {
  detail?: boolean;
}) {
  const { snapshot } = usePlanning();
  const { nom, source, kind } = saisonActiveCopy(snapshot);
  const tone =
    kind === "ete"
      ? "border-amber-300 bg-amber-50 text-amber-950"
      : "border-sky-300 bg-sky-50 text-sky-950";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${tone}`}
    >
      {detail ? `Saison active : ${nom} (${source})` : `Saison : ${nom}`}
    </span>
  );
}
