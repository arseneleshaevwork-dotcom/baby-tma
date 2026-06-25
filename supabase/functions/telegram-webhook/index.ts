import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildBotReply } from './bot-flow.mjs';

const miniAppUrl = Deno.env.get('MINI_APP_URL') || 'https://arseneleshaevwork-dotcom.github.io/baby-tma/';

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return json({ ok: true });
  }

  const webhookSecret = Deno.env.get('TELEGRAM_WEBHOOK_SECRET');
  if (webhookSecret) {
    const providedSecret = req.headers.get('x-telegram-bot-api-secret-token') || '';
    if (!timingSafeEqual(providedSecret, webhookSecret)) {
      return json({ ok: false, error: 'unauthorized' }, 401);
    }
  }

  const update = await req.json().catch(() => null);
  const preCheckout = update?.pre_checkout_query;
  if (preCheckout?.id) {
    await answerPreCheckout(preCheckout.id, await verifyPreCheckout(preCheckout));
    return json({ ok: true, pre_checkout: true });
  }

  const callback = update?.callback_query;
  const message = update?.message || callback?.message;
  const from = callback?.from || message?.from;
  const chatId = message?.chat?.id;
  const text = String(callback?.data || message?.text || '');

  if (!from?.id || !chatId) {
    return json({ ok: true, skipped: true });
  }

  let botReply: any = null;
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (supabaseUrl && serviceRoleKey) {
    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const { data: user } = await supabase
      .from('users')
      .upsert({
        telegram_id: from.id,
        username: from.username || null,
        first_name: from.first_name || null,
        language_code: from.language_code || null,
        last_seen_at: new Date().toISOString()
      }, { onConflict: 'telegram_id' })
      .select('id')
      .single();

    if (message?.successful_payment && user?.id) {
      botReply = await handleSuccessfulPayment({
        supabase,
        userId: user.id,
        telegramId: from.id,
        payment: message.successful_payment
      });

      await supabase.from('events').insert({
        event_name: 'payment_success',
        user_id: user.id,
        telegram_id: from.id,
        payload: {
          invoice_payload: message.successful_payment.invoice_payload,
          currency: message.successful_payment.currency,
          total_amount: message.successful_payment.total_amount
        },
        language: from.language_code || null
      });

      await sendBotMessage(chatId, botReply);
      return json({ ok: true, payment: true });
    }

    const { data: baby } = user?.id
      ? await supabase
        .from('babies')
        .select('name,birthdate,age_months')
        .eq('user_id', user.id)
        .maybeSingle()
      : { data: null };

    botReply = buildBotReply({
      text,
      firstName: from.first_name || '',
      baby,
      miniAppUrl,
      now: new Date()
    });

    if (botReply?.action === 'save_name' && user?.id) {
      await supabase.from('babies').upsert({
        user_id: user.id,
        name: botReply.profile.name,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' });
    }

    if (botReply?.action === 'save_birthdate' && user?.id) {
      await supabase.from('babies').upsert({
        user_id: user.id,
        name: botReply.profile.name,
        birthdate: botReply.profile.birthdate,
        age_months: botReply.profile.age_months,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' });
    }

    if (botReply?.action === 'reset_profile' && user?.id) {
      await supabase
        .from('babies')
        .delete()
        .eq('user_id', user.id);
    }

    if ((botReply?.action === 'enable_reminders' || botReply?.action === 'disable_reminders') && user?.id) {
      const enabled = botReply.action === 'enable_reminders';
      await supabase.from('notification_settings').upsert({
        user_id: user.id,
        telegram_id: from.id,
        chat_id: chatId,
        enabled,
        timezone: 'Europe/Moscow',
        birthday_reminders: enabled,
        age_milestones: enabled,
        schedule_reminders: false,
        updated_at: new Date().toISOString()
      }, { onConflict: 'telegram_id' });
    } else if (user?.id) {
      const { data: setting } = await supabase
        .from('notification_settings')
        .select('enabled,birthday_reminders,age_milestones,schedule_reminders')
        .eq('telegram_id', from.id)
        .maybeSingle();

      await supabase.from('notification_settings').upsert({
        user_id: user.id,
        telegram_id: from.id,
        chat_id: chatId,
        enabled: Boolean(setting?.enabled),
        timezone: 'Europe/Moscow',
        birthday_reminders: Boolean(setting?.birthday_reminders ?? true),
        age_milestones: Boolean(setting?.age_milestones ?? true),
        schedule_reminders: Boolean(setting?.schedule_reminders ?? false),
        updated_at: new Date().toISOString()
      }, { onConflict: 'telegram_id' });
    }

    await supabase.from('events').insert({
      event_name: text.startsWith('/start') ? 'bot_start' : 'bot_message',
      user_id: user?.id || null,
      telegram_id: from.id,
      baby_name: botReply?.profile?.name || baby?.name || null,
      baby_birthdate: botReply?.profile?.birthdate || baby?.birthdate || null,
      baby_age_months: botReply?.profile?.age_months ?? baby?.age_months ?? null,
      payload: { text, action: botReply?.action || 'none' },
      language: from.language_code || null
    });
  } else {
    botReply = buildBotReply({
      text,
      firstName: from.first_name || '',
      baby: null,
      miniAppUrl,
      now: new Date()
    });
  }

  if (callback?.id) {
    await answerCallback(callback.id);
  }
  await sendBotMessage(chatId, botReply);

  return json({ ok: true });
});

async function sendBotMessage(chatId: number, reply: any) {
  const token = Deno.env.get('TELEGRAM_BOT_TOKEN');
  if (!token || !reply?.text) return;

  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: reply.text,
      reply_markup: reply.reply_markup
    })
  });
}

