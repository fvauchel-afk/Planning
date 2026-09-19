-- Fiche client : pays, particulier / professionnel (SIRET déjà en siren_siret).

alter table public.clients add column if not exists pays text;
alter table public.clients add column if not exists type_client text;

update public.clients
set type_client = 'particulier'
where type_client is null or type_client not in ('particulier', 'professionnel');

alter table public.clients
  alter column type_client set default 'particulier';

alter table public.clients
  alter column type_client set not null;

alter table public.clients drop constraint if exists clients_type_client_check;
alter table public.clients
  add constraint clients_type_client_check
  check (type_client in ('particulier', 'professionnel'));
