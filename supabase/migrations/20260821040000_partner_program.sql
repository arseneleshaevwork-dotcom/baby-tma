create table if not exists public.partners (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  contact text,
  status text not null default 'active' check (status in ('active', 'paused')),
  commission_bps integer not null default 3000 check (commission_bps between 0 and 5000),
  attribution_days integer not null default 30 check (attribution_days between 1 and 365),
  hold_days integer not null default 14 check (hold_days between 0 and 90),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint partners_code_format check (code ~ '^[a-z0-9][a-z0-9_-]{2,31}$'),
  constraint partners_name_length check (char_length(name) between 2 and 120),
  constraint partners_contact_length check (contact is null or char_length(contact) <= 160)
);

create table if not exists public.partner_referrals (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete restrict,
  user_id uuid references public.users(id) on delete set null,
  billing_identity_id bigint not null,
  source text not null check (source in ('telegram_bot', 'mini_app', 'web_checkout', 'telegram_stars')),
  code text not null,
  captured_at timestamptz not null default now(),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (billing_identity_id),
  constraint partner_referrals_expiry check (expires_at > captured_at)
);

create table if not exists public.partner_payouts (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete restrict,
  amount_minor integer not null check (amount_minor > 0),
  currency text not null default 'RUB' check (currency = 'RUB'),
  status text not null default 'paid' check (status in ('paid', 'cancelled')),
  commission_count integer not null default 0 check (commission_count >= 0),
  note text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  constraint partner_payouts_note_length check (note is null or char_length(note) <= 500)
);

create table if not exists public.partner_commissions (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete restrict,
  referral_id uuid not null references public.partner_referrals(id) on delete restrict,
  payment_id uuid not null unique references public.payments(id) on delete restrict,
  payout_id uuid references public.partner_payouts(id) on delete set null,
  amount_minor integer not null check (amount_minor > 0),
  commission_bps integer not null check (commission_bps between 0 and 5000),
  commission_minor integer not null check (commission_minor >= 0),
  currency text not null default 'RUB' check (currency = 'RUB'),
  status text not null default 'pending' check (status in ('pending', 'paid', 'reversed')),
  available_at timestamptz not null,
  paid_at timestamptz,
  reversed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists partner_referrals_partner_idx
  on public.partner_referrals (partner_id, captured_at desc);
create index if not exists partner_referrals_expiry_idx
  on public.partner_referrals (expires_at);
create index if not exists partner_commissions_partner_status_idx
  on public.partner_commissions (partner_id, status, available_at);
create index if not exists partner_payouts_partner_idx
  on public.partner_payouts (partner_id, created_at desc);

alter table public.partners enable row level security;
alter table public.partner_referrals enable row level security;
alter table public.partner_commissions enable row level security;
alter table public.partner_payouts enable row level security;

revoke all on public.partners from anon, authenticated;
revoke all on public.partner_referrals from anon, authenticated;
revoke all on public.partner_commissions from anon, authenticated;
revoke all on public.partner_payouts from anon, authenticated;

create or replace function public.record_partner_payout_internal(
  p_partner_id uuid,
  p_note text default null
)
returns table (payout_id uuid, amount_minor integer, commission_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payout_id uuid;
  v_amount integer;
  v_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_partner_id::text, 0));

  select coalesce(sum(c.commission_minor), 0)::integer, count(*)::integer
    into v_amount, v_count
  from public.partner_commissions c
  where c.partner_id = p_partner_id
    and c.status = 'pending'
    and c.available_at <= now();

  if v_amount < 100000 or v_count <= 0 then
    raise exception 'no_available_commissions';
  end if;

  insert into public.partner_payouts (partner_id, amount_minor, commission_count, note, paid_at)
  values (p_partner_id, v_amount, v_count, nullif(left(trim(p_note), 500), ''), now())
  returning id into v_payout_id;

  update public.partner_commissions
  set status = 'paid', payout_id = v_payout_id, paid_at = now(), updated_at = now()
  where partner_id = p_partner_id
    and status = 'pending'
    and available_at <= now();

  return query select v_payout_id, v_amount, v_count;
end;
$$;

revoke all on function public.record_partner_payout_internal(uuid, text) from public, anon, authenticated;
grant execute on function public.record_partner_payout_internal(uuid, text) to service_role;
