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
  'subscribe_clicked'
];

const FUNNEL_EVENTS = [
  { event: 'bot_start', label: '/start в боте' },
  { event: 'app_open', label: 'Открыли mini app' },
  { event: 'profile_saved', label: 'Сохранили малыша' },
  { event: 'schedule_generated', label: 'Получили режим' },
  { event: 'ai_opened', label: 'Открыли ИИ' }
];

function buildAdminDashboard({ events = [], babies = [], generatedAt, rangeDays = 30 } = {}) {
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
    babies: babies.map(formatBaby).sort(byProfileCompleteness),
    recent_events: [...events].sort(byCreatedDesc).slice(0, 100).map(formatEvent)
  };
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

function byCreatedDesc(a, b) {
  return new Date(b.created_at || 0) - new Date(a.created_at || 0);
}

function byUpdatedDesc(a, b) {
  return new Date(b.updated_at || 0) - new Date(a.updated_at || 0);
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
