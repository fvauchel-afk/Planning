-- Nettoyage des chantiers de test + import des 15 chantiers + planning Excel.
-- À coller et exécuter EN ENTIER dans Supabase → SQL Editor.
--
-- Phases : une par demi-journée (MATIN 07:30 / 4 h, APRES-MIDI 13:00 / 3 h, horaires d’été).
-- Type de phase : pose si le salarié a ce rôle, sinon fabrication, sinon administratif.
-- CONGE → absences.type = conge. ABSENT → absences.type = autre (Absence imprévue).

begin;

drop table if exists tmp_planning;
drop table if exists tmp_noms_test;
drop table if exists tmp_noms_reels;
drop table if exists tmp_employe_map;
drop table if exists tmp_chantier_map;

create or replace function pg_temp.norm_nom(p text)
returns text
language sql
immutable
as $$
  select lower(btrim(regexp_replace(
    translate(
      coalesce(p, ''),
      'ÀÁÂÄÅàáâäåÈÉÊËèéêëÌÍÎÏìíîïÒÓÔÖòóôöÙÚÛÜùúûüÇçÑñŸÿŒœ’''`',
      'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOooooUUUUuuuuCcNnYyOeOe   '
    ),
    '\s+',
    ' ',
    'g'
  )));
$$;

create temporary table tmp_noms_test (nom text primary key);
insert into tmp_noms_test (nom) values
  ('Dupont'),
  ('Martin'),
  ('Lefèvre'),
  ('Lefevre'),
  ('AAA'),
  ('BB'),
  ('aaaa'),
  ('ccc'),
  ('zzzzzz'),
  ('yyyyy'),
  ('ttttt'),
  ('crotte'),
  ('Bite'),
  ('Cacatoes'),
  ('One Drive'),
  ('TEST'),
  ('Brassure'),
  ('Cacahuete'),
  ('Croute'),
  ('Mie de pain'),
  ('AAAZZZ');

create temporary table tmp_noms_reels (nom text primary key);
insert into tmp_noms_reels (nom) values
  ('Blaevoet Mezzanne'),
  ('Pergola Maryline Piscine'),
  ('master 8h'),
  ('Thermolack'),
  ('Gc Piscine Galvanisée'),
  ('GC GDH dépose'),
  ('Portail tech plus'),
  ('Baie antoine'),
  ('ASD'),
  ('Potelet SNEF'),
  ('garroucha portail battant'),
  ('Razzautti'),
  ('Julie Telliez'),
  ('BT Wallon'),
  ('Pergola Maryline Cintrée');

create temporary table tmp_planning (
  salarie text not null,
  jour date not null,
  creneau text not null,
  valeur text not null
);

