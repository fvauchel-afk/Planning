-- Onglet Commande : commandes atelier créées au clic « Plan validé ».
create table if not exists public.commandes (
  id uuid primary key default gen_random_uuid(),
  chantier_id uuid not null references public.chantiers(id) on delete cascade,
  created_by uuid references public.employees(id) on delete set null,
  date_creation timestamptz not null default now(),
  statut text not null default 'a_faire',
  fournisseur text,
  fournitures jsonb not null default '[]'::jsonb,
  onedrive_lien text,
  nom_client text not null default ''
);

create index if not exists idx_commandes_date on public.commandes (date_creation desc);
create index if not exists idx_commandes_chantier on public.commandes (chantier_id);
create index if not exists idx_commandes_statut on public.commandes (statut);

alter table public.commandes enable row level security;

drop policy if exists commandes_all on public.commandes;
create policy commandes_all on public.commandes for all using (true) with check (true);
