-- Photos jointes aux demandes (suggestion entreprise, etc.).

alter table public.demandes
  add column if not exists photos jsonb not null default '[]'::jsonb;
