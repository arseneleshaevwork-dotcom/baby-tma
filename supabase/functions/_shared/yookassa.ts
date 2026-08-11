import { addBillingMonths, getBillingPlan, rubles, sealBillingSecret } from './billing.mjs';

export async function yookassaRequest(path: string, options: {
  method?: string;
  body?: any;
  idempotenceKey?: string;
} = {}) {
  const shopId = Deno.env.get('YOOKASSA_SHOP_ID');
  const secretKey = Deno.env.get('YOOKASSA_SECRET_KEY');
  if (!shopId || !secretKey) throw new Error('yookassa_not_configured');
  const headers: Record<string, string> = {
    Authorization: `Basic ${btoa(`${shopId}:${secretKey}`)}`,
    Accept: 'application/json'
  };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.idempotenceKey) headers['Idempotence-Key'] = options.idempotenceKey.slice(0, 64);
  const response = await fetch(`https://api.yookassa.ru/v3${path}`, {
    method: options.method || 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(`yookassa_${response.status}`);
    (error as any).details = data;
    throw error;
  }
  return data;
}

export function yookassaPaymentBody({ plan, paymentId, telegramId, returnUrl, paymentMethodId }: {
  plan: any;
  paymentId: string;
  telegramId: number;
  returnUrl?: string;
  paymentMethodId?: string;
}) {
  const body: any = {
    amount: { value: rubles(plan.amountMinor), currency: 'RUB' },
    capture: true,
    description: `${plan.label} в приложении «Малыш в ритме»`,
    metadata: {
      internal_payment_id: paymentId,
      telegram_id: String(telegramId),
      plan: plan.key
    }
  };
  if (paymentMethodId) body.payment_method_id = paymentMethodId;
  else {
    body.confirmation = { type: 'redirect', return_url: returnUrl };
    body.save_payment_method = true;
    body.merchant_customer_id = `tg_${telegramId}`;
  }
  return body;
}

export async function applySucceededYookassaPayment({ supabase, payment, encryptionSecret }: {
  supabase: any;
  payment: any;
  encryptionSecret: string;
}) {
  if (payment?.status !== 'succeeded' || payment?.paid !== true) throw new Error('payment_not_succeeded');
  const internalPaymentId = String(payment?.metadata?.internal_payment_id || '');
  const telegramId = Number(payment?.metadata?.telegram_id || 0);
  const plan = getBillingPlan(payment?.metadata?.plan);
  if (!/^[0-9a-f-]{36}$/i.test(internalPaymentId) || !telegramId || !plan) throw new Error('payment_metadata_invalid');
  const { data: localPayment, error: localPaymentError } = await supabase.from('payments')
    .select('id,user_id,telegram_id,plan,currency,total_amount,status,external_payment_id,access_period_start,access_period_end')
    .eq('id', internalPaymentId).eq('provider', 'yookassa').maybeSingle();
  if (localPaymentError) throw localPaymentError;
  if (!localPayment) throw new Error('local_payment_not_found');
  if (Number(localPayment.telegram_id) !== telegramId || localPayment.plan !== plan.key) throw new Error('payment_owner_mismatch');
  if (localPayment.currency !== 'RUB' || Number(localPayment.total_amount) !== plan.amountMinor) throw new Error('payment_amount_mismatch');
  if (localPayment.external_payment_id && localPayment.external_payment_id !== String(payment.id)) throw new Error('payment_id_mismatch');
  if (String(payment?.amount?.currency) !== 'RUB' || Math.round(Number(payment?.amount?.value) * 100) !== plan.amountMinor) {
    throw new Error('provider_amount_mismatch');
  }
  const now = new Date();
  const [{ data: current }, { data: existingAgreement }] = await Promise.all([
    supabase.from('subscriptions').select('current_period_end').eq('telegram_id', telegramId).maybeSingle(),
    supabase.from('billing_agreements').select('cancel_at_period_end,status,current_period_end,last_payment_id')
      .eq('provider', 'yookassa').eq('telegram_id', telegramId).maybeSingle()
  ]);
  const paymentMethod = payment?.payment_method;
  const paymentMethodSaved = paymentMethod?.saved === true && paymentMethod?.id;
  if (!paymentMethodSaved) throw new Error('payment_method_not_saved');
  const ciphertext = await sealBillingSecret(String(paymentMethod.id), encryptionSecret);
  const keepCancelled = Boolean(existingAgreement?.cancel_at_period_end || existingAgreement?.status === 'cancelled');
  let currentPeriodStart = localPayment.access_period_start;
  let currentPeriodEnd = localPayment.access_period_end;
  let newlyPaid = false;

  if (localPayment.status !== 'paid') {
    const currentEnd = new Date(current?.current_period_end || 0);
    const extensionStart = !Number.isNaN(currentEnd.getTime()) && currentEnd > now ? currentEnd : now;
    currentPeriodStart = extensionStart.toISOString();
    currentPeriodEnd = addBillingMonths(extensionStart, plan.months).toISOString();
    const paymentUpdate = await supabase.from('payments').update({
      status: 'paid',
      external_payment_id: String(payment.id),
      provider_payment_charge_id: String(payment.id),
      raw_payload: redactPayment(payment),
      paid_at: now.toISOString(),
      access_period_start: currentPeriodStart,
      access_period_end: currentPeriodEnd,
      updated_at: now.toISOString(),
      error_code: null
    }).eq('id', internalPaymentId).neq('status', 'paid')
      .select('access_period_start,access_period_end').maybeSingle();
    newlyPaid = Boolean(paymentUpdate.data);
    if (!newlyPaid) {
      const { data: latest } = await supabase.from('payments')
        .select('access_period_start,access_period_end').eq('id', internalPaymentId).maybeSingle();
      currentPeriodStart = latest?.access_period_start;
      currentPeriodEnd = latest?.access_period_end;
    }
  }
  if (!currentPeriodStart || !currentPeriodEnd) throw new Error('payment_period_missing');

  const existingAgreementEnd = new Date(existingAgreement?.current_period_end || 0).getTime();
  const paymentPeriodEnd = new Date(currentPeriodEnd).getTime();
  if (!newlyPaid && existingAgreement?.last_payment_id !== String(payment.id)
    && Number.isFinite(existingAgreementEnd) && existingAgreementEnd >= paymentPeriodEnd) {
    return { alreadyProcessed: true, currentPeriodEnd: current?.current_period_end || currentPeriodEnd };
  }

  const { error: agreementError } = await supabase.from('billing_agreements').upsert({
    user_id: localPayment.user_id,
    telegram_id: telegramId,
    provider: 'yookassa',
    plan: plan.key,
    status: keepCancelled ? 'cancelled' : 'active',
    amount_minor: plan.amountMinor,
    currency: 'RUB',
    payment_method_ciphertext: ciphertext,
    payment_method_type: String(paymentMethod.type || '').slice(0, 40) || null,
    next_charge_at: currentPeriodEnd,
    current_period_end: currentPeriodEnd,
    cancel_at_period_end: keepCancelled,
    retry_count: 0,
    last_payment_id: String(payment.id),
    last_error: null,
    updated_at: now.toISOString()
  }, { onConflict: 'provider,telegram_id' });
  if (agreementError) throw agreementError;

  const { error: subscriptionError } = await supabase.from('subscriptions').upsert({
    user_id: localPayment.user_id,
    telegram_id: telegramId,
    plan: plan.key,
    status: 'active',
    source: 'yookassa',
    current_period_start: currentPeriodStart,
    current_period_end: currentPeriodEnd,
    cancel_at_period_end: keepCancelled,
    next_billing_at: keepCancelled ? null : currentPeriodEnd,
    last_payment_at: now.toISOString(),
    payment_method_type: String(paymentMethod.type || '').slice(0, 40) || null,
    last_error: null,
    updated_at: now.toISOString()
  }, { onConflict: 'telegram_id' });
  if (subscriptionError) throw subscriptionError;

  if (newlyPaid) {
    await supabase.from('events').insert({
      event_name: 'payment_success',
      user_id: localPayment.user_id,
      telegram_id: telegramId,
      payload: { provider: 'yookassa', plan: plan.key, amount_minor: plan.amountMinor }
    });
  }
  return { alreadyProcessed: !newlyPaid, currentPeriodEnd };
}

