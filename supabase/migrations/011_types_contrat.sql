-- Amplitude horaire (ouverture/fermeture) + types de contrat

alter table public.horaires_saisonniers
  add column if not exists ouverture text not null default '08:00',
  add column if not exists fermeture text not null default '17:00';

update public.horaires_saisonniers
  set ouverture = '07:30', fermeture = '16:00'
  where nom ilike '%été%' or nom ilike '%ete%';

update public.horaires_saisonniers
  set ouverture = '08:00', fermeture = '17:00'
  where nom ilike '%hiver%';

create table if not exists public.types_contrat (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  ordre integer not null default 0,
  rythme jsonb not null default '{}'::jsonb
);

alter table public.types_contrat enable row level security;

drop policy if exists types_contrat_all on public.types_contrat;
create policy types_contrat_all on public.types_contrat for all using (true) with check (true);

insert into public.types_contrat (id, nom, ordre, rythme)
values
  (
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01',
    'Temps plein',
    0,
    '{"1":"journee","2":"journee","3":"journee","4":"journee","5":"journee","6":"off"}'::jsonb
  ),
  (
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee02',
    'Temps partiel (pas le mercredi)',
    1,
    '{"1":"journee","2":"journee","3":"off","4":"journee","5":"journee","6":"off"}'::jsonb
  ),
  (
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee03',
    'Matin uniquement',
    2,
    '{"1":"matin","2":"matin","3":"matin","4":"matin","5":"matin","6":"off"}'::jsonb
  )
on conflict (id) do nothing;

alter table public.employees
  add column if not exists type_contrat_id uuid references public.types_contrat(id) on delete set null;

update public.employees
  set type_contrat_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01'
  where type_contrat_id is null;
