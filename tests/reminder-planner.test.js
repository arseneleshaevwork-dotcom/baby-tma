const assert = require('assert');
const { buildReminderPlan, eventAtForTime } = require('../reminder-planner');

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

test('builds prepare and due reminders for upcoming sleep', () => {
  const plan = buildReminderPlan([
    { time: '09:30', tag: 'sleep', title: 'Дневной сон', note: 'Ритуал заранее' }
  ], '2026-06-24T06:00:00.000Z');

  assert.strictEqual(plan.length, 2);
  assert.strictEqual(plan[0].kind, 'prepare');
  assert.match(plan[0].message, /Через 10 минут/);
  assert.strictEqual(plan[1].kind, 'due');
  assert.match(plan[1].message, /09:30/);
});

test('drops past and far future reminders', () => {
  const plan = buildReminderPlan([
    { time: '06:30', tag: 'feed', title: 'Прошлое кормление' },
    { time: '22:30', tag: 'sleep', title: 'Слишком поздно' }
  ], '2026-06-24T07:00:00.000Z');

  assert.deepStrictEqual(plan, []);
});

test('rolls near-midnight events to tomorrow when needed', () => {
  const now = new Date('2026-06-24T23:50:00.000Z');
  const eventAt = eventAtForTime('00:20', now);

  assert.ok(eventAt.getTime() > now.getTime());
});
