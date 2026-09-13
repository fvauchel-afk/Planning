-- Phase Livraison (après thermolaquage, avant pose) + coordonnées de réception.

alter type public.type_phase add value if not exists 'livraison';

alter table public.chantiers
  add column if not exists adresse_livraison text,
  add column if not exists telephone_livraison text;
