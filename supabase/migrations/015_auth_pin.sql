-- Authentification PIN + verrouillage RLS (plus de using (true))

alter table public.employees
  add column if not exists pin_hash text,
  add column if not exists is_admin boolean not null default false;

update public.employees
set is_admin = true
where lower(trim(nom)) in ('jonathan', 'michael', 'alexis');

-- PIN par défaut (à changer depuis l’écran Employés)
update public.employees
set pin_hash = crypt('1111', gen_salt('bf'))
where lower(trim(nom)) = 'jonathan' and pin_hash is null;

update public.employees
set pin_hash = crypt('2222', gen_salt('bf'))
where lower(trim(nom)) = 'michael' and pin_hash is null;

update public.employees
set pin_hash = crypt('3333', gen_salt('bf'))
where lower(trim(nom)) = 'alexis' and pin_hash is null;

update public.employees
set pin_hash = crypt('1234', gen_salt('bf'))
where pin_hash is null;

create or replace function public.employees_default_pin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.pin_hash is null then
    new.pin_hash := crypt('1234', gen_salt('bf'));
  end if;
  if new.is_admin is null then
    new.is_admin := false;
  end if;
  return new;
end;
$$;

drop trigger if exists employees_default_pin on public.employees;
create trigger employees_default_pin
before insert on public.employees
for each row execute procedure public.employees_default_pin();

create or replace function public.login_with_pin(p_pin text)
returns table (id uuid, nom text, is_admin boolean)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_pin is null or p_pin !~ '^\d{4}$' then
    return;
  end if;
  return query
  select e.id, e.nom, e.is_admin
  from public.employees e
  where e.actif = true
    and e.pin_hash is not null
    and e.pin_hash = crypt(p_pin, e.pin_hash)
  order by e.is_admin desc, e.nom
  limit 1;
end;
$$;

create or replace function public.set_employee_pin(p_id uuid, p_pin text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_pin is null or p_pin !~ '^\d{4}$' then
    raise exception 'PIN invalide (4 chiffres)';
  end if;
  update public.employees
  set pin_hash = crypt(p_pin, gen_salt('bf'))
  where id = p_id;
  if not found then
    raise exception 'Employé introuvable';
  end if;
end;
$$;

revoke all on function public.login_with_pin(text) from public;
grant execute on function public.login_with_pin(text) to anon, authenticated;

revoke all on function public.set_employee_pin(uuid, text) from public, anon, authenticated;
revoke all on function public.employees_default_pin() from public, anon, authenticated;

-- Fermer les politiques ouvertes
drop policy if exists employees_all on public.employees;
drop policy if exists chantiers_all on public.chantiers;
drop policy if exists elements_all on public.elements_chantier;
drop policy if exists phases_all on public.phases_planning;
drop policy if exists absences_all on public.absences;

do $$
declare
  t text;
begin
  foreach t in array array[
    'signalements',
    'receptions_chantier',
    'onedrive_tokens',
    'horaires_saisonniers',
    'types_contrat'
  ]
  loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists %I on public.%I', t || '_all', t);
      if t = 'receptions_chantier' then
        execute 'drop policy if exists receptions_all on public.receptions_chantier';
      end if;
      if t = 'onedrive_tokens' then
        execute 'drop policy if exists onedrive_tokens_all on public.onedrive_tokens';
      end if;
      if t = 'horaires_saisonniers' then
        execute 'drop policy if exists horaires_all on public.horaires_saisonniers';
      end if;
      if t = 'types_contrat' then
        execute 'drop policy if exists types_contrat_all on public.types_contrat';
      end if;
      execute format('alter table public.%I enable row level security', t);
      execute format('revoke all on table public.%I from anon, authenticated, public', t);
    end if;
  end loop;
end $$;

alter table public.employees enable row level security;
alter table public.chantiers enable row level security;
alter table public.elements_chantier enable row level security;
alter table public.phases_planning enable row level security;
alter table public.absences enable row level security;

-- Aucune politique = aucun accès via la clé anon. Le serveur utilise la clé service_role.
revoke all on table public.employees from anon, authenticated, public;
revoke all on table public.chantiers from anon, authenticated, public;
revoke all on table public.elements_chantier from anon, authenticated, public;
revoke all on table public.phases_planning from anon, authenticated, public;
revoke all on table public.absences from anon, authenticated, public;
grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant execute on function public.set_employee_pin(uuid, text) to service_role;
grant execute on function public.login_with_pin(text) to service_role;
