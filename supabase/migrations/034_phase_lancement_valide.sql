-- Mémoriser le clic « Je valide le lancement » (indépendant du passage auto Estimatif → Confirmé).

alter table public.phases_planning
  add column if not exists lancement_valide boolean not null default false;
