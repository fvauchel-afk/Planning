-- Demandes de congé : nouvelle catégorie, statuts acceptée/refusée, dates et type d’absence.
-- ALTER TYPE ADD VALUE : à exécuter avant d’insérer ces valeurs (transaction séparée côté Postgres).

alter type public.categorie_demande add value if not exists 'conge';
alter type public.statut_demande add value if not exists 'acceptee';
alter type public.statut_demande add value if not exists 'refusee';
