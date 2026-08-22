create or replace function public.claim_web_billing_guest_internal(
  p_token_hash text,
  p_target_user_id uuid,
  p_target_telegram_id bigint
)
returns table (claimed boolean, current_period_end timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_guest public.web_billing_guests%rowtype;
  v_period_end timestamptz;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$'
    or p_target_user_id is null or p_target_telegram_id is null or p_target_telegram_id <= 0 then
    raise exception 'invalid_claim';
  end if;

  perform 1 from public.users
  where id = p_target_user_id and telegram_id = p_target_telegram_id;
  if not found then raise exception 'target_user_not_found'; end if;

  select * into v_guest
  from public.web_billing_guests
  where guest_token_hash = p_token_hash
  for update;
  if not found then raise exception 'guest_not_found'; end if;
  if v_guest.linked_telegram_id is not null and v_guest.linked_telegram_id <> p_target_telegram_id then
    raise exception 'guest_already_linked';
  end if;

  if v_guest.linked_telegram_id = p_target_telegram_id then
    select s.current_period_end into v_period_end
    from public.subscriptions s where s.telegram_id = p_target_telegram_id;
    return query select false, v_period_end;
    return;
  end if;

  if exists(select 1 from public.subscriptions where telegram_id = p_target_telegram_id)
    or exists(select 1 from public.billing_agreements where provider = 'yookassa' and telegram_id = p_target_telegram_id) then
    raise exception 'target_billing_exists';
  end if;

  update public.payments
  set user_id = p_target_user_id, telegram_id = p_target_telegram_id, updated_at = now()
  where telegram_id = v_guest.billing_identity_id;

  update public.subscriptions
  set user_id = p_target_user_id, telegram_id = p_target_telegram_id, updated_at = now()
  where telegram_id = v_guest.billing_identity_id
  returning subscriptions.current_period_end into v_period_end;

  update public.billing_agreements
  set user_id = p_target_user_id, telegram_id = p_target_telegram_id, updated_at = now()
  where provider = 'yookassa' and telegram_id = v_guest.billing_identity_id;

  if not exists(select 1 from public.partner_referrals where billing_identity_id = p_target_telegram_id) then
    update public.partner_referrals
    set user_id = p_target_user_id, billing_identity_id = p_target_telegram_id
    where billing_identity_id = v_guest.billing_identity_id;
  end if;

  update public.web_billing_guests
  set linked_telegram_id = p_target_telegram_id, last_seen_at = now()
  where id = v_guest.id;

  return query select true, v_period_end;
end;
$$;

revoke all on function public.claim_web_billing_guest_internal(text, uuid, bigint) from public, anon, authenticated;
grant execute on function public.claim_web_billing_guest_internal(text, uuid, bigint) to service_role;
