alter table public.partners
  add column if not exists commission_payment_limit integer not null default 2,
  add column if not exists commission_days integer not null default 62;

alter table public.partners
  drop constraint if exists partners_commission_payment_limit_check,
  add constraint partners_commission_payment_limit_check
    check (commission_payment_limit between 1 and 12),
  drop constraint if exists partners_commission_days_check,
  add constraint partners_commission_days_check
    check (commission_days between 1 and 365);

alter table public.partner_referrals
  add column if not exists converted_at timestamptz,
  add column if not exists commission_ends_at timestamptz;

alter table public.partner_commissions
  add column if not exists payment_number integer;

with ranked as (
  select id, row_number() over (partition by referral_id order by created_at, id)::integer as number
  from public.partner_commissions
)
update public.partner_commissions c
set payment_number = ranked.number
from ranked
where c.id = ranked.id
  and c.payment_number is null;

alter table public.partner_commissions
  alter column payment_number set not null,
  drop constraint if exists partner_commissions_payment_number_check,
  add constraint partner_commissions_payment_number_check check (payment_number >= 1);

create unique index if not exists partner_commissions_referral_payment_number_key
  on public.partner_commissions (referral_id, payment_number);

update public.partner_referrals r
set converted_at = first_commission.created_at,
    commission_ends_at = first_commission.created_at + interval '62 days'
from (
  select distinct on (referral_id) referral_id, created_at
  from public.partner_commissions
  order by referral_id, payment_number, created_at
) first_commission
where r.id = first_commission.referral_id
  and r.converted_at is null;
