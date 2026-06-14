const assert = require('assert');
const { findAnswer } = require('../chat');

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
