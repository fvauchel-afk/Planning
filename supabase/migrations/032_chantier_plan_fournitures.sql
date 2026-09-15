-- Statut plan et liste de fournitures sur la fiche chantier.

alter table public.chantiers
  add column if not exists plan_valide boolean not null default false;

alter table public.chantiers
  add column if not exists fournitures jsonb not null default '[]'::jsonb;

alter table public.chantiers
  add column if not exists plan_demande_id uuid references public.demandes(id) on delete set null;
