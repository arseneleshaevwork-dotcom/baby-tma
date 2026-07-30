import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://arseneleshaevwork-dotcom.github.io',
  'Vary': 'Origin',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-admin-token, x-cron-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const milestoneMonths = [1, 3, 6, 9, 12, 18, 24, 36];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const adminToken = Deno.env.get('ADMIN_TOKEN');
  const cronToken = Deno.env.get('CRON_TOKEN');
  const providedToken = req.headers.get('x-admin-token') || '';
  const providedCronToken = req.headers.get('x-cron-token') || '';
  const adminAuthorized = Boolean(adminToken && safeEqual(providedToken, adminToken));

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
  if (!supabaseUrl || !serviceRoleKey || !botToken) {
    return json({ error: 'server_not_configured' }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const cronAuthorized = Boolean(
    (cronToken && safeEqual(providedCronToken, cronToken))
    || (providedCronToken && await verifyDatabaseCronToken(supabase, providedCronToken))
  );
  if (!adminAuthorized && !cronAuthorized) return json({ error: 'unauthorized' }, 401);

  const body = await req.json().catch(() => ({}));
  const dryRun = Boolean(body?.dry_run);
  const today = dateOnly(body?.date || new Date().toISOString());

  const scheduled = body?.run_scheduled === false
    ? []
    : await processScheduledReminders({ supabase, botToken, dryRun });

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
      .select('baby_id,reminder_type,event_date,status,claimed_at')
      .eq('event_date', today)
      .limit(5000)
  ]);

  if (settingsResult.error) return json({ error: 'settings_query_failed', details: settingsResult.error.message }, 500);
  if (babiesResult.error) return json({ error: 'babies_query_failed', details: babiesResult.error.message }, 500);
  if (deliveriesResult.error) return json({ error: 'deliveries_query_failed', details: deliveriesResult.error.message }, 500);

  const settings = settingsResult.data || [];
  const claimTimeout = Date.now() - 15 * 60 * 1000;
  const delivered = new Set((deliveriesResult.data || [])
    .filter((row: any) => row.status === 'sent' || (row.status === 'processing' && new Date(row.claimed_at || 0).getTime() >= claimTimeout))
    .map((row: any) => `${row.baby_id}:${row.reminder_type}:${row.event_date}`));
  const jobs = buildReminderJobs({
    babies: babiesResult.data || [],
    settings,
    today,
    delivered
  });

  const sent: any[] = [];
  for (const job of jobs) {
    let outcome = { ok: true, dry_run: dryRun, error: null as string | null };
    if (!dryRun) {
      const { data: deliveryId, error: claimError } = await supabase.rpc('claim_baby_notification', {
        p_user_id: job.user_id,
        p_baby_id: job.baby_id,
        p_telegram_id: job.telegram_id,
        p_chat_id: job.chat_id,
        p_reminder_type: job.reminder_type,
        p_event_date: job.event_date
      });
      if (claimError || !deliveryId) continue;
      const result = await sendTelegram(botToken, job.chat_id, job.text);
      outcome = { ok: result.ok, dry_run: false, error: result.error };
      await supabase.from('notification_deliveries').update({
        status: result.ok ? 'sent' : 'failed',
        error: result.ok ? null : result.error,
        sent_at: new Date().toISOString()
      }).eq('id', deliveryId).eq('status', 'processing');
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
      chat_id: job.chat_id,
      ...outcome
    });
  }

  const milestoneSummary = summarizeResults(sent);
  const scheduledSummary = summarizeResults(scheduled);
  await supabase.from('notification_runs').insert({
    trigger: cronAuthorized ? 'cron' : 'admin',
    dry_run: dryRun,
    planned: milestoneSummary.planned + scheduledSummary.planned,
    sent: milestoneSummary.sent + scheduledSummary.sent,
    failed: milestoneSummary.failed + scheduledSummary.failed,
    completed_at: new Date().toISOString()
  });

  return json({
    ok: true,
    dry_run: dryRun,
    date: today,
    milestones: milestoneSummary,
    scheduled: scheduledSummary
  });
});

async function processScheduledReminders({ supabase, botToken, dryRun }: any) {
  const now = new Date();
  const overdue = new Date(now.getTime() - 6 * 60 * 60000);
  const query = dryRun
    ? supabase.from('schedule_reminders')
      .select('id,user_id,telegram_id,chat_id,reminder_type,title,message,scheduled_at')
      .eq('status', 'pending')
      .lte('scheduled_at', now.toISOString())
      .gte('scheduled_at', overdue.toISOString())
      .order('scheduled_at', { ascending: true })
      .limit(500)
    : supabase.rpc('claim_due_schedule_reminders', { p_limit: 500 });
  const { data: rows, error } = await query;
  if (error) return [{ error: error.message }];

  const results: any[] = [];
  for (const row of rows || []) {
    if (dryRun) {
      results.push({ id: row.id, chat_id: row.chat_id, reminder_type: row.reminder_type, dry_run: true });
      continue;
    }
    const result = await sendTelegram(botToken, row.chat_id, row.message);
    await supabase.from('schedule_reminders').update({
      status: result.ok ? 'sent' : 'failed',
      sent_at: result.ok ? now.toISOString() : null,
      error: result.ok ? null : result.error
    }).eq('id', row.id).eq('status', 'processing');
    await supabase.from('events').insert({
      event_name: 'notification_sent',
      user_id: row.user_id,
      telegram_id: row.telegram_id,
      payload: { reminder_type: `schedule_${row.reminder_type}`, scheduled_at: row.scheduled_at, ok: result.ok }
    });
    results.push({ id: row.id, chat_id: row.chat_id, reminder_type: row.reminder_type, ok: result.ok });
  }

  await supabase.from('schedule_reminders').update({ status: 'expired' })
    .in('status', ['pending', 'processing']).lt('scheduled_at', overdue.toISOString());
  return results;
}

function summarizeResults(items: any[]) {
  return {
    planned: items.length,
    sent: items.filter(item => item.ok === true || item.dry_run === true).length,
    failed: items.filter(item => item.ok === false || item.error).length
  };
}

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
  if (months === 12) return '1 год';
  if (months > 12 && months % 12 === 0) return `${months / 12} года`;
  if (months > 12) return `${Math.floor(months / 12)} г. ${months % 12} мес.`;
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

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let value = 0;
  for (let index = 0; index < a.length; index += 1) value |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return value === 0;
}

async function verifyDatabaseCronToken(supabase: any, token: string) {
  const tokenHash = await sha256(token);
  const { data } = await supabase.from('internal_config')
    .select('value').eq('key', 'notification_cron_token_hash').maybeSingle();
  return Boolean(data?.value && safeEqual(tokenHash, data.value));
}

async function sha256(value: string) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  return [...digest].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}
