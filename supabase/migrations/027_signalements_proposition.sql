-- Proposition d’algorithme stockée sur le signalement (validation Mika / Alexis).
-- À coller dans l’éditeur SQL Supabase.

alter table public.signalements
  alter column phase_id drop not null;

alter table public.signalements
  add column if not exists proposition jsonb;
