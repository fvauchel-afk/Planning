-- pgcrypto est dans le schéma extensions. Les fonctions PIN avaient
-- search_path = public seulement, et gen_salt('bf') est typé unknown
-- (erreur 42883 à la création d’un salarié).

create extension if not exists pgcrypto with schema extensions;

create or replace function public.employees_default_pin()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if new.pin_hash is null then
    new.pin_hash := extensions.crypt('1234', extensions.gen_salt('bf'::text));
  end if;
  if new.is_admin is null then
    new.is_admin := false;
  end if;
  return new;
end;
$$;

create or replace function public.login_with_pin(p_pin text)
returns table (id uuid, nom text, is_admin boolean)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  match_count integer;
begin
  if p_pin is null or p_pin !~ '^\d{4}$' then
    return;
  end if;

  select count(*)::integer into match_count
  from public.employees e
  where e.actif = true
    and e.pin_hash is not null
    and e.pin_hash = extensions.crypt(p_pin, e.pin_hash);

  if match_count > 1 then
    raise exception using
      errcode = 'P0001',
      message = 'PIN_NOT_UNIQUE';
  end if;

  if match_count is distinct from 1 then
    return;
  end if;

  return query
  select e.id, e.nom, e.is_admin
  from public.employees e
  where e.actif = true
    and e.pin_hash is not null
    and e.pin_hash = extensions.crypt(p_pin, e.pin_hash);
end;
$$;

create or replace function public.set_employee_pin(p_id uuid, p_pin text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if p_pin is null or p_pin !~ '^\d{4}$' then
    raise exception 'PIN invalide (4 chiffres)';
  end if;

  if exists (
    select 1
    from public.employees e
    where e.id is distinct from p_id
      and e.pin_hash is not null
      and e.pin_hash = extensions.crypt(p_pin, e.pin_hash)
  ) then
    raise exception 'Ce code PIN est déjà utilisé par un autre employé';
  end if;

  update public.employees
  set pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf'::text))
  where id = p_id;
  if not found then
    raise exception 'Employé introuvable';
  end if;
end;
$$;

revoke all on function public.login_with_pin(text) from public;
grant execute on function public.login_with_pin(text) to anon, authenticated, service_role;

revoke all on function public.set_employee_pin(uuid, text) from public, anon, authenticated;
grant execute on function public.set_employee_pin(uuid, text) to service_role;

revoke all on function public.employees_default_pin() from public, anon, authenticated;
