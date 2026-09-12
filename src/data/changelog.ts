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
    id: "2026-09-12-demandes-traitement",
    title: "Demandes",
    items: [
      "Vous pouvez marquer une demande comme traitée, ou l’archiver pour la sortir de la liste sans la supprimer.",
      "Un bouton « Voir les archives » affiche les demandes mises de côté.",
    ],
  },
  {
    id: "2026-09-12-depot-cases-occupees",
    title: "Planning équipe",
    items: [
      "Vous ne pouvez plus déposer un chantier sur une case déjà prise (autre chantier ou absence). Les cases impossibles apparaissent en rouge.",
      "Le chantier revient alors à sa place. Les chantiers collés se décalent toujours ensemble.",
    ],
  },
  {
    id: "2026-09-12-demandes-equipe",
    title: "Demandes",
    items: [
      "Une bulle en bas à droite permet d’envoyer une commande (matériel, outillage…) ou une suggestion pour améliorer le site.",
      "L’onglet Demandes rassemble tous les messages de l’équipe, avec un filtre par catégorie.",
    ],
  },
  {
    id: "2026-09-12-glisser-chantier-autre-salarie",
    title: "Planning équipe",
    items: [
      "Vous pouvez glisser un chantier d’une ligne salarié vers une autre pour le réaffecter.",
      "Si la date change aussi, les blocs collés sur la nouvelle ligne sont décalés comme aujourd’hui sur une même ligne.",
    ],
  },
  {
    id: "2026-09-12-base-indisponible",
    title: "Connexion à la base",
    items: [
      "Si la base de données est injoignable, un message clair s’affiche. Le planning d’exemple n’apparaît plus à la place des vraies données.",
      "Tant que la connexion n’est pas rétablie, aucune modification n’est possible.",
    ],
  },
  {
    id: "2026-09-12-ordre-lignes-planning",
    title: "Planning équipe",
    items: [
      "Dans le planning, vous pouvez réordonner les lignes des salariés en les faisant glisser par le nom (clic gauche maintenu).",
      "Le nouvel ordre est enregistré tout de suite et visible par tout le monde.",
    ],
  },
  {
    id: "2026-09-12-maj-rapide-sauvegarde-deploy",
    title: "Mises à jour",
    items: [
      "L’écran de nouvelle version s’affiche en quelques secondes, y compris quand vous revenez sur l’onglet.",
      "À chaque mise en ligne, une copie des données est enregistrée et indiquée comme l’état juste avant cette mise à jour.",
    ],
  },
  {
    id: "2026-09-12-periode-bouton-planning",
    title: "Planning",
    items: [
      "Entre les flèches du planning, le bouton affiche le mois, la semaine ou le jour que vous voyez. Un clic ramène à aujourd’hui.",
    ],
  },
  {
    id: "2026-09-12-sauvegarde-onedrive",
    title: "Sauvegarde",
    items: [
      "Une copie de sécurité est enregistrée chaque jour dans le dossier OneDrive « Sauvegarde ».",
      "L’onglet Sauvegarde montre la liste de ces copies et ce qui a changé dans l’application.",
      "Jonathan et Mika peuvent restaurer une copie, après une double confirmation, pour revenir à cet état.",
    ],
  },
  {
    id: "2026-09-12-fin-chantier-ecran-maj",
    title: "Mise à jour",
    items: [
      "Vous pouvez modifier la date de fin d’un chantier : les jours de travail sont ajoutés ou enlevés automatiquement (samedi et dimanche exclus).",
      "Vous pouvez modifier une absence déjà enregistrée.",
      "Le planning s’ouvre sur le mois, la semaine ou le jour d’aujourd’hui, avec ce jour surligné en jaune.",
      "Quand une nouvelle version arrive, un écran bloque l’application jusqu’au bouton Mettre à jour, et explique ce qui a changé.",
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
