create table if not exists public.ai_daily_usage (
  telegram_id bigint not null,
  usage_date date not null default (now() at time zone 'utc')::date,
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (telegram_id, usage_date)
);

alter table public.ai_daily_usage enable row level security;
revoke all on table public.ai_daily_usage from public, anon, authenticated;
grant all on table public.ai_daily_usage to service_role;

create or replace function public.consume_ai_daily_quota(p_telegram_id bigint, p_limit integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  next_count integer;
begin
  if p_telegram_id is null or p_telegram_id = 0 then
    raise exception 'invalid telegram id';
  end if;

  insert into public.ai_daily_usage as quota (telegram_id, usage_date, request_count, updated_at)
  values (p_telegram_id, (now() at time zone 'utc')::date, 1, now())
  on conflict (telegram_id, usage_date) do update
  set request_count = quota.request_count + 1,
      updated_at = now()
  returning request_count into next_count;

  return case when next_count <= greatest(1, least(coalesce(p_limit, 1), 100)) then next_count else 0 end;
end;
$$;

revoke all on function public.consume_ai_daily_quota(bigint, integer) from public, anon, authenticated;
grant execute on function public.consume_ai_daily_quota(bigint, integer) to service_role;
