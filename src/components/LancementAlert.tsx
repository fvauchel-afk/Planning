"use client";

import Link from "next/link";
import { useSession } from "@/lib/auth/session-context";
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
          ? `Lancement à valider : ${names} (fabrication déjà commencée).`
          : `${rows.length} lancements à valider : ${names}${extra}.`}
      </p>
      <p className="mt-1 text-xs">
        Ouvrez le bloc fabrication et cliquez « Je valide le lancement ».
      </p>
      <Link href="/" className="mt-1 inline-block font-medium underline">
        Ouvrir le planning
      </Link>
    </div>
  );
}
