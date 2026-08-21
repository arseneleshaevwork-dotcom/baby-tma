import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.112.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://arseneleshaevwork-dotcom.github.io',
  'Vary': 'Origin',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-admin-token',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Cache-Control': 'no-store'
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
  'personal_plan_ready',
  'next_sleep_started',
  'weekly_review_opened',
  'pdf_report_exported',
  'backup_exported',
  'backup_imported',
  'premium_opened',
  'trial_started',
  'subscribe_clicked',
  'premium_paid',
  'payment_success',
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
  const providedToken = req.headers.get('x-admin-token') || '';
  if (!adminToken || adminToken.length < 32 || !safeEqual(providedToken, adminToken)) {
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

  const [
    eventsResult,
    babiesResult,
    subscriptionsResult,
    paymentsResult,
    aiRequestsResult,
    notificationSettingsResult,
    notificationDeliveriesResult,
    scheduleRemindersResult,
    notificationRunsResult,
    supportRequestsResult,
    billingAgreementsResult,
    billingEventsResult,
    partnersResult,
    partnerReferralsResult,
    partnerCommissionsResult,
    partnerPayoutsResult
  ] = await Promise.all([
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
      .limit(1000),
    supabase
      .from('subscriptions')
      .select('id,user_id,telegram_id,plan,status,source,current_period_end,cancel_at_period_end,next_billing_at,last_error,created_at,updated_at')
      .order('updated_at', { ascending: false })
      .limit(1000),
    supabase
      .from('payments')
      .select('id,user_id,telegram_id,plan,currency,total_amount,status,provider,error_code,created_at,paid_at')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(1000),
    supabase
      .from('ai_requests')
      .select('telegram_id,status,model,mode,feedback,latency_ms,input_tokens,output_tokens,created_at')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(5000),
    supabase
      .from('notification_settings')
      .select('enabled,schedule_reminders,updated_at')
      .limit(5000),
    supabase
      .from('notification_deliveries')
      .select('status,sent_at,error')
      .gte('sent_at', since)
      .order('sent_at', { ascending: false })
      .limit(5000),
    supabase
      .from('schedule_reminders')
      .select('status,scheduled_at,sent_at,error,attempts')
      .gte('scheduled_at', since)
      .order('scheduled_at', { ascending: false })
      .limit(5000),
    supabase
      .from('notification_runs')
      .select('trigger,dry_run,planned,sent,failed,completed_at')
      .order('completed_at', { ascending: false })
      .limit(100),
    supabase
      .from('support_requests')
      .select('id,telegram_id,category,message,status,created_at')
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('billing_agreements')
      .select('telegram_id,provider,plan,status,next_charge_at,current_period_end,cancel_at_period_end,retry_count,last_error,updated_at')
      .order('updated_at', { ascending: false })
      .limit(1000),
    supabase
      .from('billing_events')
      .select('provider,event_type,status,error,created_at,processed_at')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(1000),
    supabase.from('partners')
      .select('id,code,name,contact,status,commission_bps,attribution_days,hold_days,created_at,updated_at')
      .order('created_at', { ascending: false })
      .limit(1000),
    supabase.from('partner_referrals')
      .select('id,partner_id,billing_identity_id,source,captured_at,expires_at')
      .order('captured_at', { ascending: false })
      .limit(10000),
    supabase.from('partner_commissions')
      .select('id,partner_id,payment_id,payout_id,amount_minor,commission_bps,commission_minor,status,available_at,paid_at,reversed_at,created_at')
      .order('created_at', { ascending: false })
      .limit(10000),
    supabase.from('partner_payouts')
      .select('id,partner_id,amount_minor,status,commission_count,note,paid_at,created_at')
      .order('created_at', { ascending: false })
      .limit(5000)
  ]);

  if (eventsResult.error) return json({ error: 'events_query_failed', details: eventsResult.error.message }, 500);
  if (babiesResult.error) return json({ error: 'babies_query_failed', details: babiesResult.error.message }, 500);
  if (subscriptionsResult.error) return json({ error: 'subscriptions_query_failed', details: subscriptionsResult.error.message }, 500);
  if (paymentsResult.error) return json({ error: 'payments_query_failed', details: paymentsResult.error.message }, 500);
  if (aiRequestsResult.error) return json({ error: 'ai_requests_query_failed', details: aiRequestsResult.error.message }, 500);
  if (notificationSettingsResult.error) return json({ error: 'notification_settings_query_failed', details: notificationSettingsResult.error.message }, 500);
  if (notificationDeliveriesResult.error) return json({ error: 'notification_deliveries_query_failed', details: notificationDeliveriesResult.error.message }, 500);
  if (scheduleRemindersResult.error) return json({ error: 'schedule_reminders_query_failed', details: scheduleRemindersResult.error.message }, 500);
  if (notificationRunsResult.error) return json({ error: 'notification_runs_query_failed', details: notificationRunsResult.error.message }, 500);
  if (supportRequestsResult.error) return json({ error: 'support_requests_query_failed', details: supportRequestsResult.error.message }, 500);
  if (billingAgreementsResult.error) return json({ error: 'billing_agreements_query_failed', details: billingAgreementsResult.error.message }, 500);
  if (billingEventsResult.error) return json({ error: 'billing_events_query_failed', details: billingEventsResult.error.message }, 500);
  if (partnersResult.error) return json({ error: 'partners_query_failed', details: partnersResult.error.message }, 500);
  if (partnerReferralsResult.error) return json({ error: 'partner_referrals_query_failed', details: partnerReferralsResult.error.message }, 500);
  if (partnerCommissionsResult.error) return json({ error: 'partner_commissions_query_failed', details: partnerCommissionsResult.error.message }, 500);
  if (partnerPayoutsResult.error) return json({ error: 'partner_payouts_query_failed', details: partnerPayoutsResult.error.message }, 500);

  return json(buildDashboard({
    events: eventsResult.data || [],
    babies: babiesResult.data || [],
    subscriptions: subscriptionsResult.data || [],
    payments: paymentsResult.data || [],
    aiRequests: aiRequestsResult.data || [],
    notificationSettings: notificationSettingsResult.data || [],
    notificationDeliveries: notificationDeliveriesResult.data || [],
    scheduleReminders: scheduleRemindersResult.data || [],
    notificationRuns: notificationRunsResult.data || [],
    supportRequests: supportRequestsResult.data || [],
    billingAgreements: billingAgreementsResult.data || [],
    billingEvents: billingEventsResult.data || [],
    partners: partnersResult.data || [],
    partnerReferrals: partnerReferralsResult.data || [],
    partnerCommissions: partnerCommissionsResult.data || [],
    partnerPayouts: partnerPayoutsResult.data || [],
    rangeDays,
    generatedAt: new Date().toISOString()
  }));
});

