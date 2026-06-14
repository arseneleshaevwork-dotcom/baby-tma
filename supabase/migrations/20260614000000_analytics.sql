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
  payload jsonb not null default '{}'::jsonb,
  page text,
  user_agent text,
  language text,
  created_at timestamptz not null default now()
);

create index if not exists events_event_name_created_at_idx
  on public.events (event_name, created_at desc);

create index if not exists events_client_id_created_at_idx
  on public.events (client_id, created_at desc);

create index if not exists users_telegram_id_idx
  on public.users (telegram_id);

alter table public.users enable row level security;
alter table public.babies enable row level security;
alter table public.events enable row level security;
