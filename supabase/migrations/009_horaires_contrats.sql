alter table public.employees
  add column if not exists heures_contrat_semaine numeric,
  add column if not exists jours_travailles smallint[] not null default '{1,2,3,4,5}';

create table if not exists public.horaires_saisonniers (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  debut_mmdd text not null,
  fin_mmdd text not null,
  heures_matin numeric not null default 4,
  heures_apres_midi numeric not null default 4,
  ordre integer not null default 0
);

alter table public.horaires_saisonniers enable row level security;

drop policy if exists horaires_all on public.horaires_saisonniers;
create policy horaires_all on public.horaires_saisonniers for all using (true) with check (true);

insert into public.horaires_saisonniers (id, nom, debut_mmdd, fin_mmdd, heures_matin, heures_apres_midi, ordre)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001', 'Été', '06-01', '09-30', 4, 3, 0),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0002', 'Hiver', '10-01', '05-31', 4, 4, 1)
on conflict (id) do nothing;