insert into tmp_planning (salarie, jour, creneau, valeur) values
  ('Jonathan', '2026-09-10', 'MATIN', 'Julie Telliez'),
  ('Jonathan', '2026-09-10', 'APRES-MIDI', 'Julie Telliez'),
  ('Romain', '2026-09-01', 'MATIN', 'Blaevoet Mezzanne'),
  ('Romain', '2026-09-01', 'APRES-MIDI', 'Blaevoet Mezzanne'),
  ('Romain', '2026-09-02', 'MATIN', 'CONGE'),
  ('Romain', '2026-09-02', 'APRES-MIDI', 'CONGE'),
  ('Romain', '2026-09-03', 'MATIN', 'Blaevoet Mezzanne'),
  ('Romain', '2026-09-03', 'APRES-MIDI', 'Blaevoet Mezzanne'),
  ('Romain', '2026-09-04', 'MATIN', 'Blaevoet Mezzanne'),
  ('Romain', '2026-09-07', 'MATIN', 'Gc Piscine Galvanisée'),
  ('Romain', '2026-09-07', 'APRES-MIDI', 'Gc Piscine Galvanisée'),
  ('Romain', '2026-09-08', 'MATIN', 'Portail tech plus'),
  ('Romain', '2026-09-08', 'APRES-MIDI', 'Portail tech plus'),
  ('Romain', '2026-09-09', 'MATIN', 'Portail tech plus'),
  ('Romain', '2026-09-09', 'APRES-MIDI', 'garroucha portail battant'),
  ('Romain', '2026-09-10', 'MATIN', 'garroucha portail battant'),
  ('Romain', '2026-09-10', 'APRES-MIDI', 'garroucha portail battant'),
  ('Romain', '2026-09-11', 'MATIN', 'garroucha portail battant'),
  ('Romain', '2026-09-14', 'MATIN', 'BT Wallon'),
  ('Romain', '2026-09-14', 'APRES-MIDI', 'BT Wallon'),
  ('Alexis', '2026-09-01', 'MATIN', 'Pergola Maryline Piscine'),
  ('Alexis', '2026-09-01', 'APRES-MIDI', 'Pergola Maryline Piscine'),
  ('Alexis', '2026-09-02', 'MATIN', 'Pergola Maryline Piscine'),
  ('Alexis', '2026-09-07', 'MATIN', 'GC GDH dépose'),
  ('Alexis', '2026-09-07', 'APRES-MIDI', 'GC GDH dépose'),
  ('Alexis', '2026-09-08', 'MATIN', 'Baie antoine'),
  ('Alexis', '2026-09-08', 'APRES-MIDI', 'Baie antoine'),
  ('Alexis', '2026-09-09', 'MATIN', 'Razzautti'),
  ('Alexis', '2026-09-09', 'APRES-MIDI', 'Razzautti'),
  ('Alexis', '2026-09-10', 'MATIN', 'Baie antoine'),
  ('Alexis', '2026-09-10', 'APRES-MIDI', 'Baie antoine'),
  ('Alexis', '2026-09-11', 'MATIN', 'Baie antoine'),
  ('Alexis', '2026-09-14', 'MATIN', 'Baie antoine'),
  ('Alexis', '2026-09-14', 'APRES-MIDI', 'Baie antoine'),
  ('Louison', '2026-09-01', 'MATIN', 'Blaevoet Mezzanne'),
  ('Louison', '2026-09-01', 'APRES-MIDI', 'Blaevoet Mezzanne'),
  ('Louison', '2026-09-02', 'MATIN', 'Blaevoet Mezzanne'),
  ('Louison', '2026-09-02', 'APRES-MIDI', 'Blaevoet Mezzanne'),
  ('Louison', '2026-09-07', 'MATIN', 'GC GDH dépose'),
  ('Louison', '2026-09-07', 'APRES-MIDI', 'GC GDH dépose'),
  ('Louison', '2026-09-08', 'MATIN', 'Blaevoet Mezzanne'),
  ('Louison', '2026-09-08', 'APRES-MIDI', 'ASD'),
  ('Louison', '2026-09-09', 'MATIN', 'Blaevoet Mezzanne'),
  ('Louison', '2026-09-09', 'APRES-MIDI', 'Blaevoet Mezzanne'),
  ('Louison', '2026-09-10', 'MATIN', 'Blaevoet Mezzanne'),
  ('Louison', '2026-09-10', 'APRES-MIDI', 'Blaevoet Mezzanne'),
  ('Louison', '2026-09-14', 'MATIN', 'Pergola Maryline Cintrée'),
  ('Louison', '2026-09-14', 'APRES-MIDI', 'Pergola Maryline Cintrée'),
  ('Quentin', '2026-09-01', 'MATIN', 'ABSENT'),
  ('Quentin', '2026-09-01', 'APRES-MIDI', 'ABSENT'),
  ('Quentin', '2026-09-02', 'MATIN', 'ABSENT'),
  ('Quentin', '2026-09-02', 'APRES-MIDI', 'ABSENT'),
  ('Quentin', '2026-09-03', 'MATIN', 'ABSENT'),
  ('Quentin', '2026-09-03', 'APRES-MIDI', 'ABSENT'),
  ('Quentin', '2026-09-04', 'MATIN', 'ABSENT'),
  ('Quentin', '2026-09-07', 'MATIN', 'ABSENT'),
  ('Quentin', '2026-09-07', 'APRES-MIDI', 'ABSENT'),
  ('Quentin', '2026-09-08', 'MATIN', 'ABSENT'),
  ('Quentin', '2026-09-08', 'APRES-MIDI', 'ABSENT'),
  ('Quentin', '2026-09-09', 'MATIN', 'ABSENT'),
  ('Quentin', '2026-09-09', 'APRES-MIDI', 'ABSENT'),
  ('Quentin', '2026-09-10', 'MATIN', 'ABSENT'),
  ('Quentin', '2026-09-10', 'APRES-MIDI', 'ABSENT'),
  ('Quentin', '2026-09-14', 'MATIN', 'ABSENT'),
  ('Quentin', '2026-09-14', 'APRES-MIDI', 'ABSENT'),
  ('Raphaël', '2026-09-01', 'MATIN', 'CONGE'),
  ('Raphaël', '2026-09-01', 'APRES-MIDI', 'CONGE'),
  ('Raphaël', '2026-09-02', 'MATIN', 'master 8h'),
  ('Raphaël', '2026-09-02', 'APRES-MIDI', 'Thermolack'),
  ('Raphaël', '2026-09-04', 'MATIN', 'CONGE'),
  ('Raphaël', '2026-09-04', 'APRES-MIDI', 'CONGE'),
  ('Raphaël', '2026-09-07', 'MATIN', 'GC GDH dépose'),
  ('Raphaël', '2026-09-07', 'APRES-MIDI', 'GC GDH dépose'),
  ('Raphaël', '2026-09-08', 'MATIN', 'Blaevoet Mezzanne'),
  ('Raphaël', '2026-09-08', 'APRES-MIDI', 'Blaevoet Mezzanne'),
  ('Raphaël', '2026-09-09', 'MATIN', 'Blaevoet Mezzanne'),
  ('Raphaël', '2026-09-09', 'APRES-MIDI', 'Blaevoet Mezzanne'),
  ('Raphaël', '2026-09-10', 'MATIN', 'Julie Telliez'),
  ('Raphaël', '2026-09-10', 'APRES-MIDI', 'Julie Telliez'),
  ('Raphaël', '2026-09-14', 'MATIN', 'Pergola Maryline Cintrée'),
  ('Raphaël', '2026-09-14', 'APRES-MIDI', 'Pergola Maryline Cintrée'),
  ('Ethan', '2026-09-08', 'MATIN', 'Potelet SNEF'),
  ('Ethan', '2026-09-08', 'APRES-MIDI', 'Potelet SNEF'),
  ('Ethan', '2026-09-09', 'MATIN', 'Potelet SNEF'),
  ('Michael', '2026-09-04', 'MATIN', 'Razzautti'),
  ('Michael', '2026-09-04', 'APRES-MIDI', 'Razzautti'),
  ('Michael', '2026-09-09', 'MATIN', 'Razzautti'),
  ('Michael', '2026-09-09', 'APRES-MIDI', 'Razzautti');

