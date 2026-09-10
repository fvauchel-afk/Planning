-- Amplitude par jour de semaine + horaires personnalisés salarié

alter table public.horaires_saisonniers
  add column if not exists jours jsonb not null default '{}'::jsonb;

alter table public.employees
  add column if not exists horaires_personnalises jsonb;

update public.horaires_saisonniers
set jours = jsonb_build_object(
  '1', jsonb_build_object(
    'ouverture', coalesce(ouverture, '08:00'),
    'fermeture', coalesce(fermeture, '17:00'),
    'heures_matin', heures_matin,
    'heures_apres_midi', heures_apres_midi
  ),
  '2', jsonb_build_object(
    'ouverture', coalesce(ouverture, '08:00'),
    'fermeture', coalesce(fermeture, '17:00'),
    'heures_matin', heures_matin,
    'heures_apres_midi', heures_apres_midi
  ),
  '3', jsonb_build_object(
    'ouverture', coalesce(ouverture, '08:00'),
    'fermeture', coalesce(fermeture, '17:00'),
    'heures_matin', heures_matin,
    'heures_apres_midi', heures_apres_midi
  ),
  '4', jsonb_build_object(
    'ouverture', coalesce(ouverture, '08:00'),
    'fermeture', coalesce(fermeture, '17:00'),
    'heures_matin', heures_matin,
    'heures_apres_midi', heures_apres_midi
  ),
  '5', jsonb_build_object(
    'ouverture', coalesce(ouverture, '08:00'),
    'fermeture', '12:00',
    'heures_matin', heures_matin,
    'heures_apres_midi', 0
  ),
  '6', jsonb_build_object(
    'ouverture', '',
    'fermeture', '',
    'heures_matin', 0,
    'heures_apres_midi', 0
  )
)
where jours = '{}'::jsonb;
