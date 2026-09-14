-- Nouvelle catégorie et statuts pour les demandes de congé.
-- À exécuter une fois dans l’éditeur SQL Supabase (d’abord les enums, puis les colonnes).

alter type public.categorie_demande add value if not exists 'conge';
alter type public.statut_demande add value if not exists 'acceptee';
alter type public.statut_demande add value if not exists 'refusee';
