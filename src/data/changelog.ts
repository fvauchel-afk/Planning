/**
 * Notes de version pour l’écran « Mettre à jour ».
 * À chaque changement visible pour l’utilisateur : ajouter une entrée EN HAUT de la liste,
 * en français simple (pas de jargon technique).
 */
export type ChangelogEntry = {
  id: string;
  title: string;
  items: string[];
};

export const CHANGELOG: ChangelogEntry[] = [
  {
    id: "2026-09-12-mise-a-jour-obligatoire",
    title: "Mise à jour de l’application",
    items: [
      "Quand une nouvelle version arrive, un écran vous demande de mettre à jour avant de continuer.",
      "Vous voyez ici, en quelques phrases, ce qui a changé.",
      "Les anciens chantiers déjà en base (importés avant) sont aussi pris en compte, sans devoir tout recréer.",
    ],
  },
  {
    id: "2026-09-12-planning-aujourdhui-absences",
    title: "Planning et absences",
    items: [
      "La vue d’ensemble montre le mois en cours, la semaine va du lundi au dimanche, le jour détaillé montre aujourd’hui.",
      "Le jour actuel est bien surligné en jaune.",
      "Vous pouvez modifier une absence déjà enregistrée (employé, type, dates).",
    ],
  },
  {
    id: "2026-09-12-chantiers-visibles",
    title: "Affichage des chantiers",
    items: [
      "Les chantiers déjà datés apparaissent bien sur le planning équipe, y compris ceux créés avant les dernières mises à jour.",
    ],
  },
  {
    id: "2026-09-12-fiche-chantier",
    title: "Fiche chantier",
    items: [
      "Vous pouvez supprimer un chantier, modifier ses dates, et ouvrir le dossier OneDrive depuis la fiche.",
    ],
  },
];