function buildDashboard({ events, babies, subscriptions = [], payments = [], billingAgreements = [], billingEvents = [], partners = [], partnerReferrals = [], partnerCommissions = [], partnerPayouts = [], aiRequests = [], notificationSettings = [], notificationDeliveries = [], scheduleReminders = [], notificationRuns = [], supportRequests = [], rangeDays, generatedAt }: {
  events: any[];
  babies: any[];
  subscriptions?: any[];
  payments?: any[];
  billingAgreements?: any[];
  billingEvents?: any[];
  partners?: any[];
  partnerReferrals?: any[];
  partnerCommissions?: any[];
  partnerPayouts?: any[];
  aiRequests?: any[];
  notificationSettings?: any[];
  notificationDeliveries?: any[];
  scheduleReminders?: any[];
  notificationRuns?: any[];
  supportRequests?: any[];
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
    billing: buildBilling({ subscriptions, payments, billingAgreements, billingEvents }),
    partners: buildPartners({ partners, referrals: partnerReferrals, commissions: partnerCommissions, payouts: partnerPayouts, now: generatedAt }),
    ai_usage: buildAiUsage(aiRequests),
    operations: buildOperations({ notificationSettings, notificationDeliveries, scheduleReminders, notificationRuns, generatedAt }),
    support_requests: supportRequests.map(formatSupportRequest),
    subscriptions: (subscriptions || []).map(formatSubscription).sort(byPeriodEndDesc).slice(0, 100),
    payments: (payments || []).map(formatPayment).sort(byPaymentCreatedDesc).slice(0, 100),
    babies: babies.map(formatBaby).sort(byProfileCompleteness),
    upcoming_dates: buildUpcomingBabyDates({ babies, now: generatedAt, horizonDays: 45 }),
    recent_events: [...events].sort(byCreatedDesc).slice(0, 100).map(formatEvent)
  };
}

