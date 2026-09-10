-- Motifs d'absence : formation + autre (précision libre)

alter type public.type_absence add value if not exists 'formation';
alter type public.type_absence add value if not exists 'autre';

alter table public.absences
  add column if not exists motif_precision text;
