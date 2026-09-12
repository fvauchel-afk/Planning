-- À exécuter dans l’éditeur SQL Supabase si la colonne n’existe pas encore.
-- Distingue une date estimative (approximative) d’une date confirmée.

alter table public.chantiers
  add column if not exists dates_estimatives boolean not null default false;
