-- Dates de chantier estimatives (approximatives) vs confirmées.
alter table public.chantiers
  add column if not exists dates_estimatives boolean not null default false;
