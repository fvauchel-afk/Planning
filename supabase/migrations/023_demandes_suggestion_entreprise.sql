-- Nouvelle catégorie de demande : suggestion d’amélioration entreprise.
-- À exécuter une fois dans l’éditeur SQL Supabase.

alter type public.categorie_demande add value if not exists 'suggestion_entreprise';
