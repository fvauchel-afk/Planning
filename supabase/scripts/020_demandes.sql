-- Demandes équipe (commandes / suggestions d’amélioration)

do $$ begin
  create type categorie_demande as enum ('commande', 'suggestion_site');
exception when duplicate_object then null;
end $$;

create table if not exists public.demandes (
  id uuid primary key default gen_random_uuid(),
  employe_id uuid not null references public.employees(id) on delete cascade,
  categorie categorie_demande not null,
  message text not null,
  date_creation timestamptz not null default now()
);

create index if not exists idx_demandes_date on public.demandes (date_creation desc);
create index if not exists idx_demandes_categorie on public.demandes (categorie);
create index if not exists idx_demandes_employe on public.demandes (employe_id);

alter table public.demandes enable row level security;

drop policy if exists demandes_all on public.demandes;
create policy demandes_all on public.demandes for all using (true) with check (true);

create or replace function public.restore_planning_backup(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  tables jsonb;
  tbl text;
  raw jsonb;
  filtered jsonb;
  n int;
  result jsonb := '{}'::jsonb;
  delete_order text[] := array[
    'demandes',
    'receptions_chantier',
    'signalements',
    'absences',
    'phases_planning',
    'elements_chantier',
    'chantiers',
    'employees',
    'horaires_saisonniers'
  ];
  insert_order text[] := array[
    'employees',
    'horaires_saisonniers',
    'chantiers',
    'elements_chantier',
    'phases_planning',
    'absences',
    'signalements',
    'receptions_chantier',
    'demandes'
  ];
begin
  if coalesce(payload->>'app', '') <> 'planning-vauchel' then
    raise exception 'Fichier de sauvegarde non reconnu';
  end if;

  tables := coalesce(payload->'tables', '{}'::jsonb);
  if jsonb_typeof(tables->'employees') is distinct from 'array'
     or jsonb_array_length(tables->'employees') = 0 then
    raise exception 'Sauvegarde sans salariés : restauration refusée pour ne pas effacer les comptes.';
  end if;

  foreach tbl in array delete_order loop
    if to_regclass('public.' || tbl) is not null then
      execute format('delete from public.%I', tbl);
    end if;
  end loop;

  foreach tbl in array insert_order loop
    if to_regclass('public.' || tbl) is null then
      continue;
    end if;
    raw := tables->tbl;
    if jsonb_typeof(raw) is distinct from 'array' then
      result := result || jsonb_build_object(tbl, 0);
      continue;
    end if;
    filtered := public._backup_rows_for_table(tbl, raw);
    if jsonb_array_length(filtered) = 0 then
      result := result || jsonb_build_object(tbl, 0);
      continue;
    end if;
    execute format(
      'insert into public.%I select * from jsonb_populate_recordset(null::public.%I, $1)',
      tbl,
      tbl
    ) using filtered;
    get diagnostics n = row_count;
    result := result || jsonb_build_object(tbl, n);
  end loop;

  return jsonb_build_object('ok', true, 'restored', result);
end;
$$;

