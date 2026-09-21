"use client";

import Link from "next/link";
import { useSession } from "@/lib/auth/session-context";
import { LaunchValidateButton } from "@/components/LaunchValidateButton";
import { lancementsEnAttente } from "@/lib/dates-estimatives";
import { usePlanning } from "@/lib/planning-context";

export function LancementAlert() {
  const { session } = useSession();
  const { snapshot } = usePlanning();
  if (!session?.canReceiveLancementAlerts) return null;
  const rows = lancementsEnAttente(snapshot);
  if (rows.length === 0) return null;
  const names = rows
    .slice(0, 3)
    .map((row) => row.nomClient)
    .join(", ");
  const extra = rows.length > 3 ? ` et ${rows.length - 3} autre(s)` : "";

  return (
    <div className="mb-4 rounded-lg border border-orange-300 bg-orange-50 px-4 py-3 text-sm text-orange-950">
      <p className="font-medium">
        {rows.length === 1
          ? `Chantier lancé à valider : ${names} (déjà commencé).`
          : `${rows.length} chantiers lancés à valider : ${names}${extra}.`}
      </p>
      <p className="mt-1 text-xs">
        Cliquez « Chantier lancé » ci-dessous, ou ouvrez le bloc / la fiche.
      </p>
      <ul className="mt-2 space-y-2">
        {rows.map((row) => (
          <li key={row.phaseId} className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{row.nomClient}</span>
            <span className="text-xs text-orange-800">
              début {row.dateDebut.split("-").reverse().join("/")}
              {row.employeNom ? ` · ${row.employeNom}` : ""}
            </span>
            <LaunchValidateButton phaseId={row.phaseId} />
          </li>
        ))}
      </ul>
      <Link href="/" className="mt-1 inline-block font-medium underline">
        Ouvrir le planning
      </Link>
    </div>
  );
}
