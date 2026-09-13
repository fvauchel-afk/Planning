-- Marge de déplacement pour les chantiers « Pas pressé » (± N jours calendaires).
-- À coller dans l’éditeur SQL Supabase.

alter table public.chantiers
  add column if not exists tolerance_deplacement_jours integer;

comment on column public.chantiers.tolerance_deplacement_jours is
  'Marge ± en jours calendaires pour un chantier pas pressé (défaut 30 = 1 mois). Ignorée pour Normal (14 j.) et Prioritaire (0).';
