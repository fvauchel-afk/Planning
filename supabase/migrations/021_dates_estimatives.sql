-- Dates de chantier estimatives (approximatives) vs confirmées.
-- Déjà appliqué en production ; fichier d’historique pour coller au schéma réel.
alter table public.chantiers
  add column if not exists dates_estimatives boolean not null default false;
