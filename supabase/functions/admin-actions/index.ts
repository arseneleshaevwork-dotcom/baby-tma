import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.112.3';
import { readJsonBody } from '../_shared/http.ts';
import { normalizePartnerCode } from '../_shared/partners.mjs';

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://arseneleshaevwork-dotcom.github.io',
  'Vary': 'Origin',
  'Access-Control-Allow-Headers': 'content-type,x-admin-token',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Cache-Control': 'no-store'
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const expected = Deno.env.get('ADMIN_TOKEN') || '';
  if (expected.length < 32 || !safeEqual(req.headers.get('x-admin-token') || '', expected)) return json({ error: 'unauthorized' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
  if (!supabaseUrl || !serviceRoleKey || !botToken) return json({ error: 'server_not_configured' }, 500);
  const parsedBody = await readJsonBody(req, 20_000);
  if (!parsedBody.ok) return json({ error: parsedBody.error }, parsedBody.error === 'payload_too_large' ? 413 : 400);
  const body = parsedBody.value;
  const telegramId = Number(body?.telegram_id);
  const action = String(body?.action || 'lookup');
  const supabase = createClient(supabaseUrl, serviceRoleKey);
  if (action === 'configure_bot_commands') {
    const webhookSecret = Deno.env.get('TELEGRAM_WEBHOOK_SECRET') || '';
    if (webhookSecret.length < 32 || !/^[A-Za-z0-9_-]+$/.test(webhookSecret)) {
      return json({ error: 'telegram_webhook_secret_invalid' }, 500);
    }

    const bot = await telegramCall(botToken, 'getMe');
    if (!bot.ok) return json({ error: bot.error || 'telegram_token_invalid' }, 502);

    const webhookUrl = `${supabaseUrl}/functions/v1/telegram-webhook`;
    const webhook = await telegramCall(botToken, 'setWebhook', {
      url: webhookUrl,
      secret_token: webhookSecret,
      allowed_updates: ['message', 'callback_query', 'pre_checkout_query'],
      drop_pending_updates: false
    });
    if (!webhook.ok) return json({ error: webhook.error || 'telegram_webhook_failed' }, 502);

    const commands = await telegramCall(botToken, 'setMyCommands', {
      commands: [
        { command: 'start', description: 'Открыть Режим малыша' },
        { command: 'profile', description: 'Профиль малыша' },
        { command: 'reminders_on', description: 'Включить напоминания' },
        { command: 'reminders_off', description: 'Отключить напоминания' },
        { command: 'terms', description: 'Условия Premium и оплаты' },
        { command: 'paysupport', description: 'Помощь с оплатой' },
        { command: 'help', description: 'Все возможности бота' }
      ]
    });
    if (!commands.ok) return json({ error: commands.error || 'telegram_commands_failed' }, 502);

    const menu = await telegramCall(botToken, 'setChatMenuButton', {
      menu_button: {
        type: 'web_app',
        text: 'Открыть приложение',
        web_app: { url: Deno.env.get('MINI_APP_URL') || 'https://arseneleshaevwork-dotcom.github.io/baby-tma/' }
      }
    });
    if (!menu.ok) return json({ error: menu.error || 'telegram_menu_failed' }, 502);

    const webhookInfo = await telegramCall(botToken, 'getWebhookInfo');
    if (!webhookInfo.ok || webhookInfo.result?.url !== webhookUrl) {
      return json({ error: webhookInfo.error || 'telegram_webhook_verification_failed' }, 502);
    }

    return json({
      ok: true,
      configured: true,
      bot_username: bot.result?.username || null,
      webhook_url: webhookInfo.result.url,
      pending_update_count: Number(webhookInfo.result.pending_update_count || 0),
      last_error_message: webhookInfo.result.last_error_message || null
    });
  }

  if (action === 'resolve_support') {
    const requestId = String(body?.request_id || '');
    if (!/^[0-9a-f-]{36}$/i.test(requestId)) return json({ error: 'invalid_request_id' }, 400);
    const { data, error } = await supabase.from('support_requests').update({
      status: 'resolved', resolved_at: new Date().toISOString()
    }).eq('id', requestId).eq('status', 'open').select('id').maybeSingle();
    if (error) return json({ error: 'support_update_failed' }, 500);
    if (!data) return json({ error: 'support_request_not_found' }, 404);
    return json({ ok: true, resolved: true });
  }

  if (action === 'create_partner') {
    const code = normalizePartnerCode(body?.code);
    const name = String(body?.name || '').trim().slice(0, 120);
    const contact = String(body?.contact || '').trim().slice(0, 160) || null;
    const commissionBps = Math.max(0, Math.min(5000, Math.round(Number(body?.commission_bps) || 3000)));
    if (!code || name.length < 2) return json({ error: 'invalid_partner' }, 400);
    const { data, error } = await supabase.from('partners').insert({
      code, name, contact, commission_bps: commissionBps, attribution_days: 30, hold_days: 14
    }).select('id,code,name,contact,status,commission_bps,attribution_days,hold_days').maybeSingle();
    if (error?.code === '23505') return json({ error: 'partner_code_exists' }, 409);
    if (error || !data) return json({ error: 'partner_create_failed' }, 500);
    return json({ ok: true, partner: data });
  }

  if (action === 'update_partner') {
    const partnerId = String(body?.partner_id || '');
    const status = String(body?.status || '');
    if (!/^[0-9a-f-]{36}$/i.test(partnerId) || !['active', 'paused'].includes(status)) {
      return json({ error: 'invalid_partner_update' }, 400);
    }
    const { data, error } = await supabase.from('partners').update({
      status, updated_at: new Date().toISOString()
    }).eq('id', partnerId).select('id,code,name,status').maybeSingle();
    if (error) return json({ error: 'partner_update_failed' }, 500);
    if (!data) return json({ error: 'partner_not_found' }, 404);
    return json({ ok: true, partner: data });
  }

  if (action === 'record_partner_payout') {
    const partnerId = String(body?.partner_id || '');
    const note = String(body?.note || '').trim().slice(0, 500);
    if (!/^[0-9a-f-]{36}$/i.test(partnerId)) return json({ error: 'invalid_partner_id' }, 400);
    const { data, error } = await supabase.rpc('record_partner_payout_internal', {
      p_partner_id: partnerId,
      p_note: note || null
    });
    if (error?.message?.includes('no_available_commissions')) return json({ error: 'partner_payout_minimum_not_reached' }, 409);
    if (error) return json({ error: 'partner_payout_failed' }, 500);
    const payout = Array.isArray(data) ? data[0] : data;
    return json({ ok: true, payout });
  }

  if (!Number.isSafeInteger(telegramId) || telegramId <= 0) return json({ error: 'invalid_telegram_id' }, 400);
  const { data: user } = await supabase.from('users').select('id,telegram_id,username,first_name,last_seen_at').eq('telegram_id', telegramId).maybeSingle();
  if (!user && action !== 'send_message') return json({ error: 'user_not_found' }, 404);

  if (action === 'grant_premium') {
    const days = Math.max(1, Math.min(730, Number(body?.days) || 30));
    const { data: current } = await supabase.from('subscriptions').select('current_period_end').eq('telegram_id', telegramId).maybeSingle();
    const currentEnd = new Date(current?.current_period_end || 0).getTime();
    const startMs = Math.max(Date.now(), Number.isFinite(currentEnd) ? currentEnd : 0);
    const end = new Date(startMs + days * 86400000).toISOString();
    await supabase.from('subscriptions').upsert({
      user_id: user.id, telegram_id: telegramId, plan: days >= 90 ? 'quarter' : 'month', status: 'active', source: 'admin',
      current_period_start: new Date().toISOString(), current_period_end: end, updated_at: new Date().toISOString()
    }, { onConflict: 'telegram_id' });
  } else if (action === 'revoke_premium') {
    await supabase.from('subscriptions').update({ status: 'revoked', current_period_end: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('telegram_id', telegramId);
    await supabase.from('billing_agreements').update({
      status: 'cancelled', cancel_at_period_end: true, updated_at: new Date().toISOString()
    }).eq('telegram_id', telegramId).eq('provider', 'yookassa');
  } else if (action === 'cancel_billing') {
    await supabase.from('billing_agreements').update({
      status: 'cancelled', cancel_at_period_end: true, updated_at: new Date().toISOString()
    }).eq('telegram_id', telegramId).eq('provider', 'yookassa');
    await supabase.from('subscriptions').update({
      cancel_at_period_end: true, next_billing_at: null, updated_at: new Date().toISOString()
    }).eq('telegram_id', telegramId).eq('source', 'yookassa');
  } else if (action === 'resume_billing') {
    const { data: agreement } = await supabase.from('billing_agreements')
      .select('current_period_end,payment_method_type').eq('telegram_id', telegramId).eq('provider', 'yookassa').maybeSingle();
    if (!agreement || new Date(agreement.current_period_end).getTime() <= Date.now()) return json({ error: 'billing_period_expired' }, 409);
    if (agreement.payment_method_type === 'one_time') return json({ error: 'recurring_not_available' }, 409);
    await supabase.from('billing_agreements').update({
      status: 'active', cancel_at_period_end: false, next_charge_at: agreement.current_period_end,
      retry_count: 0, last_error: null, updated_at: new Date().toISOString()
    }).eq('telegram_id', telegramId).eq('provider', 'yookassa');
    await supabase.from('subscriptions').update({
      cancel_at_period_end: false, next_billing_at: agreement.current_period_end, last_error: null, updated_at: new Date().toISOString()
    }).eq('telegram_id', telegramId).eq('source', 'yookassa');
  } else if (action === 'enable_reminders') {
    await supabase.from('notification_settings').upsert({
      user_id: user.id, telegram_id: telegramId, chat_id: telegramId, enabled: true,
      birthday_reminders: true, age_milestones: true, schedule_reminders: true, updated_at: new Date().toISOString()
    }, { onConflict: 'telegram_id' });
  } else if (action === 'disable_reminders') {
    await supabase.from('notification_settings').update({
      enabled: false, schedule_reminders: false, updated_at: new Date().toISOString()
    }).eq('telegram_id', telegramId);
    await supabase.from('schedule_reminders').update({ status: 'cancelled' })
      .eq('telegram_id', telegramId).in('status', ['pending', 'processing']);
  } else if (action === 'send_message' || action === 'send_test_reminder') {
    const defaultTestMessage = '🔔 Проверка напоминаний: всё работает. Следующие события режима придут сюда автоматически.';
    const message = String(action === 'send_test_reminder' ? defaultTestMessage : body?.message || '').trim().slice(0, 2000);
    if (!message) return json({ error: 'message_required' }, 400);
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: telegramId, text: message })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) return json({ error: result.description || 'telegram_send_failed' }, 502);
    return json({ ok: true, sent: true, kind: action });
  } else if (action !== 'lookup') {
    return json({ error: 'unknown_action' }, 400);
  }

  const [{ data: baby }, { data: subscription }, { data: billing }, { data: notifications }, { data: lastDelivery }, { data: nextReminder }] = await Promise.all([
    supabase.from('babies').select('name,birthdate,age_months,updated_at').eq('user_id', user.id).maybeSingle(),
    supabase.from('subscriptions').select('plan,status,source,current_period_end,cancel_at_period_end,next_billing_at,last_error').eq('telegram_id', telegramId).maybeSingle(),
    supabase.from('billing_agreements').select('provider,plan,status,current_period_end,next_charge_at,cancel_at_period_end,retry_count,last_error').eq('telegram_id', telegramId).eq('provider', 'yookassa').maybeSingle(),
    supabase.from('notification_settings').select('enabled,birthday_reminders,age_milestones,schedule_reminders').eq('telegram_id', telegramId).maybeSingle(),
    supabase.from('notification_deliveries').select('status,reminder_type,sent_at,error').eq('telegram_id', telegramId).order('sent_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('schedule_reminders').select('status,reminder_type,scheduled_at,error').eq('telegram_id', telegramId).in('status', ['pending', 'processing']).order('scheduled_at', { ascending: true }).limit(1).maybeSingle()
  ]);
  return json({ ok: true, user, baby, subscription, billing, notifications, last_delivery: lastDelivery, next_reminder: nextReminder });
});

function safeEqual(a: string, b: string) { if (a.length !== b.length) return false; let value = 0; for (let i = 0; i < a.length; i++) value |= a.charCodeAt(i) ^ b.charCodeAt(i); return value === 0; }
async function telegramCall(token: string, method: string, body?: unknown) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {})
  });
  const result = await response.json().catch(() => ({}));
  return response.ok && result.ok
    ? { ok: true, result: result.result }
    : { ok: false, error: result.description || `telegram_${method}_failed` };
}
function json(data: unknown, status = 200) { return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); }