export async function applyFailedYookassaPayment({ supabase, payment }: { supabase: any; payment: any }) {
  const internalPaymentId = String(payment?.metadata?.internal_payment_id || '');
  if (!/^[0-9a-f-]{36}$/i.test(internalPaymentId)) return;
  const now = new Date();
  await supabase.from('payments').update({
    status: 'failed', external_payment_id: String(payment.id || '') || null,
    raw_payload: redactPayment(payment), error_code: String(payment?.cancellation_details?.reason || 'payment_cancelled').slice(0, 120),
    updated_at: now.toISOString()
  }).eq('id', internalPaymentId).neq('status', 'paid');
  const agreementId = String(payment?.metadata?.agreement_id || '');
  if (!/^[0-9a-f-]{36}$/i.test(agreementId)) return;
  const { data: agreement } = await supabase.from('billing_agreements').select('retry_count,telegram_id')
    .eq('id', agreementId).maybeSingle();
  if (!agreement) return;
  const retryCount = Number(agreement.retry_count || 0) + 1;
  const retryExhausted = retryCount >= 3;
  const retryDays = retryCount === 1 ? 1 : retryCount === 2 ? 3 : 7;
  await supabase.from('billing_agreements').update({
    status: retryExhausted ? 'cancelled' : 'past_due',
    cancel_at_period_end: retryExhausted,
    retry_count: retryCount,
    next_charge_at: retryExhausted ? now.toISOString() : new Date(now.getTime() + retryDays * 86400_000).toISOString(),
    last_error: String(payment?.cancellation_details?.reason || 'payment_cancelled').slice(0, 120),
    updated_at: now.toISOString()
  }).eq('id', agreementId);
  await supabase.from('subscriptions').update({
    cancel_at_period_end: retryExhausted,
    next_billing_at: retryExhausted ? null : new Date(now.getTime() + retryDays * 86400_000).toISOString(),
    last_error: retryExhausted ? 'renewal_cancelled_after_retries' : 'renewal_failed',
    updated_at: now.toISOString()
  }).eq('telegram_id', agreement.telegram_id);
}

export function redactPayment(payment: any) {
  const copy = JSON.parse(JSON.stringify(payment || {}));
  if (copy.payment_method?.card) {
    copy.payment_method.card = {
      first6: copy.payment_method.card.first6 || null,
      last4: copy.payment_method.card.last4 || null,
      card_type: copy.payment_method.card.card_type || null,
      issuer_country: copy.payment_method.card.issuer_country || null
    };
  }
  delete copy.authorization_details;
  return copy;
}
