import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const miniAppUrl = Deno.env.get('MINI_APP_URL') || 'https://arseneleshaevwork-dotcom.github.io/baby-tma/';

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return json({ ok: true });
  }

  const update = await req.json().catch(() => null);
  const message = update?.message;
  const from = message?.from;
  const chatId = message?.chat?.id;
  const text = String(message?.text || '');

  if (!from?.id || !chatId) {
    return json({ ok: true, skipped: true });
  }

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

    await supabase.from('events').insert({
      event_name: text.startsWith('/start') ? 'bot_start' : 'bot_message',
      user_id: user?.id || null,
      telegram_id: from.id,
      payload: { text },
      language: from.language_code || null
    });

    await supabase.from('notification_settings').upsert({
      user_id: user?.id || null,
      telegram_id: from.id,
      chat_id: chatId,
      enabled: false,
      timezone: 'Europe/Moscow',
      updated_at: new Date().toISOString()
    }, { onConflict: 'telegram_id' });
  }

  if (text.startsWith('/start')) {
    await sendWelcome(chatId);
  }

  return json({ ok: true });
});

async function sendWelcome(chatId: number) {
  const token = Deno.env.get('TELEGRAM_BOT_TOKEN');
  if (!token) return;

  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: 'Привет! Я помогу собрать спокойный режим малыша: сон, кормления, дневник, ИИ-подсказки и напоминания по возрасту. Начните с возраста и времени подъёма — план дня появится за минуту.',
      reply_markup: {
        inline_keyboard: [[{
          text: 'Открыть Режим малыша',
          web_app: { url: miniAppUrl }
        }]]
      }
    })
  });
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