delete from public.chantiers c
using tmp_noms_test t
where pg_temp.norm_nom(c.nom_client) = pg_temp.norm_nom(t.nom);

insert into public.chantiers (nom_client, adresse, priorite)
select r.nom, '', 'normal'::priorite_chantier
from tmp_noms_reels r
where not exists (
  select 1
  from public.chantiers c
  where pg_temp.norm_nom(c.nom_client) = pg_temp.norm_nom(r.nom)
);

-- Un élément « Travaux » par chantier (requis pour phases_planning.element_id)
insert into public.elements_chantier (chantier_id, nom_element)
select c.id, 'Travaux'
from public.chantiers c
join tmp_noms_reels r on pg_temp.norm_nom(c.nom_client) = pg_temp.norm_nom(r.nom)
where not exists (
  select 1
  from public.elements_chantier e
  where e.chantier_id = c.id
);

create temporary table tmp_employe_map as
select distinct
  p.salarie,
  (
    select e.id
    from public.employees e
    where e.actif = true
      and (
        pg_temp.norm_nom(e.nom) = pg_temp.norm_nom(p.salarie)
        or split_part(pg_temp.norm_nom(e.nom), ' ', 1) = pg_temp.norm_nom(p.salarie)
      )
    order by
      case when pg_temp.norm_nom(e.nom) = pg_temp.norm_nom(p.salarie) then 0 else 1 end,
      e.nom
    limit 1
  ) as employe_id
from tmp_planning p;

create temporary table tmp_chantier_map as
select distinct
  p.valeur as nom,
  c.id as chantier_id
from tmp_planning p
join public.chantiers c
  on pg_temp.norm_nom(c.nom_client) = pg_temp.norm_nom(p.valeur)
where upper(btrim(p.valeur)) not in ('CONGE', 'ABSENT');

do $$
declare
  missing_emp text;
  missing_ch text;
  dup_emp int;
begin
  select string_agg(salarie, ', ' order by salarie)
  into missing_emp
  from tmp_employe_map
  where employe_id is null;
  if missing_emp is not null then
    raise exception 'Salarié(s) introuvable(s) dans employees : %', missing_emp;
  end if;

  select count(*) into dup_emp
  from (
    select salarie from tmp_employe_map group by salarie having count(*) > 1
  ) d;
  if dup_emp > 0 then
    raise exception 'Plusieurs employés correspondent à un même prénom Excel.';
  end if;

  select string_agg(distinct p.valeur, ', ' order by p.valeur)
  into missing_ch
  from tmp_planning p
  where upper(btrim(p.valeur)) not in ('CONGE', 'ABSENT')
    and not exists (
      select 1 from tmp_chantier_map m where m.nom = p.valeur
    );
  if missing_ch is not null then
    raise exception 'Chantier(s) introuvable(s) : %', missing_ch;
  end if;
end $$;

