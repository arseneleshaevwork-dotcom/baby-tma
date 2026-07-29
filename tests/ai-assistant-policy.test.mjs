import assert from 'node:assert/strict';
import {
  FREE_DAILY_LIMIT,
  PREMIUM_DAILY_LIMIT,
  extractOutputText,
  sanitizeAgeMonths,
  sanitizeDiary,
  sanitizeDiaryForPlan,
  sanitizeQuestion,
  selectSources
} from '../supabase/functions/ai-assistant/policy.mjs';

function test(name, fn) {
  Promise.resolve().then(fn).then(() => console.log(`ok - ${name}`)).catch(error => {
    console.error(`not ok - ${name}`);
    console.error(error.stack);
    process.exitCode = 1;
  });
}

test('sanitizes assistant input and drops private diary fields', () => {
  const result = sanitizeDiary([{
    date: '2026-07-24', wake: '07:00', bed: '20:00', dayNaps: 125, nightLen: 605,
    nightWakings: 2, tags: ['teeth', 'made_up'], note: 'must not leave device', name: 'Миша'
  }], new Date('2026-07-24T12:00:00Z'));
  assert.deepEqual(result, [{
    date: '2026-07-24', wake: '07:00', bedtime: '20:00', day_sleep_min: 125,
    night_sleep_min: 605, night_wakings: 2, tags: ['teeth']
  }]);
  assert.equal(sanitizeAgeMonths(99), 36);
  assert.equal(sanitizeQuestion('  вопрос\u0000  '), 'вопрос');
});

test('extracts Responses API text and chooses curated sources', () => {
  const text = extractOutputText({ output: [{ content: [{ type: 'output_text', text: 'Ответ' }] }] });
  assert.equal(text, 'Ответ');
  assert.match(selectSources('как вводить прикорм')[0].url, /who\.int/);
  assert.match(selectSources('плохо спит')[0].url, /healthychildren\.org/);
});

test('keeps free and premium AI limits explicit', () => {
  assert.equal(FREE_DAILY_LIMIT, 4);
  assert.equal(PREMIUM_DAILY_LIMIT, 40);
});

test('sends diary context only for premium AI analysis', () => {
  const rows = [{ date: '2026-07-24', dayNaps: 120, nightLen: 600 }];
  const now = new Date('2026-07-24T12:00:00Z');
  assert.deepEqual(sanitizeDiaryForPlan(rows, false, now), []);
  assert.equal(sanitizeDiaryForPlan(rows, true, now).length, 1);
});
