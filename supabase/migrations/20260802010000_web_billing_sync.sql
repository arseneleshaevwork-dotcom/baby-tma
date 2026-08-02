alter table public.payments
  add column if not exists provider text not null default 'telegram_stars',
  add column if not exists external_payment_id text,
  add column if not exists idempotency_key text,
  add column if not exists error_code text,
  add column if not exists access_period_start timestamptz,
  add column if not exists access_period_end timestamptz,
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists payments_provider_external_payment_idx
  on public.payments (provider, external_payment_id)
  where external_payment_id is not null;

create unique index if not exists payments_provider_idempotency_idx
  on public.payments (provider, idempotency_key)
  where idempotency_key is not null;

alter table public.subscriptions
  add column if not exists cancel_at_period_end boolean not null default false,
  add column if not exists next_billing_at timestamptz,
  add column if not exists last_payment_at timestamptz,
  add column if not exists payment_method_type text,
  add column if not exists last_error text;

create table if not exists public.billing_agreements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  telegram_id bigint not null,
  provider text not null,
  plan text not null check (plan in ('month', 'quarter')),
  status text not null default 'active' check (status in ('active', 'processing', 'past_due', 'cancelled')),
  amount_minor integer not null check (amount_minor > 0),
  currency text not null default 'RUB',
  payment_method_ciphertext text not null,
  payment_method_type text,
  next_charge_at timestamptz not null,
  current_period_end timestamptz not null,
  cancel_at_period_end boolean not null default false,
  retry_count integer not null default 0,
  last_payment_id text,
  last_internal_payment_id uuid references public.payments(id) on delete set null,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, telegram_id)
);

create index if not exists billing_agreements_due_idx
  on public.billing_agreements (status, next_charge_at)
  where status in ('active', 'past_due');

create table if not exists public.billing_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_key text not null,
  event_type text not null,
  status text not null default 'processing' check (status in ('processing', 'processed', 'failed')),
  external_payment_id text,
  telegram_id bigint,
  payload jsonb not null default '{}'::jsonb,
  error text,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (provider, event_key)
);

create index if not exists billing_events_created_idx
  on public.billing_events (created_at desc);

create table if not exists public.web_login_nonces (
  id uuid primary key default gen_random_uuid(),
  nonce_hash text not null unique,
  request_fingerprint text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists web_login_nonces_fingerprint_idx
  on public.web_login_nonces (request_fingerprint, created_at desc);

create table if not exists public.web_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  telegram_id bigint not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists web_sessions_user_idx
  on public.web_sessions (user_id, expires_at desc);

create table if not exists public.diary_days (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  telegram_id bigint not null,
  entry_date date not null,
  data jsonb not null default '{}'::jsonb,
  client_updated_at timestamptz not null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, entry_date)
);

create index if not exists diary_days_user_date_idx
  on public.diary_days (user_id, entry_date desc);

create table if not exists public.user_app_settings (
  user_id uuid primary key references public.users(id) on delete cascade,
  telegram_id bigint not null unique,
  settings jsonb not null default '{}'::jsonb,
  client_updated_at timestamptz not null,
  updated_at timestamptz not null default now()
);

alter table public.billing_agreements enable row level security;
alter table public.billing_events enable row level security;
alter table public.web_login_nonces enable row level security;
alter table public.web_sessions enable row level security;
alter table public.diary_days enable row level security;
alter table public.user_app_settings enable row level security;

create or replace function public.cleanup_expired_web_auth()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.web_login_nonces where expires_at < now() - interval '1 day';
  delete from public.web_sessions where expires_at < now() - interval '30 days';
$$;

revoke all on function public.cleanup_expired_web_auth() from public;

select cron.unschedule(jobid)
from cron.job
where jobname = 'baby-web-auth-cleanup';

select cron.schedule(
  'baby-web-auth-cleanup',
  '35 3 * * *',
  'select public.cleanup_expired_web_auth();'
);

insert into public.internal_config (key, value, updated_at)
values ('yookassa_cron_token', encode(extensions.gen_random_bytes(32), 'hex'), now())
on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at;

insert into public.internal_config (key, value, updated_at)
select 'yookassa_cron_token_hash', encode(extensions.digest(value, 'sha256'), 'hex'), now()
from public.internal_config
where key = 'yookassa_cron_token'
on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at;

select cron.unschedule(jobid)
from cron.job
where jobname = 'baby-yookassa-renewals';

select cron.schedule(
  'baby-yookassa-renewals',
  '17 * * * *',
  format($job$
      select net.http_post(
        url := 'https://jfyprwisnrubhhowipdm.supabase.co/functions/v1/yookassa-renewals',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-token', %L
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 25000
      );
  $job$, (select value from public.internal_config where key = 'yookassa_cron_token'))
);

delete from public.internal_config where key = 'yookassa_cron_token';
