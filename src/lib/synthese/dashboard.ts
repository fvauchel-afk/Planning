import { commandeEstOuverte } from "@/lib/commandes";
import { lancementsEnAttente } from "@/lib/dates-estimatives";
import type { StatutDevis } from "@/lib/devis/types";
import { createEmptySnapshot } from "@/lib/seed";
import { pendingSignalements } from "@/lib/signalements";
import type { Demande, PlanningSnapshot } from "@/lib/types";

export type TauxAcceptationDevis = {
  envoyes: number;
  acceptes: number;
  refuses: number;
  enAttente: number;
  taux: number | null;
};

export type LigneAFaire = {
  id: string;
  label: string;
  count: number;
  href: string;
};

export function tauxAcceptationDevis(
  rows: Array<{ statut: StatutDevis }>,
): TauxAcceptationDevis {
  let enAttente = 0;
  let acceptes = 0;
  let refuses = 0;
  for (const row of rows) {
    if (row.statut === "envoye") enAttente += 1;
    else if (row.statut === "accepte") acceptes += 1;
    else if (row.statut === "refuse") refuses += 1;
  }
  const envoyes = enAttente + acceptes + refuses;
  return {
    envoyes,
    acceptes,
    refuses,
    enAttente,
    taux: envoyes === 0 ? null : acceptes / envoyes,
  };
}

export function chosesAEffectuer(
  snapshot: PlanningSnapshot,
  devis: Array<{ statut: StatutDevis }>,
): { total: number; lignes: LigneAFaire[] } {
  const demandes = snapshot.demandes ?? [];
  const ouverte = (row: Demande) => row.statut === "en_attente" && !row.archivee;
  const lignes: LigneAFaire[] = [
    {
      id: "devis",
      label: "Devis en attente de réponse",
      count: devis.filter((row) => row.statut === "envoye").length,
      href: "/devis",
    },
    {
      id: "conges",
      label: "Congés à valider",
      count: demandes.filter((row) => row.categorie === "conge" && ouverte(row)).length,
      href: "/demandes",
    },
    {
      id: "signalements",
      label: "Signalements à traiter",
      count: pendingSignalements(snapshot).length,
      href: "/signalements",
    },
    {
      id: "commandes",
      label: "Commandes à traiter",
      count:
        (snapshot.commandes ?? []).filter(commandeEstOuverte).length +
        demandes.filter(
          (row) =>
            row.categorie === "commande" &&
            row.statut !== "traite" &&
            !row.archivee,
        ).length,
      href: "/commandes",
    },
    {
      id: "lancements",
      label: "Chantiers lancés à valider",
      count: lancementsEnAttente(snapshot).length,
      href: "/",
    },
    {
      id: "suggestions",
      label: "Suggestions en attente",
      count: demandes.filter(
        (row) =>
          (row.categorie === "suggestion_site" || row.categorie === "suggestion_entreprise") &&
          ouverte(row),
      ).length,
      href: "/demandes",
    },
  ];
  return { total: lignes.reduce((sum, ligne) => sum + ligne.count, 0), lignes };
}

function runDashboardSelfCheck() {
  const snapshot: PlanningSnapshot = {
    ...createEmptySnapshot(),
    commandes: [
      {
        id: "c1",
        chantier_id: "ch1",
        created_by: null,
        date_creation: "2026-09-21T00:00:00.000Z",
        statut: "a_faire",
        fournisseur: null,
        fournitures: [],
        onedrive_lien: null,
        nom_client: "Test",
      },
    ],
  };
  const result = chosesAEffectuer(snapshot, []);
  const commandes = result.lignes.find((ligne) => ligne.id === "commandes");
  if (!commandes || commandes.href !== "/commandes" || commandes.count !== 1) {
    throw new Error("synthese: les commandes se comptent dans l’onglet Commande");
  }
}
runDashboardSelfCheck();
