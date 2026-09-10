-- Réceptions de chantier avec signature (étape 4)

create table if not exists public.receptions_chantier (
  id uuid primary key default gen_random_uuid(),
  phase_id uuid not null unique references public.phases_planning(id) on delete cascade,
  nom_signataire text not null,
  image_signature text not null,
  date_signature timestamptz not null default now()
);

create index if not exists idx_receptions_phase on public.receptions_chantier(phase_id);

alter table public.receptions_chantier enable row level security;

drop policy if exists receptions_all on public.receptions_chantier;
create policy receptions_all on public.receptions_chantier for all using (true) with check (true);
