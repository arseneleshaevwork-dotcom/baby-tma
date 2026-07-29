const assert = require('assert');
const { findAnswer, buildAiDiary, formatAiAnswer } = require('../chat');

global.localStorage = {
  getItem(key) {
    if (key === 'babymode_last_age') return '6';
    if (key === 'babymode_baby_name') return 'Миша';
    return null;
  }
};

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

test('answers common sleep phrasing instead of generic fallback', () => {
  const answer = findAnswer('ребенок плохо спит ночью и часто просыпается');
  assert.match(answer, /Ночные пробуждения|сон/i);
  assert.doesNotMatch(answer, /Не нашла точного ответа/);
});

test('answers schedule setup questions with age context', () => {
  const answer = findAnswer('как наладить режим дня в 6 месяцев');
  assert.match(answer, /режим|окн/i);
  assert.match(answer, /6 мес/);
  assert.doesNotMatch(answer, /Не нашла точного ответа/);
});

test('routes fever and danger symptoms to urgent safety answer', () => {
  const answer = findAnswer('температура 39 и ребенок вялый что делать');
  assert.match(answer, /педиатр|скорая|срочно/i);
  assert.doesNotMatch(answer, /Не нашла точного ответа/);
});

test('gives structured fallback with next questions', () => {
  const answer = findAnswer('что купить домой');
  assert.match(answer, /уточните/i);
  assert.match(answer, /возраст/i);
});

test('AI diary payload contains only approved fields from the last 14 days', () => {
  const now = new Date('2026-07-24T12:00:00');
  const diary = buildAiDiary([
    { date: '2026-07-10', wake: '07:00', bed: '20:00', note: 'private note', babyName: 'Миша' },
    { date: '2026-07-12', wake: '06:40', bed: '19:50', dayNaps: 130, nightLen: 610, nightWakings: 2, note: 'private note' },
    { date: '2026-07-24', wake: '07:10', bed: '20:10', dayNaps: 120, nightLen: 620, nightWakings: 1, tags: ['teeth'] }
  ], now);
  assert.strictEqual(diary.length, 2);
  assert.deepStrictEqual(Object.keys(diary[0]), [
    'date', 'wake', 'bedtime', 'day_sleep_min', 'night_sleep_min', 'night_wakings', 'tags'
  ]);
  assert.ok(!JSON.stringify(diary).includes('private note'));
  assert.ok(!JSON.stringify(diary).includes('Миша'));
});

test('free AI payload omits diary while premium includes it', () => {
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  global.getLogs = () => [{
    date: yesterday,
    wake: '07:00', bed: '20:00', dayNaps: 120, nightLen: 600, nightWakings: 2
  }];
  global.SUB = { can: () => false };
  assert.deepStrictEqual(require('../chat').buildAiPayload('вопрос').diary, []);

  global.SUB = { can: feature => feature === 'aiAnalysis' };
  assert.strictEqual(require('../chat').buildAiPayload('вопрос').diary.length, 1);
  delete global.getLogs;
  delete global.SUB;
});

test('online AI answer escapes content and adds feedback only for a valid request id', () => {
  const html = formatAiAnswer('<script>alert(1)</script>', [{ label: 'Источник', url: 'https://example.com' }], '123e4567-e89b-12d3-a456-426614174000');
  assert.ok(!html.includes('<script>'));
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /chat-feedback/);
  assert.match(html, /noopener noreferrer/);
  assert.ok(!formatAiAnswer('Ответ', [], 'bad-id').includes('chat-feedback'));
});
