-- Nouvelle catégorie de demande : sujet de réunion de direction.
-- À exécuter une fois dans l’éditeur SQL Supabase.

alter type public.categorie_demande add value if not exists 'reunion_direction';
