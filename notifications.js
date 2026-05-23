// ─── Notifications & Reminders ────────────────────────────────────────────────
// Uses Telegram Bot API to send schedule reminders via bot message.
// Fallback: in-session setTimeout reminders with toast notifications.

const BOT_TOKEN = '8999375510:AAFlkiYu-0SabIMT7-XKJPWynRVUlK_R8NQ';
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
}

function _showNotifPrompt() {
  // Use Telegram native confirm dialog
  const tg = window.Telegram && window.Telegram.WebApp;
  if (tg && tg.showPopup) {
    try {
      tg.showPopup({
        title: '🔔 Напоминания',
        message: 'Хотите получать напоминания о кормлении и сне малыша прямо в Telegram?',
        buttons: [
          { id: 'yes', type: 'default', text: 'Да, включить' },
          { id: 'no',  type: 'destructive', text: 'Не сейчас' }
        ]
      }, function(btnId) {
        if (btnId === 'yes') {
          localStorage.setItem(NOTIF_KEY, 'tg');
          if (typeof showToast === 'function') showToast('✅ Напоминания включены!');
          if (typeof hapticSuccess === 'function') hapticSuccess();
        } else {
          localStorage.setItem(NOTIF_KEY, 'no');
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
  localStorage.setItem(NOTIF_KEY, 'pending');
}

// Called after schedule is generated — schedules in-session reminders
function scheduleReminders(blocks) {
  // Clear old timers
  _notifTimers.forEach(t => clearTimeout(t));
  _notifTimers = [];

  if (!blocks || !blocks.length) return;

  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();

  // Find next blocks from now
  const upcoming = blocks.filter(b => {
    const [h, m] = (b.time || '').split(':').map(Number);
    if (isNaN(h)) return false;
    const blockMin = h * 60 + m;
    return blockMin > nowMin && blockMin - nowMin <= 60 * 8; // within 8h
  }).slice(0, 5);

  upcoming.forEach(block => {
    const [h, m] = block.time.split(':').map(Number);
    const blockMin = h * 60 + m;
    const delayMs = (blockMin - nowMin) * 60 * 1000;

    const emoji = { sleep:'🌙', feed:'🍼', active:'🎮', hygiene:'🛁', walk:'🌿' }[block.tag] || '⏰';
    const msg = `${emoji} ${block.time} — ${block.title}`;

    const t = setTimeout(() => {
      // In-app toast notification
      if (typeof showToast === 'function') showToast(msg);
      if (typeof hapticLight === 'function') hapticLight();

      // Telegram bot message if user ID known and enabled
      if (_tgUserId && localStorage.getItem(NOTIF_KEY) === 'tg') {
        _sendBotMessage(_tgUserId, `${emoji} *${block.time}* — ${block.title}\n${block.note || ''}`);
      }
    }, delayMs);

    _notifTimers.push(t);
  });

  if (upcoming.length > 0 && typeof showToast === 'function') {
    showToast(`🔔 Напоминания установлены на ${upcoming.length} событий`);
  }
}

function _sendBotMessage(chatId, text) {
  fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: text,
      parse_mode: 'Markdown'
    })
  }).catch(() => {}); // silent fail — user is offline
}

// Toggle notifications from UI
function toggleNotifications() {
  const cur = localStorage.getItem(NOTIF_KEY);
  if (cur === 'tg' || cur === 'pending') {
    localStorage.setItem(NOTIF_KEY, 'no');
    _notifTimers.forEach(t => clearTimeout(t));
    _notifTimers = [];
    if (typeof showToast === 'function') showToast('🔕 Напоминания отключены');
  } else {
    _showNotifPrompt();
  }
}

function isNotificationsEnabled() {
  return localStorage.getItem(NOTIF_KEY) === 'tg' || localStorage.getItem(NOTIF_KEY) === 'pending';
}
