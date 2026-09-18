-- Lignes (quantité + descriptif) du bon de commande, sur la fiche chantier.

alter table public.chantiers
  add column if not exists lignes_bon_commande jsonb not null default '[]'::jsonb;
