create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create table if not exists public.internal_config (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table public.internal_config enable row level security;

insert into public.internal_config (key, value, updated_at)
values ('notification_cron_token', encode(extensions.gen_random_bytes(32), 'hex'), now())
on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at;

insert into public.internal_config (key, value, updated_at)
select 'notification_cron_token_hash', encode(extensions.digest(value, 'sha256'), 'hex'), now()
from public.internal_config
where key = 'notification_cron_token'
on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at;

select cron.unschedule(jobid)
from cron.job
where jobname = 'baby-telegram-reminders';

select cron.schedule(
  'baby-telegram-reminders',
  '*/5 * * * *',
  format($job$
      select net.http_post(
        url := 'https://jfyprwisnrubhhowipdm.supabase.co/functions/v1/telegram-notifications',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-token', %L
        ),
        body := '{"run_scheduled":true}'::jsonb,
        timeout_milliseconds := 10000
      );
  $job$, (select value from public.internal_config where key = 'notification_cron_token'))
);

delete from public.internal_config where key = 'notification_cron_token';
