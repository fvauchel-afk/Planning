# Stress-test TEST-CHK (scripts uniquement, pas d’écran dans l’app)

Les previews Vercel utilisent **la même base Supabase que la production**
(projet `bwqwgzrnlvyumbhdqssh`, aucune branche Supabase). Tout ce jeu de
données est donc isolé **uniquement** par le préfixe `TEST-CHK`.

## Composition (32 salariés)

- 10 Fabrication (`TEST-CHK … Fab 01` …)
- 10 Pose (`… Pose …`)
- 10 Fabrication + Pose (`… Mix …`)
- 2 Administratif (`… Admin …`)

PIN uniques **8101–8132** (un PIN partagé bloquerait la connexion).

## Synthèse > 110 % (semaine du 12 octobre 2026)

Le numérateur de la Synthèse est la somme des **plages occupées distinctes**
(`salarié + jour + heure début + heure fin`). Deux chantiers qui se
chevauchent sur le même créneau (ex. tout l’après-midi) ne comptent qu’une
fois. Le dénominateur est la capacité de **toute** l’équipe active (32 TEST-CHK
+ salariés réels). D’où les chantiers `TEST-CHK Surcharge 110 …` : 4 plages
décalées par jour, pour les 32 TEST, du 12 au 16 octobre.

Sans wipe, on peut n’appliquer que `overflow-110.sql` (généré en même temps).

## Commandes

1. Régénérer le SQL : `npm run stress-chk:generate`
2. Nettoyer (entreprise intacte) : exécuter `scripts/stress-chk/wipe.sql`
3. Charger : exécuter `scripts/stress-chk/seed.sql`

Relancer un test = wipe puis seed. Fin du test = wipe.
Ne jamais lancer `reset_chantiers.sql` : il vide **tous** les chantiers.
