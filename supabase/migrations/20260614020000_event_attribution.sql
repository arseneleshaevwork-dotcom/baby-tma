alter table public.events
  add column if not exists attribution jsonb not null default '{}'::jsonb;

create index if not exists events_attribution_campaign_idx
  on public.events ((attribution->>'utm_campaign'), created_at desc);
