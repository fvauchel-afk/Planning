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
    id: "2026-09-18-chantier-createur",
    title: "Qui a créé le chantier",
    items: [
      "Sur chaque fiche et dans la liste Chantiers, on voit qui a créé l’affaire et à quelle date.",
      "Les chantiers déjà en base n’ont souvent pas de nom : ils s’affichent « Inconnu », avec la date de création connue.",
    ],
  },
  {
    id: "2026-09-18-maj-modale-bloquante",
    title: "Mise à jour : l’écran bloque vraiment",
    items: [
      "Quand une nouvelle version arrive, une fenêtre bloque l’application jusqu’au bouton Mettre à jour.",
      "Mettre à jour s’applique tout de suite. Si une fiche était ouverte, la saisie est remise après le rechargement.",
    ],
  },
  {
    id: "2026-09-18-maj-sans-couper-session",
    title: "Mise à jour sans bloquer la session",
    items: [
      "Quand une nouvelle version arrive, un bandeau propose Mettre à jour. Rien n’est bloqué derrière : vous pouvez continuer à travailler.",
      "Plus tard range le bandeau jusqu’à la prochaine version. Mettre à jour recharge la page quand vous le choisissez.",
    ],
  },
  {
    id: "2026-09-18-photos-bon-commande",
    title: "Photos sur le bon de commande",
    items: [
      "Avant l’envoi au sous-traitant, vous pouvez joindre des photos (appareil ou galerie).",
      "Elles partent avec l’e-mail, figurent dans le PDF, et sont copiées dans le dossier OneDrive du chantier.",
    ],
  },
  {
    id: "2026-09-18-photo-suggestion-entreprise",
    title: "Photo sur une suggestion entreprise",
    items: [
      "Dans Suggestion amélioration entreprise, vous pouvez prendre une photo avec le téléphone ou en choisir une dans la galerie.",
      "Les photos s’affichent dans l’onglet Demandes.",
    ],
  },
  {
    id: "2026-09-18-retard-dernier-jour",
    title: "Signaler un retard : dernier jour seulement",
    items: [
      "Sur Mon planning, « Signaler un retard » n’apparaît que le dernier jour planifié du chantier, pas sur chaque matin, après-midi ou jour précédent.",
      "« Signaler une avance » reste disponible sur tous les jours du chantier.",
    ],
  },
  {
    id: "2026-09-18-bon-commande-onedrive",
    title: "Bon de commande dans le dossier OneDrive",
    items: [
      "À l’envoi, le PDF du bon de commande est copié dans le dossier OneDrive du chantier (celui du lien sur la fiche), en plus de l’e-mail au sous-traitant.",
      "Le fichier va bien dans ce dossier-là, pas dans un autre dossier au même nom.",
    ],
  },
  {
    id: "2026-09-18-bon-commande-pieces",
    title: "Pièces sur le bon de commande",
    items: [
      "Avant l’aperçu et l’envoi, vous remplissez les lignes du bon : quantité et descriptif de chaque pièce.",
      "Vous pouvez ajouter ou supprimer des lignes. Elles s’affichent sur le PDF et dans l’e-mail, et restent sur la fiche chantier.",
    ],
  },
  {
    id: "2026-09-18-moi-retour-accueil",
    title: "Retour au planning depuis Mon planning",
    items: [
      "Le nom « Ferronnerie Vauchel » en haut à gauche ramène à l’accueil (planning équipe pour un admin, Mon planning pour un salarié).",
      "Depuis Mon planning, un admin a aussi un lien Planning dans la barre, pour revenir à la vue d’équipe.",
    ],
  },
  {
    id: "2026-09-18-edit-duree-phases",
    title: "Durées dans Modifier le chantier",
    items: [
      "En cliquant sur le crayon, vous voyez le temps estimé de chaque phase (heures, 1 j, 1,5 j, 2 j), comme à la création.",
      "Vous pouvez le changer dans cette fenêtre : les dates des phases suivantes se recalent. Validez avec Enregistrer.",
    ],
  },
  {
    id: "2026-09-18-phase-oui-non-fab",
    title: "Chantier avec pose seulement",
    items: [
      "À la création et dans Modifier, Fabrication a un Oui / Non, comme la pose, le thermolaquage et la livraison.",
      "Si vous répondez Non, la phase disparaît : plus de durée, de dates ni de salarié. Les dates du chantier se recopient alors sur la pose s’il y en a une.",
    ],
  },
  {
    id: "2026-09-18-administratif-auto-7j",
    title: "Administratif sur 7 jours vides",
    items: [
      "Si un salarié n’a aucun chantier sur les 7 prochains jours, un bloc Administratif est ajouté tout seul sur les jours libres (priorité Pas pressé).",
      "Rien n’est ajouté tant qu’un autre signalement (conflit, retard…) attend une validation. Un chantier client envoie toujours l’e-mail « PLAN A FAIRE MIKA MERCI ».",
    ],
  },
  {
    id: "2026-09-18-onedrive-oauth-303",
    title: "Bouton Connecter OneDrive",
    items: [
      "Le bouton « Connecter OneDrive » ouvre bien la page Microsoft avec le bon identifiant d’application.",
      "Plus d’erreur « client_id manquant » (AADSTS900144) en cliquant sur Connecter.",
    ],
  },
  {
    id: "2026-09-17-lancement-mail-absence",
    title: "Rappel lancement fabrication",
    items: [
      "Le bandeau liste les fabrications déjà commencées sans « Je valide le lancement », avec la date et le salarié.",
      "Le jour du début, un e-mail part au fabricant (s’il a une adresse dans EMPLOYEE_EMAILS). S’il est en congé ce jour-là, rien n’est envoyé.",
    ],
  },
  {
    id: "2026-09-17-multi-poseurs",
    title: "Plusieurs poseurs sur un chantier",
    items: [
      "À la création, vous pouvez cocher plusieurs poseurs : chacun a sa ligne sur le planning le jour de la pose.",
      "Si des dates sont déjà saisies, l’app indique qui est libre ce jour-là. Sans case cochée, le premier disponible est pris comme avant.",
    ],
  },
  {
    id: "2026-09-17-fab-dates-sync",
    title: "Dates chantier et fabrication liées",
    items: [
      "Dans Nouveau chantier, remplir le début ou la fin du chantier recopie les mêmes dates sur la phase Fabrication.",
      "Remplir les dates de fabrication recopie aussi les dates du chantier. Les deux zones restent affichées.",
    ],
  },
  {
    id: "2026-09-17-duree-phase-presets",
    title: "Durée d’une phase : heures, 1 j, 1,5 j, 2 j",
    items: [
      "Dans Nouveau chantier, chaque phase a toujours une durée en heures, plus des boutons 1 j, 1,5 j et 2 j.",
      "1 jour correspond à une journée atelier du salarié (7,5 h en 35 h été, sinon son horaire).",
    ],
  },
  {
    id: "2026-09-17-dnd-phase-saut",
    title: "Déplacer une phase, ou tout le chantier",
    items: [
      "Sur le planning, choisissez « Chantier entier » (comme avant) ou « Cette phase » pour ne bouger que l’étape (pose, fabrication…).",
      "Une phase seule se cale dans un creux, ou saute un autre chantier — utile si la météo impose d’inverser une pose intérieure et une pose extérieure.",
    ],
  },
  {
    id: "2026-09-17-dnd-insert-milieu",
    title: "Insérer un chantier au milieu d’un autre",
    items: [
      "Sur le planning équipe, vous pouvez glisser un chantier et le déposer au milieu d’un autre déjà planifié.",
      "Le début de l’affaire en place ne bouge pas ; la suite reprend juste après le chantier inséré.",
    ],
  },
  {
    id: "2026-09-17-email-plan-mika",
    title: "E-mail plan à la création d’un chantier",
    items: [
      "À chaque nouveau chantier, un e-mail part vers f.vauchel@hotmail.com avec l’objet exact « PLAN A FAIRE MIKA MERCI ».",
      "Le message rappelle le client, l’adresse, les dates et le lien de la fiche, pour lancer le plan technique.",
    ],
  },
  {
    id: "2026-09-17-suggestion-administratif",
    title: "Suggestion Administratif si 7 jours vides",
    items: [
      "Si un salarié (fabrication / pose) n’a aucun chantier sur les 7 prochains jours, une suggestion de bloc Administratif apparaît dans Signalements.",
      "Rien n’est ajouté au planning tant que Jonathan n’a pas cliqué sur Valider. Rejeter ignore la suggestion pour aujourd’hui.",
    ],
  },
  {
    id: "2026-09-17-select-fabrication",
    title: "Choisir le salarié de fabrication",
    items: [
      "Dans Nouveau chantier et Modifier, le menu « Salarié responsable de la fabrication » liste bien les salariés (Romain, Alexis, etc.).",
      "Plus de message orange « Veuillez sélectionner l’une de ces options » avec une liste vide.",
    ],
  },
  {
    id: "2026-09-17-onedrive-statut-domaine",
    title: "OneDrive : statut à jour, même depuis le domaine atelier",
    items: [
      "L’onglet OneDrive affiche l’état réel (plus un statut figé au moment de la mise en ligne).",
      "Le bouton « Connecter OneDrive » revient toujours vers l’adresse Microsoft déjà enregistrée, y compris si vous ouvrez le planning via gestion.lametalleriedusud.com.",
    ],
  },
  {
    id: "2026-09-17-pin-reactivate",
    title: "Code PIN à nouveau obligatoire",
    items: [
      "L’entrée sans code (check des 16 et 17 septembre) est coupée.",
      "Chacun doit de nouveau saisir son code PIN, y compris Jonathan.",
      "Le bandeau rouge « Authentification désactivée temporairement » n’apparaît plus.",
    ],
  },
  {
    id: "2026-09-17-heure-vue-jour",
    title: "Vue Jour à l’heure, conflits à la minute",
    items: [
      "Deux chantiers du même salarié ne se marchent dessus que s’ils se chevauchent vraiment en heures (ex. 7 h 30–9 h 30 puis 9 h 30–11 h 30 le même matin : OK).",
      "En vue Jour, vous déposez au cran de 30 minutes. Un trou en fin de journée n’est pas comblé tout seul : le lendemain ne bouge pas.",
      "En vue Semaine, les cases matin / après-midi restent ; l’horaire du bloc est écrit dessus.",
    ],
  },
  {
    id: "2026-09-17-tour-check-planning",
    title: "Planning : vue Jour, synthèse, demandes",
    items: [
      "En vue Jour, vous pouvez glisser un chantier comme en semaine : déposez-le sur le matin ou l’après-midi (cases hors horaire toujours refusées).",
      "La Synthèse de charge aligne ses semaines sur le calendrier de Paris, pas sur UTC.",
      "Dans Demandes, la pastille indique « 2 nouveaux » au pluriel.",
    ],
  },
  {
    id: "2026-09-17-pdf-date-signature",
    title: "Date du PDF de réception",
    items: [
      "Le PDF de réception ou de bon de livraison porte la date du jour de la signature (heure de Paris), et non plus la date de début de la pose ou de la livraison.",
    ],
  },
  {
    id: "2026-09-17-pdf-apercu-ios",
    title: "Aperçu PDF sur iPhone",
    items: [
      "L’aperçu d’une réception, d’un bon de livraison ou d’un bon de commande s’ouvre bien sur iPhone : bouton « Ouvrir le PDF » (Safari n’affiche pas un PDF dans la page).",
      "Sur ordinateur, l’aperçu dans la fenêtre reste le même. Un lien Télécharger est aussi proposé.",
    ],
  },
  {
    id: "2026-09-17-livraison-signer-planning",
    title: "Bon de livraison depuis le planning équipe",
    items: [
      "Sur un bloc Livraison du planning équipe, « Faire signer le bon de livraison » s’affiche comme « Terminer / réception » sur un bloc Pose.",
      "Le bouton ouvre le même document (aperçu PDF, puis confirmation).",
    ],
  },
  {
    id: "2026-09-17-drag-hors-horaire-pdf-accents",
    title: "Dépôt hors horaire et PDF de réception",
    items: [
      "On ne peut plus déposer un chantier sur une case à 0 h pour le salarié : vendredi après-midi (horaire 35 h), samedi ou dimanche. Le bloc revient à sa place, avec le bandeau rouge.",
      "Sur le PDF de réception, les accents s’affichent : Réception de chantier, Salarié, signature simulée.",
    ],
  },
  {
    id: "2026-09-16-onedrive-oauth-silencieux",
    title: "Connexion OneDrive uniquement sur demande",
    items: [
      "Microsoft ne s’ouvre plus tout seul en naviguant dans l’app (Signalements, Planning, etc.).",
      "Pour reconnecter OneDrive, il faut cliquer sur « Connecter OneDrive » dans l’onglet OneDrive.",
    ],
  },
  {
    id: "2026-09-16-fin-phase-vendredi",
    title: "Fin de phase : le vendredi compte vraiment ½ journée",
    items: [
      "La date de fin d’une phase se calcule avec les heures réelles de chaque jour du salarié (vendredi souvent jusqu’à 12 h), et non plus avec une moyenne de 8 h.",
      "Exemple : 32 h à partir d’un mardi, sur un horaire 35 h, ne se terminent plus le vendredi (seulement 27,5 h disponibles) : ça continue le lundi suivant.",
    ],
  },
  {
    id: "2026-09-16-onedrive-statut-partage",
    title: "Statut OneDrive et copie des documents",
    items: [
      "L’onglet OneDrive vérifie le même accès que Sauvegarde (liste du dossier Sauvegarde), plus seulement un GET /me/drive. Si Microsoft refuse, le statut n’est plus vert « connecté ».",
      "Le message affiché est le même que sur Sauvegarde ou à la copie d’une réception.",
      "Si le lien de partage d’un chantier est refusé, la copie du PDF retente dans le dossier du client sur le OneDrive du compte.",
    ],
  },
  {
    id: "2026-09-16-reception-pose-pdf",
    title: "Clôturer une pose et générer la réception",
    items: [
      "Sur un bloc Pose du planning, « Terminer / réception » ouvre un document (aperçu PDF, puis confirmation), avec une zone de signature simulée.",
      "La pose passe en terminée, et le PDF est copié dans le dossier OneDrive du chantier.",
    ],
  },
  {
    id: "2026-09-16-ferie-toute-equipe",
    title: "Jour férié pour toute l’équipe",
    items: [
      "Sur une absence « Jour férié entreprise », une case « Appliquer à toute l’équipe » crée l’absence pour tous les salariés actifs d’un coup.",
    ],
  },
  {
    id: "2026-09-16-synthese-seuil-110",
    title: "Couleurs de la Synthèse de charge",
    items: [
      "Vert jusqu’à 80 %, orange de 80 à 110 % (zone tolérée), rouge au-delà de 110 % (vraie surcharge).",
    ],
  },
  {
    id: "2026-09-16-liste-apres-enregistrer",
    title: "La liste se met à jour dès Enregistrer",
    items: [
      "Après Enregistrer une absence, la nouvelle ligne apparaît tout de suite dans le tableau, sans recharger la page.",
      "Les autres listes (employés, chantiers) ne sont plus écrasées par un rafraîchissement plus ancien.",
    ],
  },
  {
    id: "2026-09-16-decalage-date-cible-marge",
    title: "Décalage vers une date cible ± marge",
    items: [
      "Sur la fiche d’une phase, Décaler ouvre d’abord « Date cible ± marge » : vous indiquez par exemple le 15 novembre et 3 jours.",
      "L’algorithme choisit le meilleur jour dans cette fourchette (délai logistique, chantiers prioritaires, absences).",
      "La marge est enregistrée sur le chantier et ressort la prochaine fois.",
    ],
  },
  {
    id: "2026-09-15-horaires-presets-saison",
    title: "Préréglages d’horaires et bascule été / hiver",
    items: [
      "Sur Ajouter ou Modifier un employé, trois boutons (28 h, 35 h et 39 h / semaine) remplissent été et hiver ; vous pouvez ensuite corriger les cases.",
      "À côté des dates Saisons été / hiver, vous voyez la saison active (calcul automatique ou forcée), avec Forcer été, Forcer hiver, et Revenir au calcul automatique. Les dates ne changent pas.",
    ],
  },
  {
    id: "2026-09-16-creer-salarie-pin",
    title: "Création d’un salarié",
    items: [
      "Ajouter un employé enregistre à nouveau le code PIN (l’erreur serveur gen_salt est corrigée).",
      "Si Enregistrer échoue, un message d’erreur s’affiche sur le formulaire et la saisie n’est pas effacée.",
    ],
  },
  {
    id: "2026-09-16-auth-ouverte-check",
    title: "Connexion ouverte pour le check (16 et 17 septembre)",
    items: [
      "Le 16 et le 17 septembre 2026, l’écran du code PIN est sauté : on entre directement comme Jonathan (admin).",
      "Un bandeau rouge rappelle : « Authentification désactivée temporairement — check en cours ».",
      "À partir du 18 septembre 2026 (minuit, heure de Paris), le code PIN se réactive tout seul.",
    ],
  },
  {
    id: "2026-09-15-ligne-transport-livraison",
    title: "Ligne Transport / Livraison sur le planning",
    items: [
      "Le planning équipe a une ligne dédiée Transport / Livraison (vue d’ensemble, semaine et jour détaillé).",
      "Chaque livraison s’y affiche (nom du chantier et adresse), en plus du bloc déjà présent sur la ligne du salarié responsable.",
      "Un clic sur un bloc de cette ligne ouvre la même fiche qu’à partir de la ligne du salarié.",
      "En vue Semaine, le total à côté du nom compte la durée réelle de chaque livraison une seule fois par ligne (2 h restent 2 h, même si le bloc est aussi sur l’autre ligne).",
    ],
  },
  {
    id: "2026-09-15-lancement-a-valider",
    title: "Ne pas oublier de valider le lancement",
    items: [
      "Un bloc fabrication dont le début est aujourd’hui ou déjà passé, et qui n’a pas encore « Je valide le lancement », s’affiche en orange « à valider ».",
      "Le bouton « Je valide le lancement » est sur le bandeau, sur le bloc du planning, sur le détail de la phase et sur la fiche chantier — même si le chantier est déjà passé en Confirmé.",
      "Jonathan et Mika voient un badge sur Planning et un bandeau tant que le lancement n’a pas été cliqué. La fabrication ne passe plus en Confirmé toute seule le jour J.",
    ],
  },
  {
    id: "2026-09-15-semaine-heures",
    title: "Heures plus visibles en vue Semaine",
    items: [
      "Sur chaque bloc de la semaine, le nombre d’heures de la phase s’affiche clairement.",
      "À côté du nom du salarié, le total d’heures de la semaine affichée permet de voir la charge d’un coup d’œil.",
    ],
  },
  {
    id: "2026-09-15-laquage-ral-finition",
    title: "Couleur et finition du thermolaquage",
    items: [
      "Sur un chantier avec thermolaquage, vous pouvez indiquer la couleur RAL et la finition (Mat, Satin, Brillant, Texturé fin), à la création ou plus tard.",
      "Ces informations s’enregistrent toutes seules sur la fiche, et elles figurent sur le bon de commande PDF envoyé au sous-traitant.",
    ],
  },
  {
    id: "2026-09-15-chantier-plan-fournitures",
    title: "Plan et fournitures sur la fiche chantier",
    items: [
      "À la création d’un chantier, Mika reçoit un e-mail « — pour plan » (client, adresse, dates, OneDrive s’il existe, lien vers la fiche).",
      "La fiche affiche Plan à faire, puis Plan validé. Mika ou un admin peut valider le plan.",
      "Un tableau de fournitures (type, désignation, quantité, unité) se remplit sur la fiche.",
      "Valider le plan crée une demande Commande avec la liste et le lien OneDrive du chantier, et prévient Alexis comme d’habitude (badge, bandeau, e-mail).",
    ],
  },
  {
    id: "2026-09-15-notifications-conges-vapid",
    title: "Notifications congés",
    items: [
      "Le bandeau « Activer les notifications » fonctionne aussi pour les salariés (congés), plus seulement pour Alexis et Mika.",
      "Les clés de notification sont en place : le message « clés VAPID manquantes » ne s’affiche plus.",
    ],
  },
  {
    id: "2026-09-15-supprimer-demande-traitee",
    title: "Supprimer une demande déjà traitée",
    items: [
      "Dans Demandes, une demande Acceptée, Refusée ou Traité a maintenant un bouton Supprimer, en plus d’Archiver, pour la retirer aussi de Mes congés.",
    ],
  },
  {
    id: "2026-09-15-bulle-envoyer-conge",
    title: "Envoyer une demande de congé",
    items: [
      "Le bouton Envoyer de la bulle n’est plus recouvert par le bandeau de notifications : une demande de congé (dates déjà remplies) part bien et apparaît dans Mes congés.",
    ],
  },
  {
    id: "2026-09-14-demandes-conge",
    title: "Demandes de congé",
    items: [
      "Depuis la bulle en bas à droite, un salarié peut envoyer une demande de congé (dates, type d’absence, commentaire optionnel), sans passer par un admin.",
      "L’onglet Mes congés liste vos demandes : En attente, Acceptée, ou Refusée (avec le motif).",
      "Dans Demandes, l’admin accepte (l’absence est créée comme dans Absences, y compris le conflit de placement) ou refuse avec un motif. Tant que c’est en attente, le planning ne change pas.",
    ],
  },
  {
    id: "2026-09-14-absence-envoyer-validation",
    title: "Envoyer pour validation d’un congé déjà enregistré",
    items: [
      "Sur un congé déjà saisi (comme celui d’Alexis du 17 au 18/09), « Envoyer pour validation » envoie le signalement même si un précédent a été rejeté, au lieu de rester bloqué sans message.",
    ],
  },
  {
    id: "2026-09-14-update-gate-keep-edits",
    title: "Mise à jour sans perdre la saisie",
    items: [
      "Si une nouvelle version arrive pendant que vous modifiez des dates, un salarié de phase ou un Oui/Non, l’application n’est plus bloquée : un rappel indique que la mise à jour s’appliquera à la fermeture de la fiche.",
      "Si vous choisissez quand même « Mettre à jour maintenant », un message prévient, et la saisie en cours est remise après le rechargement.",
    ],
  },
  {
    id: "2026-09-14-live-form-saves",
    title: "Moins d’écrasement à deux sur la même fiche",
    items: [
      "Nom, adresse, priorité et lien OneDrive (et les équivalents sur absences, salariés et sous-traitants) s’enregistrent tout seuls dès qu’on quitte le champ : l’autre personne qui a la fiche ouverte voit le changement.",
      "Les dates, le salarié par phase et les Oui/Non Thermolaquage / Livraison / Pose restent sur « Enregistrer ». Si quelqu’un d’autre a modifié ces champs entre-temps, un message propose de recharger la fiche au lieu d’écraser en silence.",
    ],
  },
  {
    id: "2026-09-14-onedrive-refresh-login",
    title: "OneDrive reste connecté",
    items: [
      "À chaque connexion (n’importe quel code PIN), le planning rafraîchit en silence le jeton OneDrive s’il est bientôt périmé, sans ralentir l’entrée.",
      "Si Microsoft a révoqué l’accès, l’onglet OneDrive continue d’indiquer qu’il faut reconnecter ; sinon plus besoin d’y passer pour garder la liaison.",
    ],
  },
  {
    id: "2026-09-14-signalement-rejete-absence",
    title: "Renvoyer un signalement d’absence",
    items: [
      "Après un « Envoyer pour validation » sur un congé, un message s’affiche toujours (envoyé, déjà en attente, renvoyé après un rejet, ou erreur).",
      "Si un signalement identique a déjà été rejeté, un nouveau est créé au lieu de rester bloqué sur la fenêtre de conflit.",
    ],
  },
  {
    id: "2026-09-14-absence-prioritaire",
    title: "Absence et chantier prioritaire",
    items: [
      "Si un congé décale un chantier Prioritaire, l’écran « Conflit de placement » s’ouvre et rien n’est appliqué tant que vous n’avez pas envoyé pour validation.",
    ],
  },
  {
    id: "2026-09-14-onedrive-statut-signalement",
    title: "OneDrive et absences",
    items: [
      "L’onglet OneDrive vérifie un vrai accès Microsoft : si le jeton est périmé ou refusé, le statut indique « Connexion expirée, reconnexion nécessaire » au lieu de « connecté ».",
      "Dans le conflit de placement d’une absence, il n’y a plus deux boutons Annuler.",
      "« Envoyer pour validation » affiche un message (envoyé, déjà existant, ou erreur). Un second envoi du même conflit n’ajoute pas un doublon tant qu’un signalement identique est encore en attente.",
    ],
  },
  {
    id: "2026-09-14-absence-chevauche-chantier",
    title: "Absences et chantiers",
    items: [
      "Si vous enregistrez un congé (ou une autre absence) sur des dates déjà occupées par un chantier, un écran d’avertissement liste les phases concernées.",
      "Vous pouvez annuler, ou confirmer l’absence : les chantiers sont alors décalés ou réassignés, comme pour un conflit de placement.",
    ],
  },
  {
    id: "2026-09-14-onedrive-me-drive",
    title: "Dossier OneDrive",
    items: [
      "Créer le dossier OneDrive d’un chantier passe par le OneDrive du compte connecté (Hotmail compris), au lieu de l’ancienne API qui refusait le jeton.",
    ],
  },
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
