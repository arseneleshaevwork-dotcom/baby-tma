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
  created_at timestamptz not null default now(),
  unique(telegram_id, reminder_key, scheduled_at)
);

create index if not exists schedule_reminders_due_idx
  on public.schedule_reminders (status, scheduled_at);

alter table public.schedule_reminders enable row level security;
