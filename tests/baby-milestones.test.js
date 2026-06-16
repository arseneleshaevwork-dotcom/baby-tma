const assert = require('assert');
const {
  buildUpcomingBabyDates,
  buildNextBabyEvent,
  getBabyAgeMonths
} = require('../baby-milestones');

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

test('calculates baby age in full months', () => {
  assert.strictEqual(getBabyAgeMonths('2025-12-01', '2026-06-14'), 6);
  assert.strictEqual(getBabyAgeMonths('2025-12-20', '2026-06-14'), 5);
});

test('builds upcoming birthday and month milestones', () => {
  const dates = buildUpcomingBabyDates({
    babies: [
      { id: 'b1', name: 'Миша', birthdate: '2025-12-20', client_id: 'c1' },
      { id: 'b2', name: 'Аня', birthdate: '2025-06-16', client_id: 'c2' },
      { id: 'b3', name: 'Без даты', birthdate: null, client_id: 'c3' }
    ],
    now: '2026-06-14T09:00:00.000Z',
    horizonDays: 14
  });

  assert.deepStrictEqual(dates.map(item => ({
    name: item.name,
    type: item.type,
    event_date: item.event_date,
    days_until: item.days_until,
    age_label: item.age_label
  })), [
    {
      name: 'Аня',
      type: 'birthday',
      event_date: '2026-06-16',
      days_until: 2,
      age_label: '1 год'
    },
    {
      name: 'Миша',
      type: 'month',
      event_date: '2026-06-20',
      days_until: 6,
      age_label: '6 месяцев'
    }
  ]);
});


test('builds next baby event card for home screen', () => {
  const event = buildNextBabyEvent({
    name: 'Артем',
    birthdate: '2025-12-20',
    now: '2026-06-14T09:00:00.000Z',
    horizonDays: 45
  });

  assert.deepStrictEqual(event, {
    type: 'month',
    title: 'Через 6 дней Артем: 6 месяцев',
    subtitle: 'Это хороший момент пересмотреть окна бодрствования, дневные сны и кормления.',
    cta: 'Что важно сейчас',
    days_until: 6,
    event_date: '2026-06-20',
    age_months: 6,
    age_label: '6 месяцев'
  });
});

test('builds profile prompt when birthdate is missing', () => {
  const event = buildNextBabyEvent({ name: 'Малыш', birthdate: '', now: '2026-06-14T09:00:00.000Z' });

  assert.deepStrictEqual(event, {
    type: 'profile',
    title: 'Добавьте дату рождения малыша',
    subtitle: 'Тогда я смогу поздравлять с важными датами и точнее подбирать режим по возрасту.',
    cta: 'Заполнить профиль',
    days_until: null,
    event_date: null,
    age_months: null,
    age_label: 'Возраст не указан'
  });
});
