-- Signalements de retard (étape 3)

do $$ begin
  create type statut_signalement as enum ('en_attente', 'valide', 'rejete');
exception when duplicate_object then null;
end $$;

create table if not exists public.signalements (
  id uuid primary key default gen_random_uuid(),
  employe_id uuid not null references public.employees(id) on delete cascade,
  phase_id uuid not null references public.phases_planning(id) on delete cascade,
  retard_demi_journees numeric not null default 1,
  note text not null default '',
  statut statut_signalement not null default 'en_attente',
  date_creation timestamptz not null default now()
);

create index if not exists idx_signalements_statut on public.signalements(statut);
create index if not exists idx_signalements_employe on public.signalements(employe_id);

alter table public.signalements enable row level security;

drop policy if exists signalements_all on public.signalements;
create policy signalements_all on public.signalements for all using (true) with check (true);
