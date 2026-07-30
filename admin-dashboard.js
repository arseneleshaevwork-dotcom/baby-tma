const TRACKED_EVENTS = [
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
  'premium_paid',
  'payment_success',
  'notifications_enabled',
  'notifications_disabled',
  'notification_sent'
];

const FUNNEL_EVENTS = [
  { event: 'bot_start', label: '/start в боте' },
  { event: 'app_open', label: 'Открыли mini app' },
  { event: 'profile_saved', label: 'Сохранили малыша' },
  { event: 'schedule_generated', label: 'Получили режим' },
  { event: 'ai_opened', label: 'Открыли ИИ' }
];

const { buildUpcomingBabyDates } = typeof require === 'function'
  ? require('./baby-milestones')
  : { buildUpcomingBabyDates: () => [] };

function buildAdminDashboard({ events = [], babies = [], subscriptions = [], payments = [], aiRequests = [], notificationSettings = [], notificationDeliveries = [], scheduleReminders = [], notificationRuns = [], supportRequests = [], generatedAt, rangeDays = 30, now = new Date() } = {}) {
  const totals = Object.fromEntries(TRACKED_EVENTS.map(event => [event, 0]));
  const usersByEvent = Object.fromEntries(TRACKED_EVENTS.map(event => [event, new Set()]));
  const userEvents = new Map();

  for (const event of events) {
    const eventName = event.event_name || event.event;
    const userKey = identityFor(event);
    if (!eventName) continue;

    if (totals[eventName] === undefined) totals[eventName] = 0;
    totals[eventName] += 1;

    if (!usersByEvent[eventName]) usersByEvent[eventName] = new Set();
    if (userKey) {
      usersByEvent[eventName].add(userKey);
      if (!userEvents.has(userKey)) userEvents.set(userKey, new Set());
      userEvents.get(userKey).add(eventName);
    }
  }

  const uniqueUsers = {};
  for (const [eventName, users] of Object.entries(usersByEvent)) {
    uniqueUsers[eventName] = users.size;
  }

  const funnel = FUNNEL_EVENTS.map(step => ({
    ...step,
    users: uniqueUsers[step.event] || 0,
    events: totals[step.event] || 0
  }));

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
    generated_at: generatedAt || new Date().toISOString(),
    totals,
    unique_users: uniqueUsers,
    funnel,
    opened_and_left: openedAndLeft,
    bot_started_not_opened: botStartedNotOpened,
    sources: buildSources(events),
    billing: buildBilling({ subscriptions, payments, now }),
    ai_usage: buildAiUsage(aiRequests),
    operations: buildOperations({ notificationSettings, notificationDeliveries, scheduleReminders, notificationRuns, now }),
    support_requests: supportRequests.map(formatSupportRequest),
    subscriptions: subscriptions.map(formatSubscription).sort(byPeriodEndDesc).slice(0, 100),
    payments: payments.map(formatPayment).sort(byPaymentCreatedDesc).slice(0, 100),
    babies: babies.map(formatBaby).sort(byProfileCompleteness),
    upcoming_dates: buildUpcomingBabyDates({ babies, now, horizonDays: 45 }),
    recent_events: [...events].sort(byCreatedDesc).slice(0, 100).map(formatEvent)
  };
}

