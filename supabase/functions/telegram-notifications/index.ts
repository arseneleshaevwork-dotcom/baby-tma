import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-admin-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const milestoneMonths = [1, 3, 6, 9, 18];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const adminToken = Deno.env.get('ADMIN_TOKEN');
  const providedToken = req.headers.get('x-admin-token') || '';
  if (!adminToken || providedToken !== adminToken) return json({ error: 'unauthorized' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
  if (!supabaseUrl || !serviceRoleKey || !botToken) {
    return json({ error: 'server_not_configured' }, 500);
  }

  const body = await req.json().catch(() => ({}));
  const dryRun = Boolean(body?.dry_run);
  const today = dateOnly(body?.date || new Date().toISOString());
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const [settingsResult, babiesResult, deliveriesResult] = await Promise.all([
    supabase
      .from('notification_settings')
      .select('user_id,telegram_id,client_id,chat_id,enabled,birthday_reminders,age_milestones')
      .eq('enabled', true)
      .limit(5000),
    supabase
      .from('babies')
      .select('id,user_id,client_id,name,birthdate')
      .not('birthdate', 'is', null)
      .limit(5000),
    supabase
      .from('notification_deliveries')
      .select('baby_id,reminder_type,event_date')
      .eq('event_date', today)
      .limit(5000)
  ]);

  if (settingsResult.error) return json({ error: 'settings_query_failed', details: settingsResult.error.message }, 500);
  if (babiesResult.error) return json({ error: 'babies_query_failed', details: babiesResult.error.message }, 500);
  if (deliveriesResult.error) return json({ error: 'deliveries_query_failed', details: deliveriesResult.error.message }, 500);

  const settings = settingsResult.data || [];
  const delivered = new Set((deliveriesResult.data || []).map((row: any) => `${row.baby_id}:${row.reminder_type}:${row.event_date}`));
  const jobs = buildReminderJobs({
    babies: babiesResult.data || [],
    settings,
    today,
    delivered
  });

  const sent: any[] = [];
  for (const job of jobs) {
    if (!dryRun) {
      const result = await sendTelegram(botToken, job.chat_id, job.text);
      await supabase.from('notification_deliveries').insert({
        user_id: job.user_id,
        baby_id: job.baby_id,
        telegram_id: job.telegram_id,
        chat_id: job.chat_id,
        reminder_type: job.reminder_type,
        event_date: job.event_date,
        status: result.ok ? 'sent' : 'failed',
        error: result.ok ? null : result.error
      });
      await supabase.from('events').insert({
        event_name: 'notification_sent',
        user_id: job.user_id,
        telegram_id: job.telegram_id,
        payload: {
          reminder_type: job.reminder_type,
          baby_id: job.baby_id,
          event_date: job.event_date,
          ok: result.ok
        }
      });
    }
    sent.push({
      baby_id: job.baby_id,
      name: job.name,
      reminder_type: job.reminder_type,
      event_date: job.event_date,
      chat_id: job.chat_id
    });
  }

  return json({ ok: true, dry_run: dryRun, date: today, planned: jobs.length, sent });
});

function buildReminderJobs({ babies, settings, today, delivered }: {
  babies: any[];
  settings: any[];
  today: string;
  delivered: Set<string>;
}) {
  const byUser = new Map(settings.filter(s => s.user_id).map(s => [s.user_id, s]));
  const byClient = new Map(settings.filter(s => s.client_id).map(s => [s.client_id, s]));
  const jobs: any[] = [];

  for (const baby of babies) {
    const setting = (baby.user_id && byUser.get(baby.user_id)) || (baby.client_id && byClient.get(baby.client_id));
    if (!setting?.chat_id) continue;

    const reminder = reminderForBaby(baby, today, setting);
    if (!reminder) continue;

    const key = `${baby.id}:${reminder.type}:${today}`;
    if (delivered.has(key)) continue;

    jobs.push({
      baby_id: baby.id,
      user_id: baby.user_id || setting.user_id || null,
      client_id: baby.client_id || null,
      telegram_id: setting.telegram_id || null,
      chat_id: setting.chat_id,
      name: baby.name || 'малыша',
      reminder_type: reminder.type,
      event_date: today,
      text: buildMessage(baby.name || 'малыша', reminder)
    });
  }

  return jobs;
}

function reminderForBaby(baby: any, today: string, setting: any) {
  const birth = parseDateOnly(baby.birthdate);
  const date = parseDateOnly(today);
  if (!birth || !date) return null;

  if (setting.birthday_reminders && birth.getUTCMonth() === date.getUTCMonth() && birth.getUTCDate() === date.getUTCDate()) {
    const years = date.getUTCFullYear() - birth.getUTCFullYear();
    if (years > 0) return { type: 'birthday', ageLabel: years === 1 ? '1 год' : `${years} года` };
  }

  const months = fullMonthsBetween(birth, date);
  if (setting.age_milestones && milestoneMonths.includes(months) && birth.getUTCDate() === date.getUTCDate()) {
    return { type: 'age_milestone', ageLabel: formatMonthLabel(months) };
  }

  return null;
}

function buildMessage(name: string, reminder: { type: string; ageLabel: string }) {
  if (reminder.type === 'birthday') {
    return `Сегодня у ${name} день рождения: ${reminder.ageLabel}. Поздравьте малыша и загляните в “Режим малыша” — я подскажу, что меняется в этом возрасте.`;
  }
  return `Сегодня ${name}: ${reminder.ageLabel}. Это хороший момент пересмотреть режим сна, кормления и бодрствования в “Режим малыша”.`;
}

async function sendTelegram(token: string, chatId: number, text: string) {
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text })
  }).catch(error => ({ ok: false, error: String(error) }));

  if (!('json' in response)) return { ok: false, error: response.error };
  const data = await response.json().catch(() => ({}));
  return { ok: Boolean(response.ok && data.ok), error: data.description || null };
}

function fullMonthsBetween(from: Date, to: Date) {
  let months = (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + to.getUTCMonth() - from.getUTCMonth();
  if (to.getUTCDate() < from.getUTCDate()) months -= 1;
  return Math.max(0, months);
}

function formatMonthLabel(months: number) {
  if (months === 1) return '1 месяц';
  if ([2, 3, 4].includes(months)) return `${months} месяца`;
  return `${months} месяцев`;
}

function parseDateOnly(value: string) {
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateOnly(value: string) {
  const date = new Date(value);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())).toISOString().slice(0, 10);
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}
