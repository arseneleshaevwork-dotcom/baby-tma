const assert = require('assert');
const fs = require('fs');
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

test('builds admin totals, activation cohorts and baby table from raw analytics rows', () => {
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
        plan: 'quarter',
        currency: 'XTR',
        total_amount: 769,
        status: 'created',
        created_at: '2026-06-11T10:00:00.000Z'
      }
    ],
    aiRequests: [
      { telegram_id: 1, status: 'completed', model: 'baby-knowledge', mode: 'knowledge', feedback: 'helpful', latency_ms: 1200, input_tokens: 300, output_tokens: 120 },
      { telegram_id: 1, status: 'failed', model: 'gpt-5.6-terra' },
      { telegram_id: 2, status: 'rate_limited', model: 'gpt-5.6-terra' }
    ],
    notificationSettings: [
      { enabled: true, schedule_reminders: true },
      { enabled: true, schedule_reminders: false }
    ],
    notificationDeliveries: [
      { status: 'sent', sent_at: '2026-06-13T10:00:00.000Z' }
    ],
    scheduleReminders: [
      { status: 'pending', scheduled_at: '2026-06-14T01:00:00.000Z' },
      { status: 'failed', scheduled_at: '2026-06-13T09:00:00.000Z', error: 'blocked' }
    ],
    notificationRuns: [
      { trigger: 'cron', failed: 0, completed_at: '2026-06-13T23:55:00.000Z' }
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
  assert.deepStrictEqual(dashboard.funnel.map(step => step.users), [2, 1, 1, 1, 0]);
  assert.strictEqual(dashboard.babies.length, 2);
  assert.strictEqual(dashboard.babies[0].name, 'Миша');
  assert.strictEqual(dashboard.babies[0].age_label, '5 мес.');
  assert.strictEqual(dashboard.upcoming_dates[0].name, 'Миша');
  assert.strictEqual(dashboard.upcoming_dates[0].event_date, '2026-06-20');
  assert.strictEqual(dashboard.sources[0].campaign, 'sleep_june');
  assert.strictEqual(dashboard.sources[0].users, 1);
  assert.strictEqual(dashboard.ai_usage.completed, 1);
  assert.strictEqual(dashboard.ai_usage.failed, 1);
  assert.strictEqual(dashboard.ai_usage.rate_limited, 1);
  assert.strictEqual(dashboard.ai_usage.unique_users, 2);
  assert.strictEqual(dashboard.ai_usage.input_tokens + dashboard.ai_usage.output_tokens, 420);
  assert.strictEqual(dashboard.ai_usage.knowledge_answers, 1);
  assert.strictEqual(dashboard.ai_usage.helpful, 1);
  assert.strictEqual(dashboard.ai_usage.feedback_total, 1);
  assert.strictEqual(dashboard.ai_usage.p95_latency_ms, 1200);
  assert.strictEqual(dashboard.ai_usage.error_rate, 33.3);
  assert.strictEqual(dashboard.billing.active_subscriptions, 1);
  assert.strictEqual(dashboard.billing.paid_stars, 299);
  assert.strictEqual(dashboard.billing.pending_payments, 1);
  assert.strictEqual(dashboard.operations.reminders_enabled, 2);
  assert.strictEqual(dashboard.operations.schedule_enabled, 1);
  assert.strictEqual(dashboard.operations.pending, 1);
  assert.strictEqual(dashboard.operations.failed, 1);
  assert.strictEqual(dashboard.operations.next_due_at, '2026-06-14T01:00:00.000Z');
  assert.strictEqual(dashboard.operations.last_run_trigger, 'cron');
  assert.strictEqual(dashboard.subscriptions[0].plan, 'month');
  assert.strictEqual(dashboard.payments[0].status, 'created');
  assert.strictEqual(dashboard.recent_events.length, 10);
  assert.strictEqual(dashboard.recent_events[0].event_name, 'premium_opened');
});

test('builds partner balances with hold, payouts and refunds', () => {
  const dashboard = buildAdminDashboard({
    events: [],
    babies: [],
    partners: [{ id: 'partner-1', code: 'maria', name: 'Мария', status: 'active' }],
    partnerReferrals: [
      { id: 'ref-1', partner_id: 'partner-1', captured_at: '2026-08-01T00:00:00.000Z' },
      { id: 'ref-2', partner_id: 'partner-1', captured_at: '2026-08-02T00:00:00.000Z' }
    ],
    partnerCommissions: [
      { partner_id: 'partner-1', status: 'pending', amount_minor: 34900, commission_minor: 10470, available_at: '2026-08-15T00:00:00.000Z' },
      { partner_id: 'partner-1', status: 'paid', amount_minor: 89900, commission_minor: 26970, available_at: '2026-08-16T00:00:00.000Z' },
      { partner_id: 'partner-1', status: 'reversed', amount_minor: 34900, commission_minor: 10470, available_at: '2026-08-17T00:00:00.000Z' }
    ],
    partnerPayouts: [{ partner_id: 'partner-1', status: 'paid' }],
    now: '2026-08-21T00:00:00.000Z'
  });

  assert.strictEqual(dashboard.partners.summary.active, 1);
  assert.strictEqual(dashboard.partners.summary.pending, 0);
  assert.strictEqual(dashboard.partners.items[0].referrals, 2);
  assert.strictEqual(dashboard.partners.items[0].conversions, 3);
  assert.strictEqual(dashboard.partners.items[0].available_rubles, 104.7);
  assert.strictEqual(dashboard.partners.items[0].paid_rubles, 269.7);
  assert.strictEqual(dashboard.partners.items[0].reversed_rubles, 104.7);
});

test('admin page compiles and labels mixed billing identities as clients', () => {
  const html = fs.readFileSync('./admin.html', 'utf8');
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.ok(scripts.length > 0);
  assert.doesNotThrow(() => new Function(scripts.at(-1)[1]));
  assert.ok(html.includes('<th>Клиент</th>'));
  assert.ok(html.includes('function formatCustomer(item = {})'));
  assert.ok(html.includes('data-partner-status="rejected"'));
  assert.ok(html.includes('id="partnerRecruitPromo"'));
  assert.ok(html.includes('<script src="promo-copy.js'));
  assert.ok(html.includes("script-src 'self' 'unsafe-inline'"));
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
