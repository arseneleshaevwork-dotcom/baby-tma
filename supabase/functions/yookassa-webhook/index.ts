import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { json } from '../_shared/http.ts';
import { applyFailedYookassaPayment, applySucceededYookassaPayment, redactPayment, yookassaRequest } from '../_shared/yookassa.ts';

Deno.serve(async req => {
  const headers = { 'Cache-Control': 'no-store' };
  if (req.method !== 'POST') return json({ ok: false }, 405, headers);
  if (Number(req.headers.get('content-length') || 0) > 100_000) return json({ ok: false }, 413, headers);
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const encryptionSecret = Deno.env.get('BILLING_ENCRYPTION_KEY') || '';
  if (!supabaseUrl || !serviceRoleKey || encryptionSecret.length < 24) return json({ ok: false }, 503, headers);
  const rawBody = await req.text();
  if (new TextEncoder().encode(rawBody).byteLength > 100_000) return json({ ok: false }, 413, headers);
  const body = parseBody(rawBody);
  const eventType = String(body?.event || '');
  const incomingId = String(body?.object?.id || '');
  if (!['payment.succeeded', 'payment.canceled', 'refund.succeeded'].includes(eventType) || !/^[0-9a-f-]{20,80}$/i.test(incomingId)) {
    return json({ ok: false }, 400, headers);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  let verifiedPayload: any = null;
  try {
    if (eventType === 'refund.succeeded') {
      const refund = await yookassaRequest(`/refunds/${encodeURIComponent(incomingId)}`);
      const paymentId = String(refund?.payment_id || '');
      if (!paymentId) throw new Error('refund_payment_missing');
      const payment = await yookassaRequest(`/payments/${encodeURIComponent(paymentId)}`);
      verifiedPayload = { refund, payment };
      await processRefund(supabase, refund, payment);
      return json({ ok: true }, 200, headers);
    }

    const payment = await yookassaRequest(`/payments/${encodeURIComponent(incomingId)}`);
    verifiedPayload = payment;
    const actualEvent = payment.status === 'succeeded' ? 'payment.succeeded' : payment.status === 'canceled' ? 'payment.canceled' : '';
    if (actualEvent !== eventType) throw new Error('webhook_status_mismatch');
    const eventKey = `${eventType}:${incomingId}`;
    const billingIdentityId = Number(payment?.metadata?.telegram_id || 0);
    const { data: previous } = await supabase.from('billing_events').select('id,status').eq('provider', 'yookassa').eq('event_key', eventKey).maybeSingle();
    if (previous?.status === 'processed') return json({ ok: true }, 200, headers);
    const eventValues = {
      provider: 'yookassa', event_key: eventKey, event_type: eventType, status: 'processing',
      external_payment_id: incomingId, telegram_id: billingIdentityId > 0 ? billingIdentityId : null,
      payload: redactPayment(payment), error: null
    };
    if (previous) await supabase.from('billing_events').update(eventValues).eq('id', previous.id);
    else await supabase.from('billing_events').insert(eventValues);

    if (eventType === 'payment.succeeded') await applySucceededYookassaPayment({ supabase, payment, encryptionSecret });
    else await applyFailedYookassaPayment({ supabase, payment });
    await supabase.from('billing_events').update({ status: 'processed', processed_at: new Date().toISOString() })
      .eq('provider', 'yookassa').eq('event_key', eventKey);
    return json({ ok: true }, 200, headers);
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 300) : 'unknown';
    if (verifiedPayload) {
      await supabase.from('billing_events').upsert({
        provider: 'yookassa', event_key: `${eventType}:${incomingId}`, event_type: eventType,
        status: 'failed', external_payment_id: incomingId,
        payload: verifiedPayload.payment
          ? { refund: verifiedPayload.refund?.id || null, payment: redactPayment(verifiedPayload.payment) }
          : redactPayment(verifiedPayload),
        error: message
      }, { onConflict: 'provider,event_key' });
    }
    console.error('YooKassa webhook failed', message);
    return json({ ok: false }, 500, headers);
  }
});

async function processRefund(supabase: any, refund: any, payment: any) {
  const eventKey = `refund.succeeded:${refund.id}`;
  const { data: previous } = await supabase.from('billing_events').select('status')
    .eq('provider', 'yookassa').eq('event_key', eventKey).maybeSingle();
  if (previous?.status === 'processed') return;
  const telegramId = Number(payment?.metadata?.telegram_id || 0);
  const refundMinor = Math.round(Number(refund?.amount?.value || 0) * 100);
  const totalRefundMinor = Math.round(Number(payment?.refunded_amount?.value || refund?.amount?.value || 0) * 100);
  const paymentMinor = Math.round(Number(payment?.amount?.value || 0) * 100);
  if (refundMinor <= 0 || paymentMinor <= 0 || String(refund?.amount?.currency) !== String(payment?.amount?.currency)) {
    throw new Error('refund_amount_invalid');
  }
  const isFullRefund = totalRefundMinor >= paymentMinor;
  await supabase.from('billing_events').upsert({
    provider: 'yookassa', event_key: eventKey, event_type: 'refund.succeeded', status: 'processing',
    external_payment_id: String(payment.id || ''), telegram_id: telegramId > 0 ? telegramId : null,
    payload: {
      id: refund.id,
      payment_id: refund.payment_id,
      status: refund.status,
      amount: refund.amount,
      created_at: refund.created_at,
      full_refund: isFullRefund
    },
    processed_at: null,
    error: null
  }, { onConflict: 'provider,event_key' });
  await supabase.from('payments').update({
    status: isFullRefund ? 'refunded' : 'partially_refunded',
    updated_at: new Date().toISOString()
  })
    .eq('provider', 'yookassa').eq('external_payment_id', String(payment.id || ''));
  if (telegramId && isFullRefund) {
    const { data: agreement } = await supabase.from('billing_agreements').select('id,last_payment_id')
      .eq('provider', 'yookassa').eq('telegram_id', telegramId).maybeSingle();
    if (agreement?.last_payment_id === String(payment.id || '')) {
      await supabase.from('billing_agreements').update({ status: 'cancelled', cancel_at_period_end: true, updated_at: new Date().toISOString() })
        .eq('id', agreement.id);
      await supabase.from('subscriptions').update({
        status: 'revoked', cancel_at_period_end: true, current_period_end: new Date().toISOString(), updated_at: new Date().toISOString()
      }).eq('telegram_id', telegramId).eq('source', 'yookassa');
    }
  }
  await supabase.from('billing_events').update({ status: 'processed', processed_at: new Date().toISOString() })
    .eq('provider', 'yookassa').eq('event_key', eventKey);
}

function parseBody(rawBody: string) {
  try { return rawBody ? JSON.parse(rawBody) : null; }
  catch (_) { return null; }
}