function buildAiUsage(requests = []) {
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

function percentile95(values) {
  if (!values.length) return 0;
  return values[Math.min(values.length - 1, Math.ceil(values.length * 0.95) - 1)];
}

function buildBilling({ subscriptions = [], payments = [], now = new Date() } = {}) {
  const nowMs = new Date(now).getTime();
  const activeSubscriptions = subscriptions.filter(item =>
    item.status === 'active' && item.current_period_end && new Date(item.current_period_end).getTime() > nowMs
  );
  const paidPayments = payments.filter(item => item.status === 'paid');
  const failedPayments = payments.filter(item => ['invoice_failed', 'failed', 'cancelled'].includes(item.status));
  const pendingPayments = payments.filter(item => item.status === 'created');
  const paidStars = paidPayments.reduce((sum, item) => sum + Number(item.total_amount || 0), 0);

  return {
    active_subscriptions: activeSubscriptions.length,
    paid_payments: paidPayments.length,
    paid_stars: paidStars,
    failed_payments: failedPayments.length,
    pending_payments: pendingPayments.length,
    month_subscriptions: activeSubscriptions.filter(item => item.plan === 'month').length,
    half_year_subscriptions: activeSubscriptions.filter(item => item.plan === 'half_year').length,
    legacy_year_subscriptions: activeSubscriptions.filter(item => item.plan === 'year').length
  };
}

function buildOperations({ notificationSettings = [], notificationDeliveries = [], scheduleReminders = [], notificationRuns = [], now = new Date() } = {}) {
  const nowMs = new Date(now).getTime();
  const allDeliveries = [...notificationDeliveries, ...scheduleReminders];
  const sent = allDeliveries.filter(item => item.status === 'sent');
  const failed = allDeliveries.filter(item => item.status === 'failed');
  const pending = scheduleReminders.filter(item => ['pending', 'processing'].includes(item.status));
  const nextDueAt = pending.map(item => item.scheduled_at).filter(value => new Date(value).getTime() > nowMs).sort()[0] || null;
  const lastSentAt = sent.map(item => item.sent_at).filter(Boolean).sort().reverse()[0] || null;
  return {
    reminders_enabled: notificationSettings.filter(item => item.enabled).length,
    schedule_enabled: notificationSettings.filter(item => item.enabled && item.schedule_reminders).length,
    sent: sent.length,
    failed: failed.length,
    pending: pending.length,
    overdue: pending.filter(item => new Date(item.scheduled_at).getTime() <= nowMs).length,
    next_due_at: nextDueAt,
    last_sent_at: lastSentAt,
    last_run_at: notificationRuns[0]?.completed_at || null,
    last_run_trigger: notificationRuns[0]?.trigger || null,
    last_run_failed: Number(notificationRuns[0]?.failed || 0)
  };
}

function buildSources(events) {
  const sources = new Map();
  for (const event of events) {
    const attribution = event.attribution || event.payload?.attribution || {};
    const campaign = attribution.utm_campaign || attribution.start_param || 'unknown';
    const source = attribution.utm_source || attribution.start_param || 'unknown';
    const key = `${source}:${campaign}`;
    if (!sources.has(key)) {
      sources.set(key, { source, campaign, events: 0, users: new Set(), app_opens: 0, profiles: 0, schedules: 0 });
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

function identityFor(row = {}) {
  if (row.user_id) return `user:${row.user_id}`;
  if (row.telegram_id) return `tg:${row.telegram_id}`;
  if (row.client_id) return `client:${row.client_id}`;
  return '';
}

function hasAny(set, values) {
  return values.some(value => set.has(value));
}

function formatBaby(baby = {}) {
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

function formatAge(ageMonths) {
  if (ageMonths === null || ageMonths === undefined || ageMonths === '') return 'Не указан';
  const months = Number(ageMonths);
  if (!Number.isFinite(months)) return 'Не указан';
  if (months < 12) return `${months} мес.`;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return rest ? `${years} г. ${rest} мес.` : `${years} г.`;
}

function formatEvent(event = {}) {
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

function formatSubscription(subscription = {}) {
  return {
    id: subscription.id || '',
    user_id: subscription.user_id || null,
    telegram_id: subscription.telegram_id || null,
    plan: subscription.plan || '',
    status: subscription.status || '',
    source: subscription.source || '',
    current_period_end: subscription.current_period_end || null,
    updated_at: subscription.updated_at || subscription.created_at || null
  };
}

function formatPayment(payment = {}) {
  return {
    id: payment.id || '',
    user_id: payment.user_id || null,
    telegram_id: payment.telegram_id || null,
    plan: payment.plan || '',
    currency: payment.currency || '',
    total_amount: Number(payment.total_amount || 0),
    status: payment.status || '',
    created_at: payment.created_at || null,
    paid_at: payment.paid_at || null
  };
}

function formatSupportRequest(request = {}) {
  return {
    id: request.id || '',
    telegram_id: request.telegram_id || null,
    category: request.category || 'payment',
    message: String(request.message || '').slice(0, 1000),
    status: request.status || 'open',
    created_at: request.created_at || null
  };
}

function byCreatedDesc(a, b) {
  return new Date(b.created_at || 0) - new Date(a.created_at || 0);
}

function byUpdatedDesc(a, b) {
  return new Date(b.updated_at || 0) - new Date(a.updated_at || 0);
}

function byPeriodEndDesc(a, b) {
  return new Date(b.current_period_end || 0) - new Date(a.current_period_end || 0);
}

function byPaymentCreatedDesc(a, b) {
  return new Date(b.created_at || b.paid_at || 0) - new Date(a.created_at || a.paid_at || 0);
}

function byProfileCompleteness(a, b) {
  const aScore = Number(Boolean(a.birthdate)) + Number(a.name !== 'Без имени');
  const bScore = Number(Boolean(b.birthdate)) + Number(b.name !== 'Без имени');
  if (aScore !== bScore) return bScore - aScore;
  return byUpdatedDesc(a, b);
}

if (typeof module !== 'undefined') {
  module.exports = {
    TRACKED_EVENTS,
    FUNNEL_EVENTS,
    buildAdminDashboard,
    formatAge
  };
}
