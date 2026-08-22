alter table public.partners
  drop constraint if exists partners_status_check;

alter table public.partners
  add constraint partners_status_check
    check (status in ('pending', 'active', 'paused', 'rejected')),
  add column if not exists user_id uuid references public.users(id) on delete set null,
  add column if not exists telegram_id bigint,
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists terms_version text,
  add column if not exists applied_at timestamptz,
  add column if not exists reviewed_at timestamptz,
  add column if not exists approved_at timestamptz;

alter table public.partners
  drop constraint if exists partners_telegram_id_check,
  add constraint partners_telegram_id_check
    check (telegram_id is null or telegram_id > 0),
  drop constraint if exists partners_terms_version_length,
  add constraint partners_terms_version_length
    check (terms_version is null or char_length(terms_version) <= 64);

create unique index if not exists partners_user_id_key
  on public.partners (user_id)
  where user_id is not null;

create unique index if not exists partners_telegram_id_key
  on public.partners (telegram_id)
  where telegram_id is not null;

create index if not exists partners_status_applied_idx
  on public.partners (status, applied_at desc nulls last);

revoke all on public.partners from anon, authenticated;
