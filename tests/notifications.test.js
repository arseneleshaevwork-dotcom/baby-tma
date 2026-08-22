const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const values = new Map([['babymode_notif_enabled', 'tg']]);
const tracked = [];
let opened = '';
const window = {
  BabyAccount: {
    getUser: () => ({ telegram_id: 123456789 }),
    isAuthenticated: () => true,
    isMiniApp: () => false
  },
  BabyAnalytics: {
    track(event, payload) { tracked.push({ event, payload }); },
    flush() {}
  },
  addEventListener() {},
  open(url) { opened = url; }
};
const context = {
  window,
  localStorage: {
    getItem: key => values.get(key) || null,
    setItem: (key, value) => values.set(key, String(value))
  },
  document: { getElementById: () => null },
  Intl,
  Date,
  Number,
  JSON,
  setTimeout,
  clearTimeout,
  BabyAnalytics: window.BabyAnalytics,
  showToast() {}
};
vm.createContext(context);
vm.runInContext(fs.readFileSync('./notifications.js', 'utf8'), context);

assert.strictEqual(vm.runInContext('_refreshTelegramUserId()', context), 123456789);
assert.strictEqual(vm.runInContext(`_syncReminderPlanToTelegram([{
  id:'sleep-1',kind:'prepare',type:'sleep',title:'Сон',at:'2026-08-22T18:00:00.000Z',message:'Пора готовиться'
}])`, context), true);
assert.strictEqual(tracked[0].event, 'schedule_reminders_planned');
assert.strictEqual(tracked[0].payload.reminders[0].id, 'sleep-1');

vm.runInContext('_showInAppPrompt()', context);
assert.strictEqual(opened, 'https://t.me/babymode1_bot?start=reminders');
assert.strictEqual(values.get('babymode_notif_enabled'), 'tg');

console.log('ok - web Telegram login binds schedule reminders and opens the bot activation path');
