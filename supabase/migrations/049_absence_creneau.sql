-- Absences : journée entière, matin, après-midi, ou un nombre d’heures.

do $$ begin
  create type public.creneau_absence as enum ('journee', 'matin', 'apres_midi', 'heures');
exception when duplicate_object then null;
end $$;

alter table public.absences
  add column if not exists creneau public.creneau_absence not null default 'journee';

alter table public.absences
  add column if not exists duree_heures numeric;

alter table public.demandes
  add column if not exists creneau public.creneau_absence;

alter table public.demandes
  add column if not exists duree_heures numeric;
