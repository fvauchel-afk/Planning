-- Lignes Commande pour les chantiers déjà « Plan validé » (dont listes vides).
insert into public.commandes (
  chantier_id,
  created_by,
  statut,
  fournisseur,
  fournitures,
  onedrive_lien,
  nom_client
)
select
  c.id,
  null,
  'a_faire',
  null,
  coalesce(c.fournitures, '[]'::jsonb),
  c.lien_dossier_onedrive,
  c.nom_client
from public.chantiers c
where c.plan_valide is true
  and not exists (
    select 1 from public.commandes x where x.chantier_id = c.id
  );
