# Planning Ferronnerie Vauchel

Outil interne de planning d’équipe (administratif, fabrication, logistique, pose).

## Démarrage

```bash
npm install
npm run dev
```

Ouvrir [http://localhost:3000](http://localhost:3000). Sans variables Supabase, l’application utilise un stockage local pré-rempli (équipe Vauchel + chantiers d’exemple).

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
