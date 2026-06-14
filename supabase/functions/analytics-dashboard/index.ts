import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-admin-token',
  'Access-Control-Allow-Methods': 'GET, OPTIONS'
};

const trackedEvents = [
  'bot_start',
  'app_open',
  'onboarding_start',
  'onboarding_complete',
  'profile_saved',
  'schedule_generated',
  'ai_opened',
  'ai_question_sent',
  'sleep_started',
  'sleep_finished',
  'diary_saved',
  'premium_opened',
  'trial_started',
  'subscribe_clicked',
  'notifications_enabled',
  'notifications_disabled',
  'notification_sent'
];

const funnelEvents = [
  { event: 'bot_start', label: '/start в боте' },
  { event: 'app_open', label: 'Открыли mini app' },
  { event: 'profile_saved', label: 'Сохранили малыша' },
  { event: 'schedule_generated', label: 'Получили режим' },
  { event: 'ai_opened', label: 'Открыли ИИ' }
];

const milestoneMonths = [1, 3, 6, 9, 12, 18, 24, 36];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'GET') return json({ error: 'method_not_allowed' }, 405);

  const adminToken = Deno.env.get('ADMIN_TOKEN');
  const providedToken = req.headers.get('x-admin-token') || new URL(req.url).searchParams.get('token') || '';
  if (!adminToken || providedToken !== adminToken) {
    return json({ error: 'unauthorized' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: 'server_not_configured' }, 500);
  }

  const url = new URL(req.url);
  const rangeDays = clampNumber(Number(url.searchParams.get('days') || 30), 1, 365);
  const since = new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000).toISOString();
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const [eventsResult, babiesResult] = await Promise.all([
    supabase
      .from('events')
      .select('id,event_name,user_id,client_id,telegram_id,attribution,payload,created_at')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(5000),
    supabase
      .from('babies')
      .select('id,user_id,client_id,name,birthdate,age_months,updated_at')
      .order('updated_at', { ascending: false })
      .limit(1000)
  ]);

  if (eventsResult.error) return json({ error: 'events_query_failed', details: eventsResult.error.message }, 500);
  if (babiesResult.error) return json({ error: 'babies_query_failed', details: babiesResult.error.message }, 500);

  return json(buildDashboard({
    events: eventsResult.data || [],
    babies: babiesResult.data || [],
    rangeDays,
    generatedAt: new Date().toISOString()
  }));
});

function buildDashboard({ events, babies, rangeDays, generatedAt }: {
  events: any[];
  babies: any[];
  rangeDays: number;
  generatedAt: string;
}) {
  const totals = Object.fromEntries(trackedEvents.map(event => [event, 0]));
  const usersByEvent = Object.fromEntries(trackedEvents.map(event => [event, new Set<string>()]));
  const userEvents = new Map<string, Set<string>>();

  for (const event of events) {
    const eventName = event.event_name || event.event;
    const userKey = identityFor(event);
    if (!eventName) continue;

    if (totals[eventName] === undefined) totals[eventName] = 0;
    totals[eventName] += 1;

    if (!usersByEvent[eventName]) usersByEvent[eventName] = new Set<string>();
    if (userKey) {
      usersByEvent[eventName].add(userKey);
      if (!userEvents.has(userKey)) userEvents.set(userKey, new Set<string>());
      userEvents.get(userKey)?.add(eventName);
    }
  }

  const uniqueUsers: Record<string, number> = {};
  for (const [eventName, users] of Object.entries(usersByEvent)) {
    uniqueUsers[eventName] = users.size;
  }

  let openedAndLeft = 0;
  let botStartedNotOpened = 0;
  for (const eventNames of userEvents.values()) {
    if (eventNames.has('app_open') && !hasAny(eventNames, ['profile_saved', 'schedule_generated', 'ai_opened', 'sleep_started', 'diary_saved'])) {
      openedAndLeft += 1;
    }
    if (eventNames.has('bot_start') && !eventNames.has('app_open')) {
      botStartedNotOpened += 1;
    }
  }

  return {
    range_days: rangeDays,
    generated_at: generatedAt,
    totals,
    unique_users: uniqueUsers,
    funnel: funnelEvents.map(step => ({
      ...step,
      users: uniqueUsers[step.event] || 0,
      events: totals[step.event] || 0
    })),
    opened_and_left: openedAndLeft,
    bot_started_not_opened: botStartedNotOpened,
    sources: buildSources(events),
    ai_questions: buildAiQuestions(events),
    babies: babies.map(formatBaby).sort(byProfileCompleteness),
    upcoming_dates: buildUpcomingBabyDates({ babies, now: generatedAt, horizonDays: 45 }),
    recent_events: [...events].sort(byCreatedDesc).slice(0, 100).map(formatEvent)
  };
}

function buildSources(events: any[]) {
  const sources = new Map<string, any>();
  for (const event of events) {
    const attribution = event.attribution || event.payload?.attribution || {};
    const campaign = attribution.utm_campaign || attribution.start_param || 'unknown';
    const source = attribution.utm_source || attribution.start_param || 'unknown';
    const key = `${source}:${campaign}`;
    if (!sources.has(key)) {
      sources.set(key, { source, campaign, events: 0, users: new Set<string>(), app_opens: 0, profiles: 0, schedules: 0 });
    }
    const row = sources.get(key);
    row.events += 1;
    if (event.event_name === 'app_open') row.app_opens += 1;
    if (event.event_name === 'profile_saved') row.profiles += 1;
    if (event.event_name === 'schedule_generated') row.schedules += 1;
    const userKey = identityFor(event);
    if (userKey) row.users.add(userKey);
  }
  return [...sources.values()]
    .map(row => ({ ...row, users: row.users.size }))
    .sort((a, b) => Number(a.campaign === 'unknown') - Number(b.campaign === 'unknown') || b.users - a.users || b.events - a.events)
    .slice(0, 20);
}

