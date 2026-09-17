"use client";

import Link from "next/link";
import { isAdministratifIdleSuggestion } from "@/lib/signalements";
import { usePlanning } from "@/lib/planning-context";
import { useSession } from "@/lib/auth/session-context";

export function AdministratifIdleAlert() {
  const { session } = useSession();
  const { snapshot } = usePlanning();
  if (!session?.isAdmin) return null;
  const rows = (snapshot.signalements ?? []).filter(
    (item) => item.statut === "en_attente" && isAdministratifIdleSuggestion(item),
  );
  if (rows.length === 0) return null;
  const names = rows
    .slice(0, 3)
    .map((row) => snapshot.employees.find((item) => item.id === row.employe_id)?.nom)
    .filter(Boolean)
    .join(", ");
  const extra = rows.length > 3 ? ` et ${rows.length - 3} autre(s)` : "";

  return (
    <div className="mb-4 rounded-lg border border-sky-300 bg-sky-50 px-4 py-3 text-sm text-sky-950">
      <p className="font-medium">
        {rows.length === 1
          ? `${names} n’a aucun chantier sur les 7 prochains jours.`
          : `${rows.length} salariés sans chantier sur 7 jours : ${names}${extra}.`}
      </p>
      <p className="mt-1 text-xs">
        Une suggestion de bloc Administratif attend votre validation. Rien n’est
        ajouté au planning tant que vous n’avez pas accepté.
      </p>
      <Link href="/signalements" className="mt-1 inline-block font-medium underline">
        Ouvrir les signalements
      </Link>
    </div>
  );
}
