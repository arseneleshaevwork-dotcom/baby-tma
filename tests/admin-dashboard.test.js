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
    row('payment_success', 'u1', 'c1', '2026-06-10T10:06:00.000Z'),
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
    subscriptions: [
      {
        id: 's1',
        user_id: 'u1',
        telegram_id: 1,
        plan: 'month',
        status: 'active',
        source: 'telegram_stars',
        current_period_end: '2026-07-10T10:06:00.000Z',
        updated_at: '2026-06-10T10:06:00.000Z'
      }
    ],
    payments: [
      {
        id: 'p1',
        user_id: 'u1',
        telegram_id: 1,
        plan: 'month',
        currency: 'XTR',
        total_amount: 299,
        status: 'paid',
        created_at: '2026-06-10T10:05:30.000Z',
        paid_at: '2026-06-10T10:06:00.000Z'
      },
      {
        id: 'p2',
        user_id: 'u2',
        telegram_id: 2,
        plan: 'year',
        currency: 'XTR',
        total_amount: 1490,
        status: 'created',
        created_at: '2026-06-11T10:00:00.000Z'
      }
    ],
    aiRequests: [
      { telegram_id: 1, status: 'completed', model: 'gpt-5.6-terra', input_tokens: 300, output_tokens: 120 },
      { telegram_id: 1, status: 'failed', model: 'gpt-5.6-terra' },
      { telegram_id: 2, status: 'rate_limited', model: 'gpt-5.6-terra' }
    ],
    generatedAt: '2026-06-14T00:00:00.000Z',
    rangeDays: 30,
    now: '2026-06-14T00:00:00.000Z'
  });

  assert.strictEqual(dashboard.range_days, 30);
  assert.strictEqual(dashboard.totals.bot_start, 2);
  assert.strictEqual(dashboard.totals.app_open, 2);
  assert.strictEqual(dashboard.totals.ai_question_sent, 1);
  assert.strictEqual(dashboard.totals.payment_success, 1);
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
  assert.strictEqual(dashboard.ai_usage.completed, 1);
  assert.strictEqual(dashboard.ai_usage.failed, 1);
  assert.strictEqual(dashboard.ai_usage.rate_limited, 1);
  assert.strictEqual(dashboard.ai_usage.unique_users, 2);
  assert.strictEqual(dashboard.ai_usage.input_tokens + dashboard.ai_usage.output_tokens, 420);
  assert.strictEqual(dashboard.billing.active_subscriptions, 1);
  assert.strictEqual(dashboard.billing.paid_stars, 299);
  assert.strictEqual(dashboard.billing.pending_payments, 1);
  assert.strictEqual(dashboard.subscriptions[0].plan, 'month');
  assert.strictEqual(dashboard.payments[0].status, 'created');
  assert.strictEqual(dashboard.recent_events.length, 10);
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