-- Remplace les phases déjà importées sur ces 15 chantiers
delete from public.phases_planning ph
using public.elements_chantier el
join public.chantiers c on c.id = el.chantier_id
join tmp_noms_reels r on pg_temp.norm_nom(c.nom_client) = pg_temp.norm_nom(r.nom)
where ph.element_id = el.id;

delete from public.absences a
using tmp_employe_map m
where a.employe_id = m.employe_id
  and a.date_debut >= date '2026-09-01'
  and a.date_fin <= date '2026-09-14'
  and a.type in ('conge'::type_absence, 'autre'::type_absence);

insert into public.phases_planning (
  element_id,
  type_phase,
  duree_estimee_heures,
  date_debut,
  date_fin,
  heure_debut,
  employe_id,
  statut,
  urgent
)
select
  (
    select el.id
    from public.elements_chantier el
    where el.chantier_id = cm.chantier_id
    order by el.nom_element
    limit 1
  ) as element_id,
  case
    when 'pose'::role_employe = any (emp.roles) then 'pose'::type_phase
    when 'fabrication'::role_employe = any (emp.roles) then 'fabrication'::type_phase
    when 'administratif'::role_employe = any (emp.roles) then 'administratif'::type_phase
    else 'logistique'::type_phase
  end as type_phase,
  case when p.creneau = 'MATIN' then 4 else 3 end as duree_estimee_heures,
  p.jour,
  p.jour,
  case when p.creneau = 'MATIN' then '07:30' else '13:00' end as heure_debut,
  emp.id,
  'a_faire'::statut_phase,
  false
from tmp_planning p
join tmp_employe_map em on em.salarie = p.salarie
join public.employees emp on emp.id = em.employe_id
join tmp_chantier_map cm on cm.nom = p.valeur
where upper(btrim(p.valeur)) not in ('CONGE', 'ABSENT');

-- Absences : un jour par ligne Excel, puis fusion des jours calendaires consécutifs
with jours as (
  select distinct
    em.employe_id,
    p.jour,
    case
      when upper(btrim(p.valeur)) = 'CONGE' then 'conge'::type_absence
      else 'autre'::type_absence
    end as type_abs,
    case
      when upper(btrim(p.valeur)) = 'ABSENT' then 'Absence imprévue'
      else null
    end as motif
  from tmp_planning p
  join tmp_employe_map em on em.salarie = p.salarie
  where upper(btrim(p.valeur)) in ('CONGE', 'ABSENT')
),
iles as (
  select
    employe_id,
    type_abs,
    motif,
    jour,
    jour - (row_number() over (partition by employe_id, type_abs, motif order by jour)) * interval '1 day' as grp
  from jours
)
insert into public.absences (employe_id, date_debut, date_fin, type, motif_precision)
select
  employe_id,
  min(jour),
  max(jour),
  type_abs,
  motif
from iles
group by employe_id, type_abs, motif, grp;

-- Contrôles
select 'chantiers' as kind, count(*)::int as n
from public.chantiers c
join tmp_noms_reels r on pg_temp.norm_nom(c.nom_client) = pg_temp.norm_nom(r.nom)
union all
select 'phases', count(*)::int
from public.phases_planning ph
join public.elements_chantier el on el.id = ph.element_id
join public.chantiers c on c.id = el.chantier_id
join tmp_noms_reels r on pg_temp.norm_nom(c.nom_client) = pg_temp.norm_nom(r.nom)
union all
select 'absences_conge_autre', count(*)::int
from public.absences a
join tmp_employe_map m on m.employe_id = a.employe_id
where a.date_debut >= date '2026-09-01'
  and a.date_fin <= date '2026-09-14'
  and a.type in ('conge'::type_absence, 'autre'::type_absence);

select e.nom as salarie, ph.date_debut, ph.heure_debut, c.nom_client, ph.type_phase
from public.phases_planning ph
join public.employees e on e.id = ph.employe_id
join public.elements_chantier el on el.id = ph.element_id
join public.chantiers c on c.id = el.chantier_id
join tmp_noms_reels r on pg_temp.norm_nom(c.nom_client) = pg_temp.norm_nom(r.nom)
order by e.nom, ph.date_debut, ph.heure_debut;

select e.nom as salarie, a.date_debut, a.date_fin, a.type, a.motif_precision
from public.absences a
join public.employees e on e.id = a.employe_id
join tmp_employe_map m on m.employe_id = a.employe_id
where a.date_debut >= date '2026-09-01'
  and a.date_fin <= date '2026-09-14'
  and a.type in ('conge'::type_absence, 'autre'::type_absence)
order by e.nom, a.date_debut;

commit;
