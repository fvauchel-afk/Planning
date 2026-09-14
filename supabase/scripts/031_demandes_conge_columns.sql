-- Champs structurés des demandes de congé.
-- À exécuter une fois dans l’éditeur SQL Supabase, après 030_demandes_conge_enums.sql.

alter table public.demandes
  add column if not exists date_debut date;

alter table public.demandes
  add column if not exists date_fin date;

alter table public.demandes
  add column if not exists type_absence type_absence;

alter table public.demandes
  add column if not exists motif_precision text;

alter table public.demandes
  add column if not exists motif_refus text;

alter table public.demandes
  add column if not exists absence_id uuid references public.absences(id) on delete set null;

create index if not exists idx_demandes_absence on public.demandes (absence_id);
