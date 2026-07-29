const assert = require('assert');
const BabyCoach = require('../daily-coach');
const SleepIntel = require('../sleep-intelligence');

function test(name, fn) {
  Promise.resolve().then(fn).then(() => console.log(`ok - ${name}`)).catch(error => {
    console.error(`not ok - ${name}`);
    console.error(error.stack);
    process.exitCode = 1;
  });
}

test('builds three-day learning progress from unique diary dates', () => {
  assert.deepStrictEqual(BabyCoach.getLearningProgress([
    { date: '2026-07-27' }, { date: '2026-07-27' }, { date: '2026-07-28' }
  ]), {
    completed: 2, totalDays: 2, required: 3, remaining: 1, ready: false, percent: 67
  });
});

test('finds the next sleep and preparation countdown', () => {
  const next = BabyCoach.getNextSleep([
    { time: '09:00', tag: 'feed', title: 'Кормление' },
    { time: '10:30', tag: 'sleep', title: 'Дневной сон', note: 'Ориентир 60 мин' },
    { time: '20:00', tag: 'sleep', title: 'Ночной сон' }
  ], new Date('2026-07-29T09:00:00'));
  assert.equal(next.time, '10:30');
  assert.equal(next.minutesUntil, 90);
  assert.equal(next.countdown, '1 ч 30 мин');
  assert.equal(next.preparation, '1 ч 20 мин');
});

test('creates a useful morning and weekly summary', () => {
  const logs = [
    { date: '2026-07-27', nightLen: 600, dayNaps: 160, wake: '07:00', bed: '20:00', tags: [] },
    { date: '2026-07-28', nightLen: 570, dayNaps: 150, wake: '07:10', bed: '19:50', tags: ['long_soothe'] },
    { date: '2026-07-29', nightLen: 560, dayNaps: 140, wake: '06:50', bed: '19:40', nightWakings: 2, tags: [] }
  ];
  const morning = BabyCoach.buildMorningSummary(logs, 6, SleepIntel);
  const weekly = BabyCoach.buildWeeklyReview(logs, 6, SleepIntel);
  assert.match(morning.stats, /ночью/);
  assert.match(morning.reason, /2 ночн/);
  assert.equal(weekly.days, 3);
  assert.ok(weekly.focus);
  assert.ok(weekly.reason);
});

test('selects an age-specific learning path', () => {
  const infant = BabyCoach.getAgeLearningPath(4);
  const toddler = BabyCoach.getAgeLearningPath(15);
  assert.equal(infant.items[0].id, 'sleep-regression');
  assert.equal(toddler.items[0].id, 'nap-transition');
});
