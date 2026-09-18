-- Origine d’un chantier : qui l’a créé, et quand.

alter table public.chantiers
  add column if not exists created_by text,
  add column if not exists created_at timestamptz;

update public.chantiers
set created_at = (date_creation::timestamp at time zone 'Europe/Paris')
where created_at is null and date_creation is not null;

alter table public.chantiers
  alter column created_at set default now();
