-- Abonnements Web Push (notifications commandes pour Alexis et Mika).
-- À coller dans l’éditeur SQL Supabase (SQL Editor → New query → Run).

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  employe_id uuid not null references public.employees(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_push_subscriptions_employe
  on public.push_subscriptions (employe_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists push_subscriptions_all on public.push_subscriptions;
create policy push_subscriptions_all on public.push_subscriptions
  for all using (true) with check (true);
