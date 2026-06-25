create extension if not exists pgcrypto;

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  telegram_id bigint unique,
  username text,
  first_name text,
  language_code text,
  client_id text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table if not exists public.babies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  client_id text,
  name text,
  birthdate date,
  age_months integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id),
  unique(client_id)
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  event_name text not null,
  user_id uuid references public.users(id) on delete set null,
  client_id text,
  session_id text,
  telegram_id bigint,
  baby_name text,
  baby_birthdate date,
  baby_age_months integer,
  attribution jsonb not null default '{}'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  page text,
  user_agent text,
  language text,
  created_at timestamptz not null default now()
);

create table if not exists public.notification_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  telegram_id bigint,
  client_id text,
  chat_id bigint,
  enabled boolean not null default false,
  timezone text not null default 'Europe/Moscow',
  birthday_reminders boolean not null default true,
  age_milestones boolean not null default true,
  schedule_reminders boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id),
  unique(telegram_id),
  unique(client_id)
);

create table if not exists public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  baby_id uuid references public.babies(id) on delete cascade,
  telegram_id bigint,
  chat_id bigint,
  reminder_type text not null,
  event_date date not null,
  status text not null default 'sent',
  error text,
  sent_at timestamptz not null default now(),
  unique(baby_id, reminder_type, event_date)
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  telegram_id bigint not null,
  plan text not null,
  status text not null default 'active',
  source text not null default 'telegram_stars',
  current_period_start timestamptz not null default now(),
  current_period_end timestamptz not null,
  last_invoice_payload text,
  last_telegram_payment_charge_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(telegram_id)
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  telegram_id bigint not null,
  invoice_payload text not null unique,
  plan text not null,
  currency text not null default 'XTR',
  total_amount integer not null,
  status text not null default 'created',
  telegram_payment_charge_id text,
  provider_payment_charge_id text,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create index if not exists events_event_name_created_at_idx
  on public.events (event_name, created_at desc);

create index if not exists events_client_id_created_at_idx
  on public.events (client_id, created_at desc);

create index if not exists users_telegram_id_idx
  on public.users (telegram_id);

create index if not exists notification_settings_enabled_idx
  on public.notification_settings (enabled, updated_at desc);

create index if not exists notification_deliveries_event_idx
  on public.notification_deliveries (event_date, reminder_type);

create index if not exists subscriptions_status_period_idx
  on public.subscriptions (status, current_period_end desc);

create index if not exists subscriptions_telegram_id_idx
  on public.subscriptions (telegram_id);

create index if not exists payments_telegram_id_created_at_idx
  on public.payments (telegram_id, created_at desc);

alter table public.users enable row level security;
alter table public.babies enable row level security;
alter table public.events enable row level security;
alter table public.notification_settings enable row level security;
alter table public.notification_deliveries enable row level security;
alter table public.subscriptions enable row level security;
alter table public.payments enable row level security;

-- Useful funnel query:
-- select event_name, count(*) from public.events
-- where created_at >= now() - interval '7 days'
-- group by event_name
-- order by count(*) desc;
