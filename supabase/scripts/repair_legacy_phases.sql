-- Répare les phases créées avant les évolutions récentes (import SQL, fiches
-- sans durée / sans horaire / sans salarié) pour qu’elles s’affichent comme
-- les chantiers créés aujourd’hui.
-- Sans effet destructif sur les phases déjà complètes.

alter table public.phases_planning
  add column if not exists heure_debut text;

alter table public.phases_planning
  add column if not exists heures_supplementaires_par_jour numeric not null default 0;

-- Date de fin manquante → même jour que le début
update public.phases_planning
set date_fin = date_debut
where date_debut is not null
  and date_fin is null;

-- Horaire manquant : matin par défaut, après-midi si la durée ressemble à un créneau court
update public.phases_planning
set heure_debut = case
  when duree_estimee_heures is not null and duree_estimee_heures > 0 and duree_estimee_heures <= 3.5
    then '13:00'
  else '07:30'
end
where date_debut is not null
  and (heure_debut is null or btrim(heure_debut) = '');

-- Durée nulle alors que la phase est datée
update public.phases_planning
set duree_estimee_heures = case
  when heure_debut is not null and left(heure_debut, 5) >= '12:00' then 3
  else 4
end
where date_debut is not null
  and coalesce(duree_estimee_heures, 0) <= 0;

-- Salarié manquant : reprendre un salarié déjà posé sur le même chantier
update public.phases_planning p
set employe_id = sib.employe_id
from public.elements_chantier e
join lateral (
  select p2.employe_id
  from public.phases_planning p2
  join public.elements_chantier e2 on e2.id = p2.element_id
  where e2.chantier_id = e.chantier_id
    and p2.employe_id is not null
  order by p2.date_debut nulls last, p2.id
  limit 1
) sib on true
where p.element_id = e.id
  and p.date_debut is not null
  and p.type_phase <> 'logistique'
  and p.employe_id is null
  and sib.employe_id is not null;

-- Contrôle : phases encore « fantômes » (datées mais non affichables)
select
  c.nom_client,
  p.id as phase_id,
  p.date_debut,
  p.date_fin,
  p.duree_estimee_heures,
  p.heure_debut,
  p.employe_id,
  p.type_phase
from public.phases_planning p
join public.elements_chantier el on el.id = p.element_id
join public.chantiers c on c.id = el.chantier_id
where p.date_debut is not null
  and (
    coalesce(p.duree_estimee_heures, 0) <= 0
    or (p.type_phase <> 'logistique' and p.employe_id is null)
  )
order by c.nom_client, p.date_debut;
