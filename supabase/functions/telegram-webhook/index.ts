import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildBotReply } from './bot-flow.mjs';

const miniAppUrl = Deno.env.get('MINI_APP_URL') || 'https://arseneleshaevwork-dotcom.github.io/baby-tma/';

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return json({ ok: true });
  }

  const update = await req.json().catch(() => null);
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

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
