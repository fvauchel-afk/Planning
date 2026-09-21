export const STATUTS_COMMANDE = ["a_faire", "en_cours", "faite"] as const;
export type StatutCommande = (typeof STATUTS_COMMANDE)[number];

export const STATUT_COMMANDE_LABELS: Record<StatutCommande, string> = {
  a_faire: "À faire",
  en_cours: "En cours",
  faite: "Effectuée",
};

export function parseStatutCommande(value: unknown): StatutCommande {
  if (
    typeof value === "string" &&
    (STATUTS_COMMANDE as readonly string[]).includes(value)
  ) {
    return value as StatutCommande;
  }
  return "a_faire";
}

export function commandeEstOuverte(row: { statut?: string }): boolean {
  return parseStatutCommande(row.statut) !== "faite";
}

/** Chantiers Plan validé qui n’ont pas encore de ligne Commande. */
export function chantiersSansCommande(
  chantiers: Array<{ id: string; plan_valide?: boolean }>,
  commandes: Array<{ chantier_id: string }>,
): string[] {
  const have = new Set(commandes.map((row) => row.chantier_id));
  return chantiers
    .filter((row) => row.plan_valide && row.id && !have.has(row.id))
    .map((row) => row.id);
}

function runCommandeStatutSelfCheck() {
  if (parseStatutCommande("en_cours") !== "en_cours") {
    throw new Error("commandes: statut en cours");
  }
  if (commandeEstOuverte({ statut: "faite" })) {
    throw new Error("commandes: effectuée n’est plus ouverte");
  }
  if (!commandeEstOuverte({ statut: "a_faire" })) {
    throw new Error("commandes: à faire reste ouverte");
  }
  const missing = chantiersSansCommande(
    [
      { id: "a", plan_valide: true },
      { id: "b", plan_valide: true },
      { id: "c", plan_valide: false },
    ],
    [{ chantier_id: "a" }],
  );
  if (missing.join() !== "b") {
    throw new Error("commandes: backfill seulement les plans validés sans ligne");
  }
}
runCommandeStatutSelfCheck();
