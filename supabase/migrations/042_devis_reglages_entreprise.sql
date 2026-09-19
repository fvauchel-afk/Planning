-- Devis v1 validée : numérotation séquence, options, entreprise, fiche client enrichie.

create sequence if not exists public.devis_numero_seq as integer start with 1;

alter table public.clients add column if not exists siren_siret text;
alter table public.clients add column if not exists tva_intra text;
alter table public.clients add column if not exists adresse_livraison text;
alter table public.clients add column if not exists lien_dossier_onedrive text;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'devis'
      and column_name = 'numero' and data_type in ('text', 'character varying')
  ) then
    alter table public.devis add column if not exists numero_int integer;
    update public.devis
      set numero_int = nextval('public.devis_numero_seq')
      where numero_int is null;
    alter table public.devis drop constraint if exists devis_numero_key;
    alter table public.devis drop column numero;
    alter table public.devis rename column numero_int to numero;
    alter table public.devis alter column numero set not null;
    alter table public.devis add constraint devis_numero_key unique (numero);
  end if;
end $$;

alter table public.devis alter column numero set default nextval('public.devis_numero_seq');
alter sequence public.devis_numero_seq owned by public.devis.numero;

alter table public.devis add column if not exists date_emission date;
update public.devis set date_emission = date_devis where date_emission is null;
alter table public.devis alter column date_emission set default ((now() at time zone 'Europe/Paris')::date);

alter table public.devis add column if not exists type_facturation text not null default 'complet';
alter table public.devis add column if not exists langue text not null default 'fr';
alter table public.devis add column if not exists opt_adresse_livraison boolean not null default false;
alter table public.devis add column if not exists opt_siren boolean not null default false;
alter table public.devis add column if not exists opt_tva_intra boolean not null default false;
alter table public.devis add column if not exists opt_conditions boolean not null default true;
alter table public.devis add column if not exists opt_signature boolean not null default true;
alter table public.devis add column if not exists opt_intitule boolean not null default false;
alter table public.devis add column if not exists opt_champ_libre boolean not null default false;
alter table public.devis add column if not exists opt_remise boolean not null default false;
alter table public.devis add column if not exists intitule_document text;
alter table public.devis add column if not exists remise_type text;
alter table public.devis add column if not exists remise_valeur numeric;
alter table public.devis add column if not exists onedrive_fichier text;

create table if not exists public.entreprise_reglages (
  id text primary key,
  nom text,
  forme_juridique text,
  adresse text,
  code_postal text,
  ville text,
  telephone text,
  email text,
  capital_social text,
  siret text,
  code_naf text,
  rcs text,
  tva_intra text,
  iban text,
  bic text,
  updated_at timestamptz not null default now()
);

create table if not exists public.devis_reglages (
  id text primary key,
  validite_jours_defaut integer not null default 5,
  mail_sujet text not null default 'Votre devis {{société}}',
  mail_corps text not null default '',
  conditions_acceptation_actif boolean not null default true,
  conditions_acceptation_texte text,
  champ_libre_actif boolean not null default false,
  champ_libre_texte text,
  updated_at timestamptz not null default now()
);

alter table public.entreprise_reglages enable row level security;
alter table public.devis_reglages enable row level security;

drop policy if exists entreprise_reglages_all on public.entreprise_reglages;
create policy entreprise_reglages_all on public.entreprise_reglages
  for all using (true) with check (true);

drop policy if exists devis_reglages_all on public.devis_reglages;
create policy devis_reglages_all on public.devis_reglages
  for all using (true) with check (true);

insert into public.entreprise_reglages (id, nom, forme_juridique)
values ('default', 'La Métallerie du Sud', 'SASU')
on conflict (id) do nothing;

insert into public.devis_reglages (id)
values ('default')
on conflict (id) do nothing;

grant usage, select on sequence public.devis_numero_seq to anon, authenticated, service_role;
