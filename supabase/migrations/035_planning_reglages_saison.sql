-- Saison été / hiver forcée manuellement (sans changer les dates automatiques).

create table if not exists public.planning_reglages (
  id text primary key,
  saison_forcee text check (
    saison_forcee is null or saison_forcee in ('ete', 'hiver')
  )
);

alter table public.planning_reglages enable row level security;

drop policy if exists planning_reglages_all on public.planning_reglages;
create policy planning_reglages_all on public.planning_reglages
  for all using (true) with check (true);

insert into public.planning_reglages (id, saison_forcee)
values ('default', null)
on conflict (id) do nothing;
