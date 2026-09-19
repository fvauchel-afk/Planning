-- Plans LEO : JSON + SVG OneDrive, liaison par nom avec un chantier.

create table if not exists public.plans_leo (
  id uuid primary key default gen_random_uuid(),
  client_nom text not null,
  reference text not null default '',
  indice text not null default 'A',
  params jsonb not null default '{}'::jsonb,
  chantier_id uuid references public.chantiers(id) on delete set null,
  onedrive_svg text,
  onedrive_json text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_plans_leo_client on public.plans_leo (client_nom);
create index if not exists idx_plans_leo_chantier on public.plans_leo (chantier_id);
create index if not exists idx_plans_leo_updated on public.plans_leo (updated_at desc);

alter table public.plans_leo enable row level security;

drop policy if exists plans_leo_all on public.plans_leo;
create policy plans_leo_all on public.plans_leo
  for all using (true) with check (true);
