import assert from 'node:assert/strict';
import test from 'node:test';
import { sanitizeDiaryEntry, sanitizeSyncProfile, sanitizeSyncSettings, sanitizeTodaySchedule } from '../supabase/functions/sync-data/policy.mjs';

const now = new Date('2026-08-02T12:00:00.000Z');

test('sync profile rejects future birthdays and strips markup', () => {
  assert.deepEqual(sanitizeSyncProfile({ name: '<Миша>', birthdate: '2030-01-01', age_months: 999 }, now), {
    name: 'Миша', birthdate: '', age_months: 60
  });
});

test('sync settings only keeps supported values', () => {
  assert.deepEqual(sanitizeSyncSettings({ wake_time: '07:30', feed_type: 'mixed', secret: 'no', notifications: true }), {
    wake_time: '07:30', feed_type: 'mixed', notifications: true
  });
});

test('synced schedules are structured and strip stored markup', () => {
  assert.deepEqual(sanitizeTodaySchedule({
    date: '2026-08-02',
    created_at: '2026-08-02T10:00:00.000Z',
    age_months: 7,
    blocks: [
      { time: '09:30', tag: 'sleep', title: '<img src=x>Дневной сон', note: '<script>alert(1)</script>' },
      { time: '99:99', tag: 'unknown', title: 'Не попадет' }
    ]
  }), {
    date: '2026-08-02',
    created_at: '2026-08-02T10:00:00.000Z',
    age_months: 7,
    blocks: [{ time: '09:30', tag: 'sleep', title: 'img src=xДневной сон', note: 'scriptalert(1)/script' }]
  });
});

test('diary sync clamps unsafe fields and future timestamps', () => {
  const result = sanitizeDiaryEntry({
    date: '2026-08-01', wake: '07:00', bed: '20:00', dayNaps: 9999,
    note: '<b>спал</b>', tags: ['slept_well', 'unknown'], _updatedAt: '2030-01-01T00:00:00Z'
  }, now);
  assert.equal(result.dayNaps, 1440);
  assert.equal(result.note, 'bспал/b');
  assert.deepEqual(result.tags, ['slept_well']);
  assert.equal(result._updatedAt, now.toISOString());
});
