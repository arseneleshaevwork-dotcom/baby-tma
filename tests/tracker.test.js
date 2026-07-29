const assert = require('assert');
const {
  buildPdfReportModel,
  calcDayNaps,
  calcNightLen,
  classifySleepEvent,
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
  assert.strictEqual(calcNightLen('20:00', '07:15', 45), 630);
});

test('classifies a long or overnight sleep as night sleep', () => {
  assert.strictEqual(classifySleepEvent(new Date(2026, 5, 15, 20), new Date(2026, 5, 16, 7), 660), 'night');
  assert.strictEqual(classifySleepEvent(new Date(2026, 5, 15, 12), new Date(2026, 5, 15, 13), 60), 'nap');
  assert.strictEqual(classifySleepEvent(new Date(2026, 5, 15, 18, 30), new Date(2026, 5, 15, 19), 30), 'nap');
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
    nightAwakeMin: 30,
    selectedTags: ['long_soothe'],
    mood: '😐',
    note: ''
  });

  assert.strictEqual(merged.dayNaps, 90);
  assert.strictEqual(merged.nightLen, 630);
  assert.strictEqual(merged.nightWakings, 1);
  assert.deepStrictEqual(merged.quickNaps, [{ start: '10:00', end: '10:30', dur: 30 }]);
  assert.deepStrictEqual(merged.tags.sort(), ['cry_wake', 'long_soothe', 'teeth'].sort());
  assert.strictEqual(merged.note, 'быстрая отметка');
});

test('does not count the same quick and manual nap twice', () => {
  const merged = mergeManualLog({
    quickNaps: [{ start: '10:00', end: '10:30', dur: 30 }]
  }, {
    date: '2026-06-15', wake: '07:00', bed: '20:00',
    nap1s: '10:00', nap1e: '10:30', nap2s: '', nap2e: '', nap3s: '', nap3e: '',
    selectedTags: [], mood: '😊', note: '', nightAwakeMin: 0
  });
  assert.strictEqual(merged.dayNaps, 30);
});

test('builds a bounded PDF report model with average sleep values', () => {
  const logs = [
    { date:'2026-06-13', wake:'07:00', bed:'20:00', nightLen:660, dayNaps:120, nightWakings:1 },
    { date:'2026-06-14', wake:'07:10', bed:'20:10', nightLen:630, dayNaps:150, nightWakings:0 },
    { date:'2026-06-15', wake:'06:50', bed:'19:50', nightLen:690, dayNaps:90, nightWakings:2 }
  ];
  const report = buildPdfReportModel(logs, { days:2, babyName:'Миша', age:8, generatedAt:'2026-06-15T12:00:00Z' });
  assert.strictEqual(report.rows.length, 2);
  assert.strictEqual(report.rows[0].date, '2026-06-14');
  assert.strictEqual(report.avgNight, 660);
  assert.strictEqual(report.avgDay, 120);
  assert.strictEqual(report.avgTotal, 780);
});