function buildAiUsage(requests: any[] = []) {
  const completed = requests.filter(item => item.status === 'completed');
  const rated = completed.filter(item => item.feedback);
  const latencies = completed.map(item => Number(item.latency_ms)).filter(Number.isFinite).sort((a, b) => a - b);
  const failures = requests.filter(item => item.status === 'failed').length;
  return {
    requests: requests.length,
    completed: completed.length,
    failed: failures,
    rate_limited: requests.filter(item => item.status === 'rate_limited').length,
    unique_users: new Set(requests.map(item => item.telegram_id).filter(Boolean)).size,
    input_tokens: completed.reduce((sum, item) => sum + Number(item.input_tokens || 0), 0),
    output_tokens: completed.reduce((sum, item) => sum + Number(item.output_tokens || 0), 0),
    model: completed.find(item => item.model)?.model || requests.find(item => item.model)?.model || '',
    knowledge_answers: completed.filter(item => item.mode === 'knowledge').length,
    model_answers: completed.filter(item => item.mode === 'model').length,
    feedback_total: rated.length,
    helpful: rated.filter(item => item.feedback === 'helpful').length,
    not_helpful: rated.filter(item => item.feedback === 'not_helpful').length,
    average_latency_ms: latencies.length ? Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length) : 0,
    p95_latency_ms: percentile95(latencies),
    error_rate: requests.length ? Math.round(failures / requests.length * 1000) / 10 : 0
  };
}

function percentile95(values: number[]) {
  if (!values.length) return 0;
  return values[Math.min(values.length - 1, Math.ceil(values.length * 0.95) - 1)];
}

function buildBilling({ subscriptions = [], payments = [], billingAgreements = [], billingEvents = [] }: { subscriptions?: any[]; payments?: any[]; billingAgreements?: any[]; billingEvents?: any[] } = {}) {
  const now = Date.now();
  const activeSubscriptions = subscriptions.filter(item =>
    item.status === 'active' && item.current_period_end && new Date(item.current_period_end).getTime() > now
  );
  const paidPayments = payments.filter(item => item.status === 'paid');
  const failedPayments = payments.filter(item => ['invoice_failed', 'failed', 'cancelled'].includes(item.status));
  const pendingPayments = payments.filter(item => item.status === 'created');
  const paidStars = paidPayments.filter(item => item.currency === 'XTR').reduce((sum, item) => sum + Number(item.total_amount || 0), 0);
  const paidRublesMinor = paidPayments.filter(item => item.currency === 'RUB').reduce((sum, item) => sum + Number(item.total_amount || 0), 0);

  return {
    active_subscriptions: activeSubscriptions.length,
    paid_payments: paidPayments.length,
    paid_stars: paidStars,
    paid_rubles: Math.round(paidRublesMinor) / 100,
    stars_payments: paidPayments.filter(item => item.provider === 'telegram_stars' || item.currency === 'XTR').length,
    yookassa_payments: paidPayments.filter(item => item.provider === 'yookassa').length,
    web_autorenew_active: billingAgreements.filter(item => item.provider === 'yookassa' && item.status === 'active' && !item.cancel_at_period_end).length,
    web_past_due: billingAgreements.filter(item => item.provider === 'yookassa' && item.status === 'past_due').length,
    billing_event_errors: billingEvents.filter(item => item.status === 'failed').length,
    failed_payments: failedPayments.length,
    pending_payments: pendingPayments.length,
    month_subscriptions: activeSubscriptions.filter(item => item.plan === 'month').length,
    quarter_subscriptions: activeSubscriptions.filter(item => item.plan === 'quarter').length,
    legacy_half_year_subscriptions: activeSubscriptions.filter(item => item.plan === 'half_year').length,
    legacy_year_subscriptions: activeSubscriptions.filter(item => item.plan === 'year').length
  };
}

function buildPartners({ partners = [], referrals = [], commissions = [], payouts = [], now }: any = {}) {
  const nowMs = new Date(now || Date.now()).getTime();
  const rows = partners.map((partner: any) => {
    const ownReferrals = referrals.filter((item: any) => item.partner_id === partner.id);
    const ownCommissions = commissions.filter((item: any) => item.partner_id === partner.id);
    const pending = ownCommissions.filter((item: any) => item.status === 'pending');
    const paid = ownCommissions.filter((item: any) => item.status === 'paid');
    const reversed = ownCommissions.filter((item: any) => item.status === 'reversed');
    const available = pending.filter((item: any) => new Date(item.available_at).getTime() <= nowMs);
    const grossMinor = ownCommissions
      .filter((item: any) => item.status !== 'reversed')
      .reduce((sum: number, item: any) => sum + Number(item.amount_minor || 0), 0);
    return {
      ...partner,
      referrals: ownReferrals.length,
      conversions: ownCommissions.length,
      conversion_rate: ownReferrals.length ? Math.round(ownCommissions.length / ownReferrals.length * 1000) / 10 : 0,
      gross_rubles: grossMinor / 100,
      pending_rubles: pending.reduce((sum: number, item: any) => sum + Number(item.commission_minor || 0), 0) / 100,
      available_rubles: available.reduce((sum: number, item: any) => sum + Number(item.commission_minor || 0), 0) / 100,
      paid_rubles: paid.reduce((sum: number, item: any) => sum + Number(item.commission_minor || 0), 0) / 100,
      reversed_rubles: reversed.reduce((sum: number, item: any) => sum + Number(item.commission_minor || 0), 0) / 100,
      payouts: payouts.filter((item: any) => item.partner_id === partner.id && item.status === 'paid').length,
      last_referral_at: ownReferrals[0]?.captured_at || null
    };
  }).sort((a: any, b: any) => Number(b.gross_rubles) - Number(a.gross_rubles));

  return {
    summary: {
      active: partners.filter((item: any) => item.status === 'active').length,
      referrals: referrals.length,
      conversions: commissions.length,
      available_rubles: rows.reduce((sum: number, item: any) => sum + Number(item.available_rubles || 0), 0),
      paid_rubles: rows.reduce((sum: number, item: any) => sum + Number(item.paid_rubles || 0), 0),
      reversed_rubles: rows.reduce((sum: number, item: any) => sum + Number(item.reversed_rubles || 0), 0)
    },
    items: rows
  };
}

