import assert from 'node:assert/strict';
import {
  buildBotReply,
  calculateAgeMonths,
  normalizeBirthdate,
  parseReminderConsent
} from '../supabase/functions/telegram-webhook/bot-flow.mjs';

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

test('builds sales-oriented start greeting and asks for baby name', () => {
  const reply = buildBotReply({
    text: '/start',
    firstName: 'Анна',
    baby: null,
    miniAppUrl: 'https://example.test/app'
  });

  assert.equal(reply.action, 'ask_name');
  assert.match(reply.text, /Анна/);
  assert.match(reply.text, /Как зовут малыша/);
  assert.match(reply.text, /Начать можно бесплатно/);
  assert.match(reply.text, /ближайшее окно сна/);
  assert.equal(reply.reply_markup.inline_keyboard[0][0].text, 'Собрать режим малыша');
});

test('returns an outcome-focused greeting to an existing parent', () => {
  const reply = buildBotReply({
    text: '/start',
    firstName: 'Анна',
    baby: { name: 'Миша' },
    miniAppUrl: 'https://example.test/app'
  });

  assert.equal(reply.action, 'welcome_back');
  assert.match(reply.text, /план на сегодня/i);
  assert.match(reply.text, /Миша/);
  assert.equal(reply.reply_markup.inline_keyboard[0][0].text, 'Открыть план на сегодня');
});

test('treats short plain text as baby name when profile has no name', () => {
  const reply = buildBotReply({
    text: 'Миша',
    firstName: 'Анна',
    baby: null,
    miniAppUrl: 'https://example.test/app'
  });

  assert.equal(reply.action, 'save_name');
  assert.equal(reply.profile.name, 'Миша');
  assert.match(reply.text, /дату рождения/);
});

test('parses birthdate and asks for reminder consent', () => {
  const reply = buildBotReply({
    text: '20.12.2025',
    firstName: 'Анна',
    baby: { name: 'Миша', birthdate: null },
    miniAppUrl: 'https://example.test/app',
    now: '2026-06-16T09:00:00.000Z'
  });

  assert.equal(reply.action, 'save_birthdate');
  assert.deepEqual(reply.profile, {
    name: 'Миша',
    birthdate: '2025-12-20',
    age_months: 5
  });
  assert.match(reply.text, /Миша скоро 6 месяцев/);
  assert.match(reply.text, /Включить напоминания/);
});

test('parses reminder consent commands', () => {
  assert.equal(parseReminderConsent('Да, включить'), true);
  assert.equal(parseReminderConsent('/reminders_off'), false);
  assert.equal(parseReminderConsent('reminders_on'), true);
  assert.equal(parseReminderConsent('reminders_off'), false);
  assert.equal(parseReminderConsent('позже'), false);
  assert.equal(parseReminderConsent('что умеешь?'), null);
});

test('handles skip birthdate callback and asks for reminder consent', () => {
  const reply = buildBotReply({
    text: 'skip_birthdate',
    firstName: 'Анна',
    baby: { name: 'Миша', birthdate: null },
    miniAppUrl: 'https://example.test/app'
  });

  assert.equal(reply.action, 'skip_birthdate');
  assert.match(reply.text, /дату рождения можно добавить позже/);
  assert.match(reply.text, /Включить напоминания/);
});

test('shows profile summary when baby profile exists', () => {
  const reply = buildBotReply({
    text: '/profile',
    firstName: 'Анна',
    baby: { name: 'Миша', birthdate: '2025-12-20', age_months: 6 },
    miniAppUrl: 'https://example.test/app'
  });

  assert.equal(reply.action, 'show_profile');
  assert.match(reply.text, /Миша/);
  assert.match(reply.text, /2025-12-20/);
  assert.match(reply.text, /6 месяцев/);
});

test('resets profile with command', () => {
  const reply = buildBotReply({
    text: '/reset',
    firstName: 'Анна',
    baby: { name: 'Миша', birthdate: '2025-12-20', age_months: 6 },
    miniAppUrl: 'https://example.test/app'
  });

  assert.equal(reply.action, 'reset_profile');
  assert.match(reply.text, /Профиль малыша сброшен/);
  assert.match(reply.text, /Как зовут малыша/);
});

test('shows bot help with commands', () => {
  const reply = buildBotReply({
    text: '/help',
    firstName: 'Анна',
    baby: null,
    miniAppUrl: 'https://example.test/app'
  });

  assert.equal(reply.action, 'help');
  assert.match(reply.text, /\/profile/);
  assert.match(reply.text, /\/reminders_on/);
  assert.match(reply.text, /\/terms/);
  assert.match(reply.text, /\/paysupport/);
  assert.match(reply.text, /\/reset/);
});

test('shows premium terms and the public terms page', () => {
  const reply = buildBotReply({
    text: '/terms',
    firstName: 'Анна',
    baby: { name: 'Миша' },
    miniAppUrl: 'https://example.test/baby-tma/'
  });

  assert.equal(reply.action, 'terms');
  assert.match(reply.text, /Stars/);
  assert.match(reply.text, /ЮKassa/);
  assert.equal(reply.reply_markup.inline_keyboard[0][0].url, 'https://example.test/baby-tma/terms.html');
});

test('creates a payment support request without asking for card data', () => {
  const reply = buildBotReply({
    text: '/paysupport оплатил 299 Stars, Premium не открылся',
    firstName: 'Анна',
    baby: { name: 'Миша' },
    miniAppUrl: 'https://example.test/app'
  });

  assert.equal(reply.action, 'payment_support');
  assert.match(reply.support_message, /299 Stars/);
  assert.match(reply.text, /Не отправляйте данные карты/);
});

test('normalizes supported birthdate formats and calculates full months', () => {
  assert.equal(normalizeBirthdate('20.12.2025'), '2025-12-20');
  assert.equal(normalizeBirthdate('2025-12-20'), '2025-12-20');
  assert.equal(normalizeBirthdate('40.12.2025'), null);
  assert.equal(calculateAgeMonths('2025-12-20', '2026-06-16T09:00:00.000Z'), 5);
  assert.equal(calculateAgeMonths('2025-12-20', '2026-06-20T09:00:00.000Z'), 6);
});
