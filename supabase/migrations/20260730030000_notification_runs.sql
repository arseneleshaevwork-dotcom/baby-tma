create table if not exists public.notification_runs (
  id uuid primary key default gen_random_uuid(),
  trigger text not null,
  dry_run boolean not null default false,
  planned integer not null default 0,
  sent integer not null default 0,
  failed integer not null default 0,
  completed_at timestamptz not null default now()
);

create index if not exists notification_runs_completed_idx
  on public.notification_runs (completed_at desc);

alter table public.notification_runs enable row level security;
