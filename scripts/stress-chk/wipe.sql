-- MANUEL / agent uniquement. Ne jamais lancer depuis une migration.
-- Supprime UNIQUEMENT le jeu de stress-test préfixé TEST-CHK.
-- Ne touche pas aux salariés ni chantiers de l’entreprise.

begin;

-- Détache un éventuel lien plan → demande avant suppression.
update public.chantiers
set plan_demande_id = null
where nom_client like 'TEST-CHK %';

-- Cascade : elements → phases → signalements / réceptions.
delete from public.chantiers
where nom_client like 'TEST-CHK %';

delete from public.sous_traitants
where nom like 'TEST-CHK %';

-- Cascade : absences, demandes, push. phases.employe_id passe à NULL
-- sur d’éventuelles phases hors TEST (il ne doit pas y en avoir).
delete from public.employees
where nom like 'TEST-CHK%';

commit;
