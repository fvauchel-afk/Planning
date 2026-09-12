-- MANUEL UNIQUEMENT — ne jamais exécuter depuis une migration ou un déploiement.
-- Vide les chantiers. Ne touche pas aux salariés.
-- À lancer seulement si un administrateur le demande explicitement dans l’éditeur SQL.

begin;

truncate table
  public.receptions_chantier,
  public.signalements,
  public.phases_planning,
  public.elements_chantier,
  public.chantiers,
  public.absences
restart identity;

commit;
