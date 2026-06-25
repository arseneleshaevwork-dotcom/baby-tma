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

create index if not exists subscriptions_status_period_idx
  on public.subscriptions (status, current_period_end desc);

create index if not exists subscriptions_telegram_id_idx
  on public.subscriptions (telegram_id);

create index if not exists payments_telegram_id_created_at_idx
  on public.payments (telegram_id, created_at desc);

alter table public.subscriptions enable row level security;
alter table public.payments enable row level security;
