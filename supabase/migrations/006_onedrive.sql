-- OneDrive (Microsoft Graph) : jetons serveur + erreur d’envoi réception

create table if not exists public.onedrive_tokens (
  id text primary key default 'default',
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  account_label text,
  root_item_id text,
  root_drive_id text,
  updated_at timestamptz not null default now()
);

alter table public.onedrive_tokens enable row level security;

drop policy if exists onedrive_tokens_all on public.onedrive_tokens;
create policy onedrive_tokens_all on public.onedrive_tokens
  for all using (true) with check (true);

alter table public.receptions_chantier
  add column if not exists onedrive_erreur text;
