-- Sujets pour la réunion de direction (bulle de demandes + onglet Réunion).

alter type public.categorie_demande add value if not exists 'reunion_direction';
