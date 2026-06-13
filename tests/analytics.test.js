const assert = require('assert');
const {
  createAnalytics,
  normalizeBabyProfile
} = require('../analytics');

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

function makeStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem(key) { return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null; },
    setItem(key, value) { data[key] = String(value); },
    removeItem(key) { delete data[key]; },
    dump() { return { ...data }; }
  };
}

test('normalizes baby profile for storage and events', () => {
  const profile = normalizeBabyProfile({
    name: '  Миша  ',
    birthdate: '2025-12-01',
    ageMonths: '6'
  });

  assert.deepStrictEqual(profile, {
    name: 'Миша',
    birthdate: '2025-12-01',
    ageMonths: 6
  });
});

test('tracks events with client, telegram and baby context', () => {
  const storage = makeStorage({
    babymode_baby_name: 'Миша',
    babymode_baby_birthdate: '2025-12-01',
    babymode_last_age: '6'
  });
  const analytics = createAnalytics({
    storage,
    now: () => 1700000000000,
    randomId: () => 'fixed-id',
    telegram: { WebApp: { initDataUnsafe: { user: { id: 42, username: 'mom' } } } },
    location: { href: 'https://example.test/app' },
    navigator: { userAgent: 'test-agent', language: 'ru' }
  });

  analytics.track('app_open', { source: 'test' });

  const queue = JSON.parse(storage.getItem('babymode_analytics_queue'));
  assert.strictEqual(queue.length, 1);
  assert.strictEqual(queue[0].event, 'app_open');
  assert.strictEqual(queue[0].client_id, 'fixed-id');
  assert.strictEqual(queue[0].telegram_user.id, 42);
  assert.strictEqual(queue[0].baby.name, 'Миша');
  assert.deepStrictEqual(queue[0].payload, { source: 'test' });
});

test('saves baby profile and tracks profile_saved', () => {
  const storage = makeStorage();
  const analytics = createAnalytics({
    storage,
    now: () => 1700000000000,
    randomId: () => 'fixed-id'
  });

  analytics.saveBabyProfile({ name: 'Аня', birthdate: '2026-01-10', ageMonths: 2 });

  assert.strictEqual(storage.getItem('babymode_baby_name'), 'Аня');
  assert.strictEqual(storage.getItem('babymode_baby_birthdate'), '2026-01-10');
  assert.strictEqual(storage.getItem('babymode_last_age'), '2');

  const queue = JSON.parse(storage.getItem('babymode_analytics_queue'));
  assert.strictEqual(queue[0].event, 'profile_saved');
  assert.strictEqual(queue[0].baby.birthdate, '2026-01-10');
});

test('flushes queued events to configured endpoint', async () => {
  const storage = makeStorage();
  const requests = [];
  const analytics = createAnalytics({
    storage,
    endpoint: 'https://api.example.test/events',
    now: () => 1700000000000,
    randomId: () => 'fixed-id',
    fetch: async (url, options) => {
      requests.push({ url, options });
      return { ok: true };
    }
  });

  analytics.track('app_open');
  await analytics.flush();

  assert.strictEqual(requests.length, 1);
  assert.strictEqual(requests[0].url, 'https://api.example.test/events');
  assert.strictEqual(JSON.parse(requests[0].options.body).events.length, 1);
  assert.strictEqual(storage.getItem('babymode_analytics_queue'), '[]');
});
