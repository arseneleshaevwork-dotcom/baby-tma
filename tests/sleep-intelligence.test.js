const assert = require('assert');
const {
  getSleepNorms,
  summarizeSleepLogs,
  getAgeSleepMilestone,
  buildSleepSuggestions,
  buildTomorrowPlan,
  getSleepCalendar,
  buildFamilyReport
} = require('../sleep-intelligence');

global.getProfile = (age) => ({
  nd: age >= 12 ? [90] : [90, 75, 30],
  ns: age >= 12 ? 11 : 10.5,
  ts: age >= 12 ? 13 : 14,
  label: age >= 12 ? '12 месяцев' : '6 месяцев'
});

global.SLEEP_TAGS = [
  { id: 'long_soothe', label: 'Долгое укладывание' },
  { id: 'regression', label: 'Регресс' }
];

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    console.error(error.stack);
    process.exitCode = 1;
  }
}

const logs = [
  { nightLen: 600, dayNaps: 80, tags: ['long_soothe'] },
  { nightLen: 610, dayNaps: 90, tags: ['long_soothe'] },
  { nightLen: 590, dayNaps: 85, tags: [] },
  { nightLen: 585, dayNaps: 95, tags: [] }
];

test('uses existing profile fields for night/day/total norms', () => {
  const norms = getSleepNorms(12);
  assert.deepStrictEqual(norms, {
    dayMin: 90,
    nightMin: 660,
    totalMin: 780,
    label: '12 месяцев'
  });
});

test('summarizes recent logs and calculates sleep debt from total norm', () => {
  const summary = summarizeSleepLogs(logs, 12);
  assert.strictEqual(Math.round(summary.avgNight), 596);
  assert.strictEqual(Math.round(summary.avgDay), 88);
  assert.strictEqual(summary.sleepDebt, 385);
  assert.deepStrictEqual(summary.topTag, ['long_soothe', 2]);
});

test('returns a transition milestone for 12 to 18 months', () => {
  const milestone = getAgeSleepMilestone(14);
  assert.strictEqual(milestone.title, 'Переход на один сон');
});

test('builds actionable suggestions for debt and repeated tags', () => {
  const summary = summarizeSleepLogs(logs, 12);
  const suggestions = buildSleepSuggestions(summary, 12);
  assert(suggestions.some(item => item.title === 'Накопился недосып'));
  assert(suggestions.some(item => item.title === 'Повторяющийся паттерн'));
  assert(suggestions.some(item => item.title === 'Переход на один сон'));
});

test('builds a recovery tomorrow plan from sleep debt', () => {
  const summary = summarizeSleepLogs(logs, 12);
  const plan = buildTomorrowPlan(summary, 12, { wake: '07:00', bedtime: '20:30' });

  assert.strictEqual(plan.type, 'recovery');
  assert.strictEqual(plan.goal, 'Компенсировать недосып');
  assert.deepStrictEqual(plan.apply, {
    wakeShift: 15,
    bedtimeShift: -20,
    buffer: 20,
    situation: 'normal'
  });
  assert(plan.rules.some(rule => rule.includes('тихий день')));
});

test('builds a transition tomorrow plan for 12 to 18 months without debt', () => {
  const stableLogs = [
    { nightLen: 690, dayNaps: 100, tags: [] },
    { nightLen: 680, dayNaps: 95, tags: [] },
    { nightLen: 675, dayNaps: 100, tags: [] }
  ];
  const summary = summarizeSleepLogs(stableLogs, 14);
  const plan = buildTomorrowPlan(summary, 14, { wake: '07:00', bedtime: '19:30' });

  assert.strictEqual(plan.type, 'transition');
  assert.strictEqual(plan.goal, 'Мягко держать один дневной сон');
  assert(plan.rules.some(rule => rule.includes('12:00-13:00')));
});

test('builds age sleep calendar with current and upcoming windows', () => {
  const calendar = getSleepCalendar(8);

  assert(calendar.some(item => item.status === 'now' && item.title === 'Скачок развития 8-10 мес.'));
  assert(calendar.some(item => item.status === 'soon' && item.title === 'Переход 2→1 сон'));
  assert(calendar.every(item => ['now', 'soon', 'later'].includes(item.status)));
});

test('builds family report with averages, sleep debt and tomorrow plan', () => {
  const summary = summarizeSleepLogs(logs, 12);
  const plan = buildTomorrowPlan(summary, 12, { wake: '07:00', bedtime: '20:30' });
  const report = buildFamilyReport(summary, plan, { babyName: 'Миша', audience: 'family' });

  assert(report.includes('Дневник сна Миша'));
  assert(report.includes('Недосып'));
  assert(report.includes('План на завтра'));
  assert(report.includes('Восстановительный день'));
});

test('builds audience-specific family reports', () => {
  const summary = summarizeSleepLogs(logs, 12);
  const plan = buildTomorrowPlan(summary, 12, { wake: '07:00', bedtime: '20:30' });

  const dad = buildFamilyReport(summary, plan, { babyName: 'Миша', audience: 'dad' });
  const grandma = buildFamilyReport(summary, plan, { babyName: 'Миша', audience: 'grandma' });
  const specialist = buildFamilyReport(summary, plan, { babyName: 'Миша', audience: 'specialist' });

  assert(dad.includes('Как помочь сегодня'));
  assert(grandma.includes('Что важно не сбивать'));
  assert(specialist.includes('Данные для консультации'));
});
