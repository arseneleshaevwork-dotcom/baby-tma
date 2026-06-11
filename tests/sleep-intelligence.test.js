const assert = require('assert');
const {
  getSleepNorms,
  summarizeSleepLogs,
  getAgeSleepMilestone,
  buildSleepSuggestions
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
