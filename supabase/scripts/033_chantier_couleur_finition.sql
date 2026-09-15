-- Couleur RAL et finition du thermolaquage sur la fiche chantier.

alter table public.chantiers
  add column if not exists couleur_ral text;

alter table public.chantiers
  add column if not exists finition text;

alter table public.chantiers
  drop constraint if exists chantiers_finition_check;

alter table public.chantiers
  add constraint chantiers_finition_check
  check (
    finition is null
    or finition in ('mat', 'satin', 'brillant', 'texture_fin')
  );
