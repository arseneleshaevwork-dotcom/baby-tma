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
  claimed_at timestamptz,
  attempts integer not null default 0,
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

create table if not exists public.schedule_reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  telegram_id bigint not null,
  chat_id bigint not null,
  reminder_key text not null,
  reminder_type text not null,
  title text not null,
  message text not null,
  scheduled_at timestamptz not null,
  status text not null default 'pending',
  sent_at timestamptz,
  error text,
  claimed_at timestamptz,
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  unique(telegram_id, reminder_key, scheduled_at)
);

create table if not exists public.analytics_rate_limits (
  key_hash text primary key,
  window_start timestamptz not null default now(),
  request_count integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.internal_config (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.notification_runs (
  id uuid primary key default gen_random_uuid(),
  trigger text not null,
  dry_run boolean not null default false,
  planned integer not null default 0,
  sent integer not null default 0,
  failed integer not null default 0,
  completed_at timestamptz not null default now()
);

create table if not exists public.support_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  telegram_id bigint not null,
  category text not null default 'payment',
  message text not null,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists public.ai_consents (
  telegram_id bigint primary key,
  user_id uuid references public.users(id) on delete cascade,
  consent_version text not null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_requests (
  id uuid primary key default gen_random_uuid(),
  telegram_id bigint not null,
  user_id uuid references public.users(id) on delete set null,
  status text not null,
  model text,
  mode text,
  prompt_chars integer not null default 0,
  input_tokens integer,
  output_tokens integer,
  feedback text check (feedback in ('helpful', 'not_helpful')),
  feedback_at timestamptz,
  latency_ms integer check (latency_ms >= 0),
  created_at timestamptz not null default now()
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

create unique index if not exists payments_telegram_charge_unique_idx
  on public.payments (telegram_payment_charge_id)
  where telegram_payment_charge_id is not null;

create index if not exists schedule_reminders_due_idx
  on public.schedule_reminders (status, scheduled_at);

create index if not exists notification_runs_completed_idx
  on public.notification_runs (completed_at desc);

create index if not exists support_requests_status_created_idx
  on public.support_requests (status, created_at desc);

create index if not exists ai_requests_telegram_created_idx
  on public.ai_requests (telegram_id, created_at desc);

create index if not exists ai_requests_feedback_created_idx
  on public.ai_requests (feedback, created_at desc)
  where feedback is not null;

alter table public.users enable row level security;
alter table public.babies enable row level security;
alter table public.events enable row level security;
alter table public.notification_settings enable row level security;
alter table public.notification_deliveries enable row level security;
alter table public.subscriptions enable row level security;
alter table public.payments enable row level security;
alter table public.schedule_reminders enable row level security;
alter table public.analytics_rate_limits enable row level security;
alter table public.internal_config enable row level security;
alter table public.notification_runs enable row level security;
alter table public.support_requests enable row level security;
alter table public.ai_consents enable row level security;
alter table public.ai_requests enable row level security;

-- Useful funnel query:
-- select event_name, count(*) from public.events
-- where created_at >= now() - interval '7 days'
-- group by event_name
-- order by count(*) desc;
