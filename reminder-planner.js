// Builds in-app reminder events from today's generated schedule.

const ReminderPlanner = (() => {
  const HORIZON_MIN = 8 * 60;
  const PREP_MIN = 10;
  const MAX_REMINDERS = 12;

  function buildReminderPlan(blocks = [], now = new Date()) {
    const nowDate = now instanceof Date ? now : new Date(now);
    if (!Array.isArray(blocks) || Number.isNaN(nowDate.getTime())) return [];

    const reminders = [];
    for (const block of blocks) {
      const eventAt = eventAtForTime(block && block.time, nowDate);
      if (!eventAt) continue;
      const minutesUntil = Math.round((eventAt.getTime() - nowDate.getTime()) / 60000);
      if (minutesUntil <= 0 || minutesUntil > HORIZON_MIN) continue;

      const type = block.tag || 'active';
      if (['sleep', 'feed', 'walk'].includes(type) && minutesUntil > PREP_MIN) {
        const prepAt = new Date(eventAt.getTime() - PREP_MIN * 60000);
        reminders.push(formatReminder(block, prepAt, 'prepare'));
      }
      reminders.push(formatReminder(block, eventAt, 'due'));
    }

    return reminders
      .sort((a, b) => a.atMs - b.atMs)
      .slice(0, MAX_REMINDERS);
  }

  function eventAtForTime(time, now = new Date()) {
    const match = String(time || '').match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;
    const h = Number(match[1]);
    const m = Number(match[2]);
    if (h < 0 || h > 23 || m < 0 || m > 59) return null;
    const date = new Date(now);
    date.setHours(h, m, 0, 0);
    if (date.getTime() < now.getTime() - 5 * 60000) date.setDate(date.getDate() + 1);
    return date;
  }

  function formatReminder(block, at, kind) {
    const type = block.tag || 'active';
    const emoji = { sleep:'🌙', feed:'🍼', active:'🎮', hygiene:'🛁', walk:'🌿' }[type] || '⏰';
    const title = block.title || 'Событие режима';
    const time = formatTime(at);
    const prefix = kind === 'prepare' ? 'Скоро' : 'Пора';
    const message = kind === 'prepare'
      ? `${emoji} Через 10 минут: ${title}`
      : `${emoji} ${block.time || time} — ${title}`;
    return {
      id: `${kind}:${type}:${block.time || time}:${title}`.slice(0, 120),
      kind,
      type,
      title,
      note: block.note || '',
      time: block.time || time,
      at: at.toISOString(),
      atMs: at.getTime(),
      message,
      label: `${prefix}: ${title}`
    };
  }

  function formatTime(date) {
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }

  return { buildReminderPlan, eventAtForTime };
})();

if (typeof window !== 'undefined') window.ReminderPlanner = ReminderPlanner;
if (typeof module !== 'undefined') module.exports = ReminderPlanner;