function buildAiQuestions(events: any[]) {
  return [...events]
    .filter(event => event.event_name === 'ai_question_sent' && event.payload && event.payload.question)
    .sort(byCreatedDesc)
    .slice(0, 50)
    .map(event => ({
      question: String(event.payload.question || '').slice(0, 300),
      created_at: event.created_at || null,
      client_id: event.client_id || null,
      telegram_id: event.telegram_id || null
    }));
}

function buildUpcomingBabyDates({ babies, now, horizonDays }: { babies: any[]; now: string; horizonDays: number }) {
  const nowDate = toUtcDateOnly(now);
  const maxDate = addDays(nowDate, horizonDays);
  const items: any[] = [];

  for (const baby of babies) {
    if (!baby.birthdate) continue;
    const birth = parseDateOnly(baby.birthdate);
    if (!birth) continue;

    const birthday = nextBirthday(birth, nowDate);
    if (birthday >= nowDate && birthday <= maxDate) {
      const years = birthday.getUTCFullYear() - birth.getUTCFullYear();
      items.push(formatMilestone(baby, 'birthday', birthday, nowDate, years * 12));
    }

    for (const month of milestoneMonths) {
      if (month % 12 === 0) continue;
      const date = addMonths(birth, month);
      if (date >= nowDate && date <= maxDate) {
        items.push(formatMilestone(baby, 'month', date, nowDate, month));
      }
    }
  }

  return items
    .sort((a, b) => a.days_until - b.days_until || a.name.localeCompare(b.name, 'ru'))
    .slice(0, 50);
}

function formatMilestone(baby: any, type: string, eventDate: Date, nowDate: Date, ageMonths: number) {
  return {
    baby_id: baby.id || '',
    user_id: baby.user_id || null,
    client_id: baby.client_id || null,
    name: baby.name || 'Без имени',
    birthdate: baby.birthdate || null,
    type,
    event_date: formatDateOnly(eventDate),
    days_until: diffDays(nowDate, eventDate),
    age_months: ageMonths,
    age_label: formatAgeLabel(ageMonths)
  };
}

function identityFor(row: any) {
  if (row.user_id) return `user:${row.user_id}`;
  if (row.telegram_id) return `tg:${row.telegram_id}`;
  if (row.client_id) return `client:${row.client_id}`;
  return '';
}

function hasAny(set: Set<string>, values: string[]) {
  return values.some(value => set.has(value));
}

function formatBaby(baby: any) {
  return {
    id: baby.id || '',
    user_id: baby.user_id || null,
    client_id: baby.client_id || null,
    name: baby.name || 'Без имени',
    birthdate: baby.birthdate || null,
    age_months: baby.age_months ?? null,
    age_label: formatAge(baby.age_months),
    updated_at: baby.updated_at || null
  };
}

function formatAge(ageMonths: number | null | undefined) {
  if (ageMonths === null || ageMonths === undefined) return 'Не указан';
  const months = Number(ageMonths);
  if (!Number.isFinite(months)) return 'Не указан';
  if (months < 12) return `${months} мес.`;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return rest ? `${years} г. ${rest} мес.` : `${years} г.`;
}

function formatAgeLabel(ageMonths: number | null | undefined) {
  if (ageMonths === null || ageMonths === undefined) return 'Возраст не указан';
  if (ageMonths === 12) return '1 год';
  if (ageMonths > 12 && ageMonths % 12 === 0) return `${ageMonths / 12} года`;
  if (ageMonths > 12) {
    const years = Math.floor(ageMonths / 12);
    const months = ageMonths % 12;
    return `${years} г. ${months} мес.`;
  }
  if (ageMonths === 1) return '1 месяц';
  if ([2, 3, 4].includes(ageMonths)) return `${ageMonths} месяца`;
  return `${ageMonths} месяцев`;
}

function formatEvent(event: any) {
  return {
    id: event.id || '',
    event_name: event.event_name || event.event || '',
    user_id: event.user_id || null,
    client_id: event.client_id || null,
    telegram_id: event.telegram_id || null,
    payload: event.payload || {},
    created_at: event.created_at || null
  };
}

function byCreatedDesc(a: any, b: any) {
  return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
}

function byUpdatedDesc(a: any, b: any) {
  return new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime();
}

function byProfileCompleteness(a: any, b: any) {
  const aScore = Number(Boolean(a.birthdate)) + Number(a.name !== 'Без имени');
  const bScore = Number(Boolean(b.birthdate)) + Number(b.name !== 'Без имени');
  if (aScore !== bScore) return bScore - aScore;
  return byUpdatedDesc(a, b);
}

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function parseDateOnly(value: string) {
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return Number.isNaN(date.getTime()) ? null : date;
}

function toUtcDateOnly(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function nextBirthday(birth: Date, nowDate: Date) {
  let date = new Date(Date.UTC(nowDate.getUTCFullYear(), birth.getUTCMonth(), birth.getUTCDate()));
  if (date < nowDate) {
    date = new Date(Date.UTC(nowDate.getUTCFullYear() + 1, birth.getUTCMonth(), birth.getUTCDate()));
  }
  return date;
}

function addMonths(date: Date, months: number) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, date.getUTCDate()));
}

function addDays(date: Date, days: number) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days));
}

function diffDays(from: Date, to: Date) {
  return Math.round((to.getTime() - from.getTime()) / 86400000);
}

function formatDateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}
