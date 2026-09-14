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
    id: "2026-09-14-onedrive-compte-perso",
    title: "Dossier OneDrive",
    items: [
      "La création du dossier client à l’enregistrement d’un chantier fonctionne de nouveau avec un compte Microsoft personnel (Hotmail), au lieu d’afficher une erreur de jeton JWT.",
    ],
  },
  {
    id: "2026-09-14-cascade-employe",
    title: "Changement de salarié",
    items: [
      "Dans Modifier, changer le salarié d’une phase (Fabrication, Livraison ou Pose) recale aussi les phases suivantes du même chantier : Thermolaquage après la fabrication, puis Livraison, puis Pose.",
      "Les dates planifiées affichées en haut du formulaire suivent ce recalcul, au lieu de garder l’ancienne plage.",
    ],
  },
  {
    id: "2026-09-13-supabase-retry",
    title: "Connexion à la base",
    items: [
      "En cas de coupure brève, le planning et l’envoi d’un bon de commande réessayent tout seuls une ou deux fois, sans message d’erreur.",
      "Si la base reste injoignable, le blocage actuel est inchangé : aucune donnée affichée, aucune modification possible, bouton Réessayer.",
    ],
  },
  {
    id: "2026-09-13-assign-fab-pose",
    title: "Planning Fabrication et Pose",
    items: [
      "À la création, un salarié est toujours assigné à la fabrication et à la pose (même si les heures n’étaient pas renseignées), pour que les blocs apparaissent sur le planning.",
      "S’il n’y a personne avec le bon rôle, un message d’erreur s’affiche au lieu d’enregistrer un chantier invisible.",
      "Dans Modifier le chantier, vous pouvez voir et changer le salarié de la fabrication et de la pose, comme pour la livraison.",
    ],
  },
  {
    id: "2026-09-13-bon-commande-thermo",
    title: "Bon de commande",
    items: [
      "Sur un bloc Thermolaquage du planning, vous pouvez générer et envoyer le bon de commande au sous-traitant (aperçu PDF, puis envoi).",
      "Le sous-traitant se choisit à la création, dans Modifier, ou au moment de l’envoi.",
    ],
  },
  {
    id: "2026-09-13-prochain-creneau-libre",
    title: "Conflit de placement",
    items: [
      "Quand un créneau est déjà pris, « Utiliser ce créneau » propose le vrai prochain jour libre, après la fin du chantier qui bloque.",
    ],
  },
  {
    id: "2026-09-13-chantier-onedrive-nonblocking",
    title: "Création de chantier",
    items: [
      "Un nouveau chantier s’enregistre même si le dossier OneDrive échoue (connexion expirée, réseau…). Le lien reste vide ; vous pouvez le créer plus tard depuis Modifier.",
      "Si l’enregistrement échoue, un message s’affiche avec la raison, au lieu d’un échec silencieux.",
    ],
  },
  {
    id: "2026-09-13-calage-priorite-solutions",
    title: "Calage et conflits",
    items: [
      "Dès la création, toute la chaîne (fabrication, thermolaquage, livraison, pose) est datée, même si le délai de 5 jours du laquage ne devient officiel qu’à l’envoi du bon de commande. Ces dates portent le badge Estimatif, puis passent en Confirmé quand l’événement a lieu.",
      "La priorité donne une marge à l’algorithme : Pas pressé (± 1 mois, réglable à la création), Normal (± 2 semaines), Prioritaire (date tenue, les autres bougent d’abord).",
      "En cas de conflit, plusieurs solutions sont proposées dans Signalements, avec qui bouge, les dates, et un aperçu du planning. Rien n’est appliqué sans validation Mika / Alexis.",
    ],
  },
  {
    id: "2026-09-13-bon-livraison",
    title: "Bon de livraison",
    items: [
      "Sur un bloc Livraison du planning, vous pouvez ouvrir le bon de livraison : le client signe à l’écran (téléphone ou tablette), comme pour la réception de pose.",
      "Le document (chantier, adresse de livraison, date, salarié responsable, signature) est enregistré et classé dans le dossier OneDrive.",
    ],
  },
  {
    id: "2026-09-13-livraison",
    title: "Livraison",
    items: [
      "À la création (et dans Modifier), vous pouvez ajouter une livraison : adresse, téléphone de la personne qui réceptionne, salarié responsable et durée en heures.",
      "Elle se place après le thermolaquage s’il y en a un, et avant la pose. Le salarié de livraison ne peut pas être sur deux chantiers en même temps.",
    ],
  },
  {
    id: "2026-09-13-edit-pose-thermo",
    title: "Fiche chantier",
    items: [
      "Dans Modifier, vous pouvez changer Thermolaquage / galvanisation et Installation / pose (Oui ou Non), comme à la création.",
      "Passer à Oui ajoute la phase au bon endroit (thermolaquage après la fabrication, pose après le thermolaquage s’il y en a un). Passer à Non demande confirmation avant de supprimer la phase.",
    ],
  },
  {
    id: "2026-09-13-signalements-validation",
    title: "Signalements",
    items: [
      "Mika et Alexis reçoivent une notification dès qu’un nouveau signalement arrive (comme pour les commandes).",
      "Si l’algorithme veut décaler d’autres chantiers, il n’applique plus rien tout seul : la proposition s’affiche dans Signalements (qui bouge, quelles dates) et attend une validation. Le reste du planning reste utilisable.",
      "Tant qu’un signalement n’est pas traité, on ne peut pas créer un nouveau chantier — pour ne pas ajouter du travail sur un planning qui va encore bouger.",
    ],
  },
  {
    id: "2026-09-13-estimatif-confirme",
    title: "Dates estimatives",
    items: [
      "Un chantier créé en « Estimatif » passe en « Confirmé » dès que le travail démarre vraiment (aujourd’hui dans la plage), dès qu’un bon de commande est envoyé pour le thermolaquage / la galvanisation, ou dès que vous changez le début ou la fin dans la fiche du chantier.",
      "Sur un bloc du planning, le salarié assigné (et les admins) peuvent aussi cliquer « Je valide le lancement ». Le badge Estimatif disparaît tout de suite sur le planning équipe, l’onglet Chantiers et la fiche.",
    ],
  },
  {
    id: "2026-09-13-bon-de-commande",
    title: "Bon de commande",
    items: [
      "Quand un chantier est en fabrication, vous pouvez générer un bon de commande PDF, le vérifier, puis l’envoyer au sous-traitant depuis commandes@lametalleriedusud.com (copie à f.vauchel).",
      "Les sous-traitants se gèrent dans un nouvel onglet : nom, spécialité, e-mail. Le délai de 5 jours ouvrés pour le thermolaquage / galvanisation part de l’envoi du bon, pas de la création du chantier. Une copie du PDF va dans le dossier OneDrive.",
    ],
  },
  {
    id: "2026-09-13-commandes-priorite-push",
    title: "Commandes",
    items: [
      "Dans Demandes, Alexis et Mika arrivent directement sur les commandes, avec un badge Nouveau. Jonathan et les autres admins gardent la liste complète de toutes les demandes.",
      "Alexis et Mika peuvent activer une notification même si l’application est fermée (sur iPhone : ajouter Planning à l’écran d’accueil, puis autoriser les notifications).",
    ],
  },
  {
    id: "2026-09-13-commandes-alexis-mika",
    title: "Commandes et e-mail",
    items: [
      "Les commandes sont signalées à Alexis et Mika : pastille, bandeau, et e-mail depuis la boîte f.vauchel, avec des messages types (reçu, en cours, effectuée).",
    ],
  },
  {
    id: "2026-09-13-phases-sequentielles-demandes",
    title: "Planning et demandes",
    items: [
      "Un nouveau chantier enchaîne bien Administratif, puis Fabrication, puis Thermolaquage, puis Pose : chaque étape commence seulement après la fin de la précédente.",
      "Un même chantier n’apparaît plus en double sur une case du planning.",
      "Dans les demandes, vous pouvez aussi envoyer une suggestion d’amélioration pour l’entreprise (organisation, matériel, atelier…), en plus des commandes et des idées pour le site.",
    ],
  },
  {
    id: "2026-09-13-redeploiement",
    title: "Mise à jour",
    items: [
      "Cette version rassemble les dernières améliorations : on ne peut plus déposer un chantier sur une case occupée, les dates peuvent être estimatives, les demandes se traitent et s’archivent, et un nouveau chantier enchaîne fabrication, thermolaquage puis pose.",
    ],
  },
  {
    id: "2026-09-12-pose-thermolaquage",
    title: "Nouveau chantier",
    items: [
      "À la création, vous indiquez si le chantier a une pose et s’il passe au thermolaquage (Oui ou Non obligatoire).",
      "L’enchaînement est fabrication, puis thermolaquage (5 jours ouvrés par défaut, ou le délai que vous saisissez), puis pose.",
    ],
  },
  {
    id: "2026-09-12-dates-estimatives",
    title: "Nouveau chantier",
    items: [
      "À la création, vous pouvez indiquer une date de début (et une fin) estimative : un badge « Estimatif » la distingue des dates confirmées.",
      "Si vous ne mettez aucune date, le chantier se cale tout seul au prochain jour ouvré disponible. Le salarié n’est assigné que si vous le choisissez.",
    ],
  },
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
