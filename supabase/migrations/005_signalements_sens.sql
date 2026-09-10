-- Sens retard / avance sur les signalements

do $$ begin
  create type type_ecart as enum ('retard', 'avance');
exception when duplicate_object then null;
end $$;

alter table public.signalements
  add column if not exists sens type_ecart not null default 'retard';
