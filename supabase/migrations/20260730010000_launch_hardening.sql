create unique index if not exists payments_telegram_charge_unique_idx
  on public.payments (telegram_payment_charge_id)
  where telegram_payment_charge_id is not null;

alter table public.schedule_reminders
  add column if not exists claimed_at timestamptz,
  add column if not exists attempts integer not null default 0;

alter table public.notification_deliveries
  add column if not exists claimed_at timestamptz,
  add column if not exists attempts integer not null default 0;

create or replace function public.claim_baby_notification(
  p_user_id uuid,
  p_baby_id uuid,
  p_telegram_id bigint,
  p_chat_id bigint,
  p_reminder_type text,
  p_event_date date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  delivery_id uuid;
begin
  insert into public.notification_deliveries (
    user_id, baby_id, telegram_id, chat_id, reminder_type, event_date,
    status, claimed_at, attempts
  ) values (
    p_user_id, p_baby_id, p_telegram_id, p_chat_id, p_reminder_type, p_event_date,
    'processing', now(), 1
  )
  on conflict (baby_id, reminder_type, event_date) do update
  set status = 'processing',
      claimed_at = now(),
      attempts = public.notification_deliveries.attempts + 1,
      error = null
  where public.notification_deliveries.status = 'failed'
     or (
       public.notification_deliveries.status = 'processing'
       and public.notification_deliveries.claimed_at < now() - interval '15 minutes'
     )
  returning id into delivery_id;

  return delivery_id;
end;
$$;

revoke all on function public.claim_baby_notification(uuid, uuid, bigint, bigint, text, date) from public, anon, authenticated;
grant execute on function public.claim_baby_notification(uuid, uuid, bigint, bigint, text, date) to service_role;

create or replace function public.claim_due_schedule_reminders(p_limit integer default 100)
returns setof public.schedule_reminders
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with due as (
    select reminder.id
    from public.schedule_reminders reminder
    where (
      reminder.status = 'pending'
      or (reminder.status = 'processing' and reminder.claimed_at < now() - interval '15 minutes')
    )
      and reminder.scheduled_at <= now()
      and reminder.scheduled_at >= now() - interval '6 hours'
    order by reminder.scheduled_at asc
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 100), 500))
  )
  update public.schedule_reminders reminder
  set status = 'processing',
      claimed_at = now(),
      attempts = reminder.attempts + 1,
      error = null
  from due
  where reminder.id = due.id
  returning reminder.*;
end;
$$;

revoke all on function public.claim_due_schedule_reminders(integer) from public, anon, authenticated;
grant execute on function public.claim_due_schedule_reminders(integer) to service_role;

create table if not exists public.analytics_rate_limits (
  key_hash text primary key,
  window_start timestamptz not null default now(),
  request_count integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.analytics_rate_limits enable row level security;

create or replace function public.consume_analytics_quota(p_key_hash text, p_limit integer default 10)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  next_count integer;
begin
  insert into public.analytics_rate_limits as quota (key_hash, window_start, request_count, updated_at)
  values (left(p_key_hash, 128), now(), 1, now())
  on conflict (key_hash) do update
  set window_start = case
        when quota.window_start < now() - interval '1 minute' then now()
        else quota.window_start
      end,
      request_count = case
        when quota.window_start < now() - interval '1 minute' then 1
        else quota.request_count + 1
      end,
      updated_at = now()
  returning request_count into next_count;

  return next_count <= greatest(1, least(coalesce(p_limit, 10), 60));
end;
$$;

revoke all on function public.consume_analytics_quota(text, integer) from public, anon, authenticated;
grant execute on function public.consume_analytics_quota(text, integer) to service_role;
