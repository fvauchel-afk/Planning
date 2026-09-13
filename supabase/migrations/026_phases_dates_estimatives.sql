-- Dates estimatives au niveau de chaque phase.
-- À coller dans l’éditeur SQL Supabase.

alter table public.phases_planning
  add column if not exists dates_estimatives boolean not null default false;

update public.phases_planning as phase
set dates_estimatives = true
from public.elements_chantier as element
join public.chantiers as chantier on chantier.id = element.chantier_id
where phase.element_id = element.id
  and chantier.dates_estimatives = true;
