-- Traitement et archivage des demandes d’équipe.
-- Déjà appliqué en production ; fichier d’historique pour coller au schéma réel.

do $$ begin
  create type statut_demande as enum ('en_attente', 'traite');
exception when duplicate_object then null;
end $$;

alter table public.demandes
  add column if not exists statut statut_demande not null default 'en_attente';

alter table public.demandes
  add column if not exists archivee boolean not null default false;

create index if not exists idx_demandes_statut on public.demandes (statut);
create index if not exists idx_demandes_archivee on public.demandes (archivee);
