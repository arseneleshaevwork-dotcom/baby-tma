import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getBillingPlan, openBillingSecret } from '../_shared/billing.mjs';
import { json, sha256Hex, timingSafeEqual } from '../_shared/http.ts';
import {
  applyFailedYookassaPayment,
  applySucceededYookassaPayment,
  redactPayment,
  yookassaPaymentBody,
  yookassaRequest
} from '../_shared/yookassa.ts';

Deno.serve(async req => {
  const headers = { 'Cache-Control': 'no-store' };
  if (req.method !== 'POST') return json({ ok: false }, 405, headers);
  const provided = req.headers.get('x-cron-token') || '';
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const encryptionSecret = Deno.env.get('BILLING_ENCRYPTION_KEY') || '';
  if (!supabaseUrl || !serviceRoleKey || encryptionSecret.length < 24) return json({ ok: false }, 503, headers);
  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const envCronToken = Deno.env.get('YOOKASSA_CRON_TOKEN') || '';
  const { data: storedCron } = await supabase.from('internal_config').select('value').eq('key', 'yookassa_cron_token_hash').maybeSingle();
  const databaseTokenValid = provided && storedCron?.value && timingSafeEqual(await sha256Hex(provided), String(storedCron.value));
  const envTokenValid = envCronToken && timingSafeEqual(envCronToken, provided);
  if (!databaseTokenValid && !envTokenValid) return json({ ok: false }, 401, headers);
  const now = new Date();
  const result = { reconciled: 0, attempted: 0, succeeded: 0, failed: 0, pending: 0 };

  const staleAt = new Date(now.getTime() - 15 * 60_000).toISOString();
  const { data: processing } = await supabase.from('billing_agreements')
    .select('*').eq('provider', 'yookassa').eq('status', 'processing').lt('updated_at', staleAt).limit(10);
  for (const agreement of processing || []) {
    try {
      const { data: attempt } = agreement.last_internal_payment_id
        ? await supabase.from('payments').select('id,plan,idempotency_key,external_payment_id,status')
          .eq('id', agreement.last_internal_payment_id).maybeSingle()
        : { data: null };
      if (!agreement.last_payment_id && !attempt) {
        await supabase.from('billing_agreements').update({
          status: 'past_due', next_charge_at: new Date(now.getTime() + 86400_000).toISOString(),
          last_error: 'renewal_recovery_missing', updated_at: now.toISOString()
        }).eq('id', agreement.id);
        result.failed += 1;
        continue;
      }
      let payment;
      const externalPaymentId = agreement.last_payment_id || attempt?.external_payment_id;
      if (externalPaymentId) {
        payment = await yookassaRequest(`/payments/${encodeURIComponent(externalPaymentId)}`);
      } else {
        const plan = getBillingPlan(attempt?.plan || agreement.plan);
        if (!plan || !attempt?.idempotency_key) throw new Error('renewal_recovery_invalid');
        const paymentMethodId = await openBillingSecret(agreement.payment_method_ciphertext, encryptionSecret);
        const paymentBody = yookassaPaymentBody({
          plan, paymentId: attempt.id, telegramId: Number(agreement.telegram_id), paymentMethodId
        });
        paymentBody.metadata.agreement_id = agreement.id;
        payment = await yookassaRequest('/payments', {
          method: 'POST', idempotenceKey: attempt.idempotency_key, body: paymentBody
        });
        await supabase.from('payments').update({
          external_payment_id: String(payment.id || '') || null,
          raw_payload: redactPayment(payment), updated_at: new Date().toISOString(), error_code: null
        }).eq('id', attempt.id).neq('status', 'paid');
        await supabase.from('billing_agreements').update({
          last_payment_id: String(payment.id || '') || null, updated_at: new Date().toISOString()
        }).eq('id', agreement.id);
      }
      result.reconciled += 1;
      if (payment.status === 'succeeded') {
        await applySucceededYookassaPayment({ supabase, payment, encryptionSecret });
        result.succeeded += 1;
      } else if (payment.status === 'canceled') {
        await applyFailedYookassaPayment({ supabase, payment });
        result.failed += 1;
      } else {
        await supabase.from('billing_agreements').update({ updated_at: now.toISOString() }).eq('id', agreement.id);
        result.pending += 1;
      }
    } catch (_) {
      await supabase.from('billing_agreements').update({
        last_error: 'renewal_reconciliation_failed', updated_at: now.toISOString()
      }).eq('id', agreement.id).eq('status', 'processing');
      result.failed += 1;
    }
  }

  const { data: due } = await supabase.from('billing_agreements').select('*')
    .eq('provider', 'yookassa').in('status', ['active', 'past_due']).eq('cancel_at_period_end', false)
    .lte('next_charge_at', now.toISOString()).order('next_charge_at', { ascending: true }).limit(10);
  for (const agreement of due || []) {
    const { data: claimed } = await supabase.from('billing_agreements').update({
      status: 'processing', updated_at: now.toISOString()
    }).eq('id', agreement.id).eq('status', agreement.status).select('id').maybeSingle();
    if (!claimed) continue;
    result.attempted += 1;
    const plan = getBillingPlan(agreement.plan);
    const paymentId = crypto.randomUUID();
    const idempotencyKey = crypto.randomUUID();
    try {
      if (!plan) throw new Error('invalid_plan');
      const paymentMethodId = await openBillingSecret(agreement.payment_method_ciphertext, encryptionSecret);
      const { error: paymentInsertError } = await supabase.from('payments').insert({
        id: paymentId, user_id: agreement.user_id, telegram_id: agreement.telegram_id,
        invoice_payload: `yookassa:${paymentId}`, plan: plan.key, currency: 'RUB', total_amount: plan.amountMinor,
        status: 'created', provider: 'yookassa', idempotency_key: idempotencyKey,
        raw_payload: { recurring: true, agreement_id: agreement.id }
      });
      if (paymentInsertError) throw paymentInsertError;
      await supabase.from('billing_agreements').update({
        last_internal_payment_id: paymentId, last_error: null, updated_at: new Date().toISOString()
      }).eq('id', agreement.id);
      const paymentBody = yookassaPaymentBody({
        plan, paymentId, telegramId: Number(agreement.telegram_id), paymentMethodId
      });
      paymentBody.metadata.agreement_id = agreement.id;
      const payment = await yookassaRequest('/payments', {
        method: 'POST', idempotenceKey: idempotencyKey, body: paymentBody
      });
      await supabase.from('payments').update({
        external_payment_id: String(payment.id || '') || null, raw_payload: redactPayment(payment), updated_at: new Date().toISOString()
      }).eq('id', paymentId).neq('status', 'paid');
      await supabase.from('billing_agreements').update({
        last_payment_id: String(payment.id || '') || null, updated_at: new Date().toISOString()
      }).eq('id', agreement.id);
      if (payment.status === 'succeeded') {
        await applySucceededYookassaPayment({ supabase, payment, encryptionSecret });
        result.succeeded += 1;
      } else if (payment.status === 'canceled') {
        await applyFailedYookassaPayment({ supabase, payment });
        result.failed += 1;
      } else {
        result.pending += 1;
      }
    } catch (error) {
      result.failed += 1;
      await supabase.from('payments').update({
        error_code: error instanceof Error ? error.message.slice(0, 120) : 'renewal_failed', updated_at: new Date().toISOString()
      }).eq('id', paymentId);
      await supabase.from('billing_agreements').update({
        status: 'processing', last_internal_payment_id: paymentId,
        last_error: 'renewal_request_uncertain', updated_at: new Date().toISOString()
      }).eq('id', agreement.id);
    }
  }
  return json({ ok: true, ...result }, 200, headers);
});
