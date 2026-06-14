const assert = require('assert');
const {
  calcDayNaps,
  calcNightLen,
  localDateKey,
  mergeManualLog
} = require('../tracker');

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

test('uses local date instead of UTC date for diary key', () => {
  const date = new Date(2026, 5, 15, 1, 30);
  assert.strictEqual(localDateKey(date), '2026-06-15');
});

test('counts naps that cross midnight or hour boundaries correctly', () => {
  assert.strictEqual(calcDayNaps([
    ['09:10', '10:00'],
    ['23:50', '00:20'],
    ['', '13:00']
  ]), 80);
});

test('calculates night length across midnight', () => {
  assert.strictEqual(calcNightLen('20:00', '07:15'), 675);
});

test('manual save preserves quick naps, night wakings and quick tags', () => {
  const existing = {
    date: '2026-06-15',
    quickNaps: [{ start: '10:00', end: '10:30', dur: 30 }],
    dayNaps: 30,
    nightWakings: 1,
    tags: ['cry_wake', 'teeth'],
    note: 'быстрая отметка'
  };

  const merged = mergeManualLog(existing, {
    date: '2026-06-15',
    wake: '07:00',
    bed: '20:00',
    nap1s: '12:00',
    nap1e: '13:00',
    nap2s: '',
    nap2e: '',
    nap3s: '',
    nap3e: '',
    selectedTags: ['long_soothe'],
    mood: '😐',
    note: ''
  });

  assert.strictEqual(merged.dayNaps, 90);
  assert.strictEqual(merged.nightWakings, 1);
  assert.deepStrictEqual(merged.quickNaps, [{ start: '10:00', end: '10:30', dur: 30 }]);
  assert.deepStrictEqual(merged.tags.sort(), ['cry_wake', 'long_soothe', 'teeth'].sort());
  assert.strictEqual(merged.note, 'быстрая отметка');
});
