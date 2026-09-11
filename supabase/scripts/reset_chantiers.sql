-- Réinitialisation planning : vide chantiers et données liées.
-- Ne touche PAS à public.employees (PIN, rôles, horaires, admins).
-- À exécuter dans Supabase → SQL Editor.

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
