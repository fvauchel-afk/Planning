-- Restauration atomique d’une sauvegarde JSON (service_role uniquement).
-- Cette fonction remplace les tables métier : elle ne doit JAMAIS être appelée
-- depuis une migration automatique, un cron, ou un déploiement.
-- Seule une action explicite de Jonathan / Mika via l’écran Sauvegarde.

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
    'receptions_chantier'
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

create or replace function public._backup_rows_for_table(p_table text, p_rows jsonb)
returns jsonb
language plpgsql
stable
as $$
declare
  col text;
  cols text[] := '{}';
  item jsonb;
  slim jsonb;
  out jsonb := '[]'::jsonb;
begin
  if p_table !~ '^[a-z_]+$' then
    raise exception 'Table invalide';
  end if;
  for col in
    select column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name = p_table
    order by ordinal_position
  loop
    cols := cols || col;
  end loop;

  for item in select * from jsonb_array_elements(p_rows)
  loop
    slim := '{}'::jsonb;
    foreach col in array cols loop
      if item ? col then
        slim := slim || jsonb_build_object(col, item->col);
      end if;
    end loop;
    out := out || jsonb_build_array(slim);
  end loop;
  return out;
end;
$$;

revoke all on function public.restore_planning_backup(jsonb) from public, anon, authenticated;
revoke all on function public._backup_rows_for_table(text, jsonb) from public, anon, authenticated;
grant execute on function public.restore_planning_backup(jsonb) to service_role;
grant execute on function public._backup_rows_for_table(text, jsonb) to service_role;
