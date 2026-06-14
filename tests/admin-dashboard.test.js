const assert = require('assert');
const { buildAdminDashboard } = require('../admin-dashboard');

function test(name, fn) {
  Promise.resolve()
    .then(fn)
    .then(() => console.log(`ok - ${name}`))
    .catch(error => {
      console.error(`not ok - ${name}`);
      console.error(error.stack);
      process.exitCode = 1;
    });
}

test('builds admin totals, funnel and baby table from raw analytics rows', () => {
  const events = [
    row('bot_start', 'u1', 'c1', '2026-06-10T10:00:00.000Z', { source: 'telegram' }, { utm_campaign: 'sleep_june', utm_source: 'telegram' }),
    row('app_open', 'u1', 'c1', '2026-06-10T10:01:00.000Z', {}, { utm_campaign: 'sleep_june', utm_source: 'telegram' }),
    row('profile_saved', 'u1', 'c1', '2026-06-10T10:02:00.000Z'),
    row('schedule_generated', 'u1', 'c1', '2026-06-10T10:03:00.000Z'),
    row('ai_opened', 'u1', 'c1', '2026-06-10T10:04:00.000Z'),
    row('ai_question_sent', 'u1', 'c1', '2026-06-10T10:05:00.000Z', { question: 'плохо спит ночью' }, { utm_campaign: 'sleep_june', utm_source: 'telegram' }),
    row('bot_start', 'u2', 'c2', '2026-06-10T11:00:00.000Z'),
    row('app_open', 'u2', 'c2', '2026-06-10T11:01:00.000Z'),
    row('premium_opened', null, 'c3', '2026-06-10T12:00:00.000Z')
  ];
  const babies = [
    {
      id: 'b1',
      user_id: 'u1',
      client_id: 'c1',
      name: 'Миша',
      birthdate: '2025-12-20',
      age_months: 6,
      updated_at: '2026-06-10T10:02:00.000Z'
    },
    {
      id: 'b2',
      user_id: null,
      client_id: 'c3',
      name: 'Аня',
      birthdate: null,
      age_months: null,
      updated_at: '2026-06-10T12:00:00.000Z'
    }
  ];

  const dashboard = buildAdminDashboard({
    events,
    babies,
    generatedAt: '2026-06-14T00:00:00.000Z',
    rangeDays: 30,
    now: '2026-06-14T00:00:00.000Z'
  });

  assert.strictEqual(dashboard.range_days, 30);
  assert.strictEqual(dashboard.totals.bot_start, 2);
  assert.strictEqual(dashboard.totals.app_open, 2);
  assert.strictEqual(dashboard.totals.ai_question_sent, 1);
  assert.strictEqual(dashboard.unique_users.app_open, 2);
  assert.strictEqual(dashboard.bot_started_not_opened, 0);
  assert.strictEqual(dashboard.opened_and_left, 1);
  assert.deepStrictEqual(dashboard.funnel.map(step => step.users), [2, 2, 1, 1, 1]);
  assert.strictEqual(dashboard.babies.length, 2);
  assert.strictEqual(dashboard.babies[0].name, 'Миша');
  assert.strictEqual(dashboard.babies[0].age_label, '6 мес.');
  assert.strictEqual(dashboard.upcoming_dates[0].name, 'Миша');
  assert.strictEqual(dashboard.upcoming_dates[0].event_date, '2026-06-20');
  assert.strictEqual(dashboard.sources[0].campaign, 'sleep_june');
  assert.strictEqual(dashboard.sources[0].users, 1);
  assert.strictEqual(dashboard.ai_questions[0].question, 'плохо спит ночью');
  assert.strictEqual(dashboard.recent_events.length, 9);
  assert.strictEqual(dashboard.recent_events[0].event_name, 'premium_opened');
});

function row(eventName, userId, clientId, createdAt, payload = {}, attribution = {}) {
  return {
    id: `${eventName}-${createdAt}`,
    event_name: eventName,
    user_id: userId,
    client_id: clientId,
    telegram_id: userId ? Number(userId.slice(1)) : null,
    payload,
    attribution,
    created_at: createdAt
  };
}
