-- Fiches clients et devis (PDF + envoi mail).
-- À coller dans l’éditeur SQL Supabase si la migration MCP n’a pas été appliquée.

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  email text,
  telephone text,
  adresse text,
  code_postal text,
  ville text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_clients_nom on public.clients (nom);

create table if not exists public.devis (
  id uuid primary key default gen_random_uuid(),
  numero text not null unique,
  client_id uuid not null references public.clients(id) on delete restrict,
  objet text not null default '',
  statut text not null default 'brouillon'
    check (statut in ('brouillon', 'envoye', 'accepte', 'refuse')),
  date_devis date not null default ((now() at time zone 'Europe/Paris')::date),
  validite_jours integer not null default 30,
  tva_pct numeric not null default 20,
  notes text,
  lignes jsonb not null default '[]'::jsonb,
  chantier_id uuid references public.chantiers(id) on delete set null,
  envoye_at timestamptz,
  envoye_a text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_devis_client on public.devis (client_id);
create index if not exists idx_devis_date on public.devis (date_devis desc);

alter table public.clients enable row level security;
alter table public.devis enable row level security;

drop policy if exists clients_all on public.clients;
create policy clients_all on public.clients
  for all using (true) with check (true);

drop policy if exists devis_all on public.devis;
create policy devis_all on public.devis
  for all using (true) with check (true);
