-- Répertoire sous-traitants + suivi du bon de commande.
-- À coller dans l’éditeur SQL Supabase (SQL Editor → New query → Run).

create table if not exists public.sous_traitants (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  specialite text not null,
  email text not null,
  telephone text,
  adresse text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_sous_traitants_specialite
  on public.sous_traitants (specialite);

alter table public.sous_traitants enable row level security;

drop policy if exists sous_traitants_all on public.sous_traitants;
create policy sous_traitants_all on public.sous_traitants
  for all using (true) with check (true);

alter table public.chantiers
  add column if not exists date_bon_commande date;

alter table public.chantiers
  add column if not exists sous_traitant_id uuid
    references public.sous_traitants(id) on delete set null;

alter table public.chantiers
  add column if not exists delai_sous_traitance_jours integer not null default 5;
