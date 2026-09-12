-- Retire le chantier « Julian » des créneaux d’Ethan déjà occupés par
-- l’absence « Autre — École » (superposition créée par un glisser-déposer).
-- À exécuter dans l’éditeur SQL Supabase (une fois).
--
-- Contrôle d’abord : la requête « Aperçu » liste les jours concernés.
-- La réparation coupe ou supprime uniquement les phases Julian d’Ethan
-- sur ces jours. Ethan garde l’absence École ; Julian reste ailleurs.

-- Aperçu (ne modifie rien)
select
  emp.nom as salarie,
  c.nom_client as chantier,
  p.id as phase_id,
  p.date_debut,
  p.date_fin,
  d::date as jour_superpose,
  a.type as absence_type,
  a.motif_precision
from public.phases_planning p
join public.elements_chantier e on e.id = p.element_id
join public.chantiers c on c.id = e.chantier_id
join public.employees emp on emp.id = p.employe_id
join generate_series(p.date_debut, coalesce(p.date_fin, p.date_debut), interval '1 day') d on true
join public.absences a
  on a.employe_id = emp.id
 and d::date between a.date_debut and a.date_fin
where emp.nom ilike '%ethan%'
  and c.nom_client ilike '%julian%'
  and a.type = 'autre'
  and (
    coalesce(a.motif_precision, '') ilike '%ecole%'
    or coalesce(a.motif_precision, '') ilike '%école%'
  )
order by p.date_debut, jour_superpose;

do $$
declare
  rec record;
  keep_dates date[];
  island_start date;
  island_end date;
  prev_date date;
  first_island boolean;
  new_id uuid;
begin
  for rec in
    select p.*
    from public.phases_planning p
    join public.elements_chantier e on e.id = p.element_id
    join public.chantiers c on c.id = e.chantier_id
    join public.employees emp on emp.id = p.employe_id
    where emp.nom ilike '%ethan%'
      and c.nom_client ilike '%julian%'
      and p.date_debut is not null
      and exists (
        select 1
        from public.absences a
        where a.employe_id = emp.id
          and a.type = 'autre'
          and (
            coalesce(a.motif_precision, '') ilike '%ecole%'
            or coalesce(a.motif_precision, '') ilike '%école%'
          )
          and a.date_debut <= coalesce(p.date_fin, p.date_debut)
          and a.date_fin >= p.date_debut
      )
  loop
    select coalesce(array_agg(jour order by jour), '{}')
    into keep_dates
    from (
      select gs::date as jour
      from generate_series(
        rec.date_debut,
        coalesce(rec.date_fin, rec.date_debut),
        interval '1 day'
      ) gs
      where not exists (
        select 1
        from public.absences a
        where a.employe_id = rec.employe_id
          and a.type = 'autre'
          and (
            coalesce(a.motif_precision, '') ilike '%ecole%'
            or coalesce(a.motif_precision, '') ilike '%école%'
          )
          and gs::date between a.date_debut and a.date_fin
      )
    ) kept;

    if keep_dates is null or cardinality(keep_dates) = 0 then
      delete from public.phases_planning where id = rec.id;
      continue;
    end if;

    first_island := true;
    island_start := keep_dates[1];
    island_end := keep_dates[1];
    prev_date := keep_dates[1];

    for i in 2 .. cardinality(keep_dates) loop
      if keep_dates[i] = prev_date + 1 then
        island_end := keep_dates[i];
      else
        if first_island then
          update public.phases_planning
          set date_debut = island_start, date_fin = island_end
          where id = rec.id;
          first_island := false;
        else
          new_id := gen_random_uuid();
          insert into public.phases_planning (
            id,
            element_id,
            type_phase,
            duree_estimee_heures,
            date_debut,
            date_fin,
            employe_id,
            statut,
            urgent,
            heure_debut,
            heures_supplementaires_par_jour
          )
          values (
            new_id,
            rec.element_id,
            rec.type_phase,
            rec.duree_estimee_heures,
            island_start,
            island_end,
            rec.employe_id,
            rec.statut,
            rec.urgent,
            rec.heure_debut,
            coalesce(rec.heures_supplementaires_par_jour, 0)
          );
        end if;
        island_start := keep_dates[i];
        island_end := keep_dates[i];
      end if;
      prev_date := keep_dates[i];
    end loop;

    if first_island then
      update public.phases_planning
      set date_debut = island_start, date_fin = island_end
      where id = rec.id;
    else
      new_id := gen_random_uuid();
      insert into public.phases_planning (
        id,
        element_id,
        type_phase,
        duree_estimee_heures,
        date_debut,
        date_fin,
        employe_id,
        statut,
        urgent,
        heure_debut,
        heures_supplementaires_par_jour
      )
      values (
        new_id,
        rec.element_id,
        rec.type_phase,
        rec.duree_estimee_heures,
        island_start,
        island_end,
        rec.employe_id,
        rec.statut,
        rec.urgent,
        rec.heure_debut,
        coalesce(rec.heures_supplementaires_par_jour, 0)
      );
    end if;
  end loop;
end $$;

-- Contrôle : plus aucune superposition Julian / École chez Ethan
select
  emp.nom as salarie,
  c.nom_client as chantier,
  p.id as phase_id,
  p.date_debut,
  p.date_fin,
  d::date as jour_superpose
from public.phases_planning p
join public.elements_chantier e on e.id = p.element_id
join public.chantiers c on c.id = e.chantier_id
join public.employees emp on emp.id = p.employe_id
join generate_series(p.date_debut, coalesce(p.date_fin, p.date_debut), interval '1 day') d on true
join public.absences a
  on a.employe_id = emp.id
 and d::date between a.date_debut and a.date_fin
where emp.nom ilike '%ethan%'
  and c.nom_client ilike '%julian%'
  and a.type = 'autre'
  and (
    coalesce(a.motif_precision, '') ilike '%ecole%'
    or coalesce(a.motif_precision, '') ilike '%école%'
  );
