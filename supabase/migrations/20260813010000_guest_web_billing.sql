create table if not exists public.web_billing_guests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  billing_identity_id bigint not null unique check (billing_identity_id < 0),
  guest_token_hash text not null unique check (guest_token_hash ~ '^[0-9a-f]{64}$'),
  linked_telegram_id bigint,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists web_billing_guests_last_seen_idx
  on public.web_billing_guests (last_seen_at desc);

alter table public.web_billing_guests enable row level security;

create or replace function public.get_or_create_web_billing_guest_internal(p_token_hash text)
returns table (guest_id uuid, user_id uuid, billing_identity_id bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_guest public.web_billing_guests%rowtype;
  created_user_id uuid;
  candidate_identity bigint;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid guest token hash';
  end if;

  select * into existing_guest
  from public.web_billing_guests
  where guest_token_hash = p_token_hash;

  if found then
    update public.web_billing_guests set last_seen_at = now() where id = existing_guest.id;
    return query select existing_guest.id, existing_guest.user_id, existing_guest.billing_identity_id;
    return;
  end if;

  insert into public.users (client_id)
  values ('web_billing_' || gen_random_uuid()::text)
  returning id into created_user_id;

  loop
    candidate_identity := -(floor(random() * 9000000000000000)::bigint + 1);
    begin
      insert into public.web_billing_guests (user_id, billing_identity_id, guest_token_hash)
      values (created_user_id, candidate_identity, p_token_hash)
      returning * into existing_guest;
      exit;
    exception when unique_violation then
      select * into existing_guest
      from public.web_billing_guests
      where guest_token_hash = p_token_hash;
      if found then
        delete from public.users where id = created_user_id;
        return query select existing_guest.id, existing_guest.user_id, existing_guest.billing_identity_id;
        return;
      end if;
    end;
  end loop;

  return query select existing_guest.id, existing_guest.user_id, existing_guest.billing_identity_id;
end;
$$;

revoke all on function public.get_or_create_web_billing_guest_internal(text) from public;
grant execute on function public.get_or_create_web_billing_guest_internal(text) to service_role;
