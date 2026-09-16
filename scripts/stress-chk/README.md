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

## Commandes

1. Régénérer le SQL : `npm run stress-chk:generate`
2. Nettoyer (entreprise intacte) : exécuter `scripts/stress-chk/wipe.sql`
3. Charger : exécuter `scripts/stress-chk/seed.sql`

Relancer un test = wipe puis seed. Fin du test = wipe.
Ne jamais lancer `reset_chantiers.sql` : il vide **tous** les chantiers.
