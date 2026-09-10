-- Ferronnerie Vauchel — schéma de planning (étape 1)

create extension if not exists pgcrypto;

do $$ begin
  create type role_employe as enum ('administratif', 'fabrication', 'pose', 'logistique');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type priorite_chantier as enum ('prioritaire', 'normal', 'pas_presse');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type type_phase as enum ('administratif', 'fabrication', 'logistique', 'pose');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type statut_phase as enum ('a_faire', 'en_cours', 'termine');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type type_absence as enum ('conge', 'maladie', 'ferie_entreprise');
exception when duplicate_object then null;
end $$;

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  roles role_employe[] not null default '{}',
  actif boolean not null default true
);

create table if not exists public.chantiers (
  id uuid primary key default gen_random_uuid(),
  nom_client text not null,
  adresse text not null default '',
  lien_dossier_onedrive text,
  priorite priorite_chantier not null default 'normal',
  date_creation date not null default current_date
);

create table if not exists public.elements_chantier (
  id uuid primary key default gen_random_uuid(),
  chantier_id uuid not null references public.chantiers(id) on delete cascade,
  nom_element text not null
);

create table if not exists public.phases_planning (
  id uuid primary key default gen_random_uuid(),
  element_id uuid not null references public.elements_chantier(id) on delete cascade,
  type_phase type_phase not null,
  duree_estimee_heures numeric not null default 0,
  date_debut date,
  date_fin date,
  employe_id uuid references public.employees(id) on delete set null,
  statut statut_phase not null default 'a_faire',
  urgent boolean not null default false
);

create table if not exists public.absences (
  id uuid primary key default gen_random_uuid(),
  employe_id uuid not null references public.employees(id) on delete cascade,
  date_debut date not null,
  date_fin date not null,
  type type_absence not null
);

create index if not exists idx_elements_chantier_chantier on public.elements_chantier(chantier_id);
create index if not exists idx_phases_element on public.phases_planning(element_id);
create index if not exists idx_phases_employe on public.phases_planning(employe_id);
create index if not exists idx_absences_employe on public.absences(employe_id);

alter table public.employees enable row level security;
alter table public.chantiers enable row level security;
alter table public.elements_chantier enable row level security;
alter table public.phases_planning enable row level security;
alter table public.absences enable row level security;

drop policy if exists employees_all on public.employees;
create policy employees_all on public.employees for all using (true) with check (true);

drop policy if exists chantiers_all on public.chantiers;
create policy chantiers_all on public.chantiers for all using (true) with check (true);

drop policy if exists elements_all on public.elements_chantier;
create policy elements_all on public.elements_chantier for all using (true) with check (true);

drop policy if exists phases_all on public.phases_planning;
create policy phases_all on public.phases_planning for all using (true) with check (true);

drop policy if exists absences_all on public.absences;
create policy absences_all on public.absences for all using (true) with check (true);
