# Planning — La Métallerie du Sud

Outil interne de planning d’équipe (administratif, fabrication, logistique, pose).

## Démarrage

```bash
npm install
npm run dev
```

Sans variables Supabase **en local**, l’application utilise un stockage local pré-rempli (équipe Vauchel + chantiers d’exemple).

**En production**, si la base est injoignable, l’application n’affiche plus ces données d’exemple : un message d’erreur s’affiche et les modifications sont bloquées.

## Supabase

1. Créer un projet Postgres.
2. Exécuter `supabase/migrations/001_init.sql` puis `002_seed.sql` dans le SQL Editor.
3. Copier `.env.example` vers `.env.local` et renseigner :

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

La clé publishable (`sb_publishable_…`) remplace l’ancienne clé `anon`. `NEXT_PUBLIC_SUPABASE_ANON_KEY` reste accepté comme alias.

4. Relancer `npm run dev`.
