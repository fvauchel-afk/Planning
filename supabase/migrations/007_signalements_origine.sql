-- Origine des signalements : salarié ou décalage administrateur

do $$ begin
  create type origine_signalement as enum ('salarie', 'decalage_admin');
exception when duplicate_object then null;
end $$;

alter table public.signalements
  add column if not exists origine origine_signalement not null default 'salarie';