async function answerCallback(callbackQueryId: string) {
  const token = Deno.env.get('TELEGRAM_BOT_TOKEN');
  if (!token) return;
  await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callbackQueryId })
  });
}

async function answerPreCheckout(preCheckoutQueryId: string, ok: boolean) {
  const token = Deno.env.get('TELEGRAM_BOT_TOKEN');
  if (!token) return;
  await fetch(`https://api.telegram.org/bot${token}/answerPreCheckoutQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      pre_checkout_query_id: preCheckoutQueryId,
      ok,
      error_message: ok ? undefined : 'Платеж не найден. Откройте Premium и попробуйте оформить подписку еще раз.'
    })
  });
}

async function verifyPreCheckout(preCheckout: any) {
  const payload = String(preCheckout?.invoice_payload || '');
  if (!isPremiumPayload(payload)) return false;

  const payloadTelegramId = Number(payload.split(':')[2]);
  if (!payloadTelegramId || Number(preCheckout?.from?.id) !== payloadTelegramId) return false;

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) return false;

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const { data: payment } = await supabase
    .from('payments')
    .select('status,currency,total_amount')
    .eq('invoice_payload', payload)
    .maybeSingle();

  return payment?.status === 'created'
    && payment?.currency === preCheckout.currency
    && Number(payment?.total_amount) === Number(preCheckout.total_amount);
}

async function handleSuccessfulPayment({ supabase, userId, telegramId, payment }: any) {
  const payload = String(payment?.invoice_payload || '');
  const payloadTelegramId = Number(payload.split(':')[2]);
  if (!isPremiumPayload(payload) || payloadTelegramId !== Number(telegramId)) {
    return {
      text: 'Платеж получен, но не удалось связать его с подпиской. Напишите в поддержку, мы проверим оплату.',
      reply_markup: {
        inline_keyboard: [[{
          text: 'Открыть мини-приложение',
          web_app: { url: miniAppUrl }
        }]]
      }
    };
  }

  const plan = parsePlan(payload);
  const now = new Date();
  const days = plan === 'year' ? 365 : 30;
  const currentPeriodEnd = new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();

  await supabase
    .from('payments')
    .update({
      status: 'paid',
      telegram_payment_charge_id: payment.telegram_payment_charge_id || null,
      provider_payment_charge_id: payment.provider_payment_charge_id || null,
      raw_payload: payment,
      paid_at: now.toISOString()
    })
    .eq('invoice_payload', payload);

  await supabase
    .from('subscriptions')
    .upsert({
      user_id: userId,
      telegram_id: telegramId,
      plan,
      status: 'active',
      source: 'telegram_stars',
      current_period_start: now.toISOString(),
      current_period_end: currentPeriodEnd,
      last_invoice_payload: payload,
      last_telegram_payment_charge_id: payment.telegram_payment_charge_id || null,
      updated_at: now.toISOString()
    }, { onConflict: 'telegram_id' });

  return {
    text: `⭐ Premium активирован.\n\nДоступ открыт до ${formatDate(currentPeriodEnd)}. Откройте мини-приложение — расширенные функции уже доступны.`,
    reply_markup: {
      inline_keyboard: [[{
        text: 'Открыть Premium',
        web_app: { url: `${miniAppUrl}?premium=1` }
      }]]
    }
  };
}

function isPremiumPayload(payload: string) {
  return /^premium:(month|year):\d+:[0-9a-f-]+$/i.test(String(payload || ''));
}

function parsePlan(payload: string) {
  const match = String(payload || '').match(/^premium:(month|year):/);
  return match?.[1] === 'year' ? 'year' : 'month';
}

function formatDate(value: string) {
  const date = new Date(value);
  return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i += 1) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
