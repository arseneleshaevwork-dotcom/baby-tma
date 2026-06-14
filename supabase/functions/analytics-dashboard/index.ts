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
  'subscribe_clicked'
];

const funnelEvents = [
  { event: 'bot_start', label: '/start в боте' },
  { event: 'app_open', label: 'Открыли mini app' },
  { event: 'profile_saved', label: 'Сохранили малыша' },
  { event: 'schedule_generated', label: 'Получили режим' },
  { event: 'ai_opened', label: 'Открыли ИИ' }
];

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
      .select('id,event_name,user_id,client_id,telegram_id,payload,created_at')
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
    babies: babies.map(formatBaby).sort(byProfileCompleteness),
    recent_events: [...events].sort(byCreatedDesc).slice(0, 100).map(formatEvent)
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

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}
