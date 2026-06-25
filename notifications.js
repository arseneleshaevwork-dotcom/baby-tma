// ─── Notifications & Reminders ────────────────────────────────────────────────
// Uses in-session reminders. Telegram bot delivery must go through a backend.
// Fallback: in-session setTimeout reminders with toast notifications.

const NOTIF_ENDPOINT = '';
const NOTIF_KEY = 'babymode_notif_enabled';

let _notifTimers = [];
let _tgUserId = null;

function initNotifications() {
  // Get Telegram user ID if in TMA
  try {
    const tg = window.Telegram && window.Telegram.WebApp;
    if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) {
      _tgUserId = tg.initDataUnsafe.user.id;
    }
  } catch(e) {}

  // Show prompt only if never asked before and not in low-end mode
  if (!localStorage.getItem(NOTIF_KEY)) {
    _showNotifPrompt();
  }

  const savedPlan = getTodayReminderPlan();
  _renderReminderBadge(savedPlan.length);
  _renderReminderList(savedPlan);
}

function _showNotifPrompt() {
  // Use Telegram native confirm dialog
  const tg = window.Telegram && window.Telegram.WebApp;
  if (tg && tg.showPopup) {
    try {
      tg.showPopup({
        title: '🔔 Напоминания',
        message: 'Включить мягкие напоминания о важных датах малыша, скачках возраста и ближайших событиях режима?',
        buttons: [
          { id: 'yes', type: 'default', text: 'Да, включить' },
          { id: 'no',  type: 'destructive', text: 'Не сейчас' }
        ]
      }, function(btnId) {
        if (btnId === 'yes') {
          setNotificationPreference('tg');
          if (typeof showToast === 'function') showToast('✅ Напоминания включены!');
          if (typeof hapticSuccess === 'function') hapticSuccess();
        } else {
          setNotificationPreference('no');
        }
      });
    } catch(e) {
      // Fallback: in-app toast prompt
      _showInAppPrompt();
    }
  } else {
    _showInAppPrompt();
  }
}

function _showInAppPrompt() {
  if (typeof showToast === 'function') {
    showToast('💡 Напоминания: нажмите кнопку 🔔 после генерации расписания');
  }
  setNotificationPreference('pending');
}

// Called after schedule is generated — schedules in-session reminders
function scheduleReminders(blocks) {
  // Clear old timers
  _notifTimers.forEach(t => clearTimeout(t));
  _notifTimers = [];

  if (!blocks || !blocks.length) {
    _storeReminderPlan([]);
    _renderReminderBadge(0);
    _renderReminderList([]);
    return;
  }

  const now = new Date();

  const reminderPlan = window.ReminderPlanner
    ? ReminderPlanner.buildReminderPlan(blocks, now)
    : [];

  reminderPlan.forEach(reminder => {
    const delayMs = Math.max(0, reminder.atMs - now.getTime());
    const t = setTimeout(() => {
      if (typeof showToast === 'function') showToast(reminder.message);
      if (typeof hapticLight === 'function') hapticLight();
    }, delayMs);

    _notifTimers.push(t);
  });

  _storeReminderPlan(reminderPlan);
  _renderReminderBadge(reminderPlan.length);
  _renderReminderList(reminderPlan);

  if (reminderPlan.length > 0 && typeof showToast === 'function') {
    showToast(`🔔 Напоминания установлены: ${reminderPlan.length}`);
  }
}

function _sendBotMessage(chatId, text) {
  if (!NOTIF_ENDPOINT) return;
  fetch(NOTIF_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: text })
  }).catch(() => {}); // silent fail — user is offline
}

// Toggle notifications from UI
function toggleNotifications() {
  const cur = localStorage.getItem(NOTIF_KEY);
  if (cur === 'tg' || cur === 'pending') {
    setNotificationPreference('no');
    _notifTimers.forEach(t => clearTimeout(t));
    _notifTimers = [];
    _storeReminderPlan([]);
    _renderReminderBadge(0);
    _renderReminderList([]);
    if (typeof showToast === 'function') showToast('🔕 Напоминания отключены');
  } else {
    _showNotifPrompt();
  }
}

function isNotificationsEnabled() {
  return localStorage.getItem(NOTIF_KEY) === 'tg' || localStorage.getItem(NOTIF_KEY) === 'pending';
}

function getTodayReminderPlan() {
  try { return JSON.parse(localStorage.getItem('babymode_today_reminders') || '[]'); }
  catch(e) { return []; }
}

function _storeReminderPlan(plan) {
  localStorage.setItem('babymode_today_reminders', JSON.stringify((plan || []).map(item => ({
    kind: item.kind,
    type: item.type,
    title: item.title,
    time: item.time,
    at: item.at,
    message: item.message,
    label: item.label
  }))));
}

function _renderReminderBadge(count) {
  const badge = document.getElementById('reminderBadge');
  if (!badge) return;
  if (!isNotificationsEnabled()) {
    badge.textContent = 'Выкл';
  } else {
    badge.textContent = count ? `${count} акт.` : 'Вкл';
  }
}

function _renderReminderList(plan) {
  const card = document.getElementById('reminderListCard');
  if (!card) return;
  const items = (plan || []).slice(0, 6);
  if (!items.length || !isNotificationsEnabled()) {
    card.style.display = 'none';
    card.innerHTML = '';
    return;
  }
  card.style.display = 'block';
  card.innerHTML = `
    <div class="rl-title">Ближайшие напоминания</div>
    <div class="rl-list">
      ${items.map(item => `
        <div class="rl-item">
          <span class="rl-time">${_formatReminderTime(item.at)}</span>
          <span class="rl-text">${_escapeHtml(item.label)}</span>
        </div>
      `).join('')}
    </div>`;
}

function _formatReminderTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function _escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }[ch]));
}

function setNotificationPreference(value) {
  localStorage.setItem(NOTIF_KEY, value);
  if (!window.BabyAnalytics) return;

  const enabled = value === 'tg' || value === 'pending';
  BabyAnalytics.track(enabled ? 'notifications_enabled' : 'notifications_disabled', {
    channel: value === 'tg' ? 'telegram' : 'in_app',
    telegram_user_id: _tgUserId || null,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Moscow',
    birthday_reminders: enabled,
    age_milestones: enabled,
    schedule_reminders: enabled
  });
  BabyAnalytics.flush();
}


const _setNotificationPreference = setNotificationPreference;
