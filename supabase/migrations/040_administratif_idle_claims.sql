-- Une seule suggestion Administratif automatique par salarié et par fenêtre
-- (évite les doublons si plusieurs admins chargent le planning en même temps).

create table if not exists public.administratif_idle_claims (
  employee_id uuid not null references public.employees(id) on delete cascade,
  window_from date not null,
  chantier_id uuid references public.chantiers(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (employee_id, window_from)
);

alter table public.administratif_idle_claims enable row level security;
revoke all on table public.administratif_idle_claims from anon, authenticated, public;
