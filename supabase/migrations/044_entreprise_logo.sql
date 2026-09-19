-- Logo société (Paramètres généraux).

alter table public.entreprise_reglages add column if not exists logo_base64 text;
alter table public.entreprise_reglages add column if not exists logo_mime text;
