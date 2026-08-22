export const milestoneMonths = [1, 3, 6, 9, 12, 18, 24, 36];

export function localDateTime(now, timeZone) {
  const zone = validTimeZone(timeZone) ? timeZone : 'Europe/Moscow';
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(now).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    timeZone: zone
  };
}

export function isComfortableDeliveryTime(hour) {
  return Number(hour) >= 9 && Number(hour) < 20;
}

export function reminderForBaby(baby, today, setting) {
  const birth = parseDateOnly(baby?.birthdate);
  const date = parseDateOnly(today);
  if (!birth || !date || date < birth) return null;

  const years = date.getUTCFullYear() - birth.getUTCFullYear();
  if (setting?.birthday_reminders && years > 0
    && sameDate(addYearsClamped(birth, years), date)) {
    return { type: 'birthday', ageLabel: formatYearLabel(years) };
  }

  if (setting?.age_milestones) {
    for (const months of milestoneMonths) {
      if (sameDate(addMonthsClamped(birth, months), date)) {
        return { type: 'age_milestone', ageLabel: formatMonthLabel(months) };
      }
    }
  }
  return null;
}

export function addMonthsClamped(date, months) {
  const targetMonth = date.getUTCMonth() + months;
  const targetYear = date.getUTCFullYear() + Math.floor(targetMonth / 12);
  const normalizedMonth = ((targetMonth % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, normalizedMonth + 1, 0)).getUTCDate();
  return new Date(Date.UTC(targetYear, normalizedMonth, Math.min(date.getUTCDate(), lastDay)));
}

function addYearsClamped(date, years) {
  const year = date.getUTCFullYear() + years;
  const month = date.getUTCMonth();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(date.getUTCDate(), lastDay)));
}

function parseDateOnly(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date;
}

function sameDate(left, right) {
  return left.getTime() === right.getTime();
}

function validTimeZone(value) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: String(value || '') }).format();
    return true;
  } catch (_) {
    return false;
  }
}

function formatYearLabel(years) {
  const mod100 = years % 100;
  const mod10 = years % 10;
  if (mod100 >= 11 && mod100 <= 14) return `${years} лет`;
  if (mod10 === 1) return `${years} год`;
  if (mod10 >= 2 && mod10 <= 4) return `${years} года`;
  return `${years} лет`;
}

function formatMonthLabel(months) {
  if (months === 1) return '1 месяц';
  if ([2, 3, 4].includes(months)) return `${months} месяца`;
  if (months === 12) return '1 год';
  if (months > 12 && months % 12 === 0) return formatYearLabel(months / 12);
  if (months > 12) return `${Math.floor(months / 12)} г. ${months % 12} мес.`;
  return `${months} месяцев`;
}
