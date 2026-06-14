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

create index if not exists notification_settings_enabled_idx
  on public.notification_settings (enabled, updated_at desc);

create index if not exists notification_deliveries_event_idx
  on public.notification_deliveries (event_date, reminder_type);

alter table public.notification_settings enable row level security;
alter table public.notification_deliveries enable row level security;
