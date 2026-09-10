alter table public.phases_planning
  add column if not exists heures_supplementaires_par_jour numeric not null default 0;
