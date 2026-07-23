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
  prompt_chars integer not null default 0,
  input_tokens integer,
  output_tokens integer,
  created_at timestamptz not null default now()
);

create index if not exists ai_requests_telegram_created_idx
  on public.ai_requests (telegram_id, created_at desc);

alter table public.ai_consents enable row level security;
alter table public.ai_requests enable row level security;
