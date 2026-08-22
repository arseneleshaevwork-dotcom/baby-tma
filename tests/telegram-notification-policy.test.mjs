import assert from 'node:assert/strict';
import {
  addMonthsClamped,
  isComfortableDeliveryTime,
  localDateTime,
  reminderForBaby
} from '../supabase/functions/telegram-notifications/policy.mjs';

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test('uses the parent timezone for a comfortable morning delivery', () => {
  const local = localDateTime(new Date('2026-08-22T06:15:00.000Z'), 'Europe/Moscow');
  assert.deepEqual(local, { date: '2026-08-22', hour: 9, minute: 15, timeZone: 'Europe/Moscow' });
  assert.equal(isComfortableDeliveryTime(local.hour), true);
  assert.equal(isComfortableDeliveryTime(3), false);
  assert.equal(isComfortableDeliveryTime(20), false);
});

test('clamps month milestones for babies born on the 31st', () => {
  assert.equal(addMonthsClamped(new Date('2026-01-31T00:00:00.000Z'), 1).toISOString().slice(0, 10), '2026-02-28');
  assert.deepEqual(
    reminderForBaby({ birthdate: '2026-01-31' }, '2026-02-28', { age_milestones: true }),
    { type: 'age_milestone', ageLabel: '1 месяц' }
  );
});

test('celebrates leap-day birthdays on the last day of February', () => {
  assert.deepEqual(
    reminderForBaby({ birthdate: '2024-02-29' }, '2025-02-28', { birthday_reminders: true }),
    { type: 'birthday', ageLabel: '1 год' }
  );
});