function buildOperations({ notificationSettings = [], notificationDeliveries = [], scheduleReminders = [], notificationRuns = [], generatedAt }: any) {
  const now = new Date(generatedAt).getTime();
  const allDeliveries = [...notificationDeliveries, ...scheduleReminders];
  const sent = allDeliveries.filter(item => item.status === 'sent');
  const failed = allDeliveries.filter(item => item.status === 'failed');
  const pending = scheduleReminders.filter(item => ['pending', 'processing'].includes(item.status));
  const nextDue = pending
    .map(item => item.scheduled_at)
    .filter(value => new Date(value).getTime() > now)
    .sort()[0] || null;
  const lastSent = sent
    .map(item => item.sent_at)
    .filter(Boolean)
    .sort()
    .reverse()[0] || null;

  return {
    reminders_enabled: notificationSettings.filter(item => item.enabled).length,
    schedule_enabled: notificationSettings.filter(item => item.enabled && item.schedule_reminders).length,
    sent: sent.length,
    failed: failed.length,
    pending: pending.length,
    overdue: pending.filter(item => new Date(item.scheduled_at).getTime() <= now).length,
    next_due_at: nextDue,
    last_sent_at: lastSent,
    last_run_at: notificationRuns[0]?.completed_at || null,
    last_run_trigger: notificationRuns[0]?.trigger || null,
    last_run_failed: Number(notificationRuns[0]?.failed || 0)
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

function formatSubscription(subscription: any) {
  return {
    id: subscription.id || '',
    user_id: subscription.user_id || null,
    telegram_id: subscription.telegram_id || null,
    plan: subscription.plan || '',
    status: subscription.status || '',
    source: subscription.source || '',
    current_period_end: subscription.current_period_end || null,
    cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
    next_billing_at: subscription.next_billing_at || null,
    last_error: subscription.last_error || null,
    updated_at: subscription.updated_at || subscription.created_at || null
  };
}

function formatPayment(payment: any) {
  return {
    id: payment.id || '',
    user_id: payment.user_id || null,
    telegram_id: payment.telegram_id || null,
    plan: payment.plan || '',
    currency: payment.currency || '',
    total_amount: Number(payment.total_amount || 0),
    status: payment.status || '',
    provider: payment.provider || (payment.currency === 'XTR' ? 'telegram_stars' : ''),
    error_code: payment.error_code || '',
    created_at: payment.created_at || null,
    paid_at: payment.paid_at || null
  };
}

function formatSupportRequest(request: any) {
  return {
    id: request.id || '',
    telegram_id: request.telegram_id || null,
    category: request.category || 'payment',
    message: String(request.message || '').slice(0, 1000),
    status: request.status || 'open',
    created_at: request.created_at || null
  };
}

function byCreatedDesc(a: any, b: any) {
  return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
}

function byUpdatedDesc(a: any, b: any) {
  return new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime();
}

function byPeriodEndDesc(a: any, b: any) {
  return new Date(b.current_period_end || 0).getTime() - new Date(a.current_period_end || 0).getTime();
}

function byPaymentCreatedDesc(a: any, b: any) {
  return new Date(b.created_at || b.paid_at || 0).getTime() - new Date(a.created_at || a.paid_at || 0).getTime();
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

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let value = 0;
  for (let index = 0; index < a.length; index += 1) value |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return value === 0;
}
