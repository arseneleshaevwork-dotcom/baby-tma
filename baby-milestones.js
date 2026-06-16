const MILESTONE_MONTHS = [1, 3, 6, 9, 12, 18, 24, 36];

function buildUpcomingBabyDates({ babies = [], now = new Date(), horizonDays = 30 } = {}) {
  const nowDate = toUtcDateOnly(now);
  const maxDate = addDays(nowDate, horizonDays);
  const items = [];

  for (const baby of babies) {
    if (!baby.birthdate) continue;
    const birth = parseDateOnly(baby.birthdate);
    if (!birth) continue;

    const birthday = nextBirthday(birth, nowDate);
    if (birthday >= nowDate && birthday <= maxDate) {
      const years = birthday.getUTCFullYear() - birth.getUTCFullYear();
      items.push(formatMilestone(baby, 'birthday', birthday, nowDate, years * 12));
    }

    for (const month of MILESTONE_MONTHS) {
      if (month % 12 === 0) continue;
      const date = addMonths(birth, month);
      if (date >= nowDate && date <= maxDate) {
        items.push(formatMilestone(baby, 'month', date, nowDate, month));
      }
    }
  }

  return items
    .sort((a, b) => a.days_until - b.days_until || a.name.localeCompare(b.name, 'ru'))
    .slice(0, 50);
}

function buildNextBabyEvent({ name = '', birthdate = '', now = new Date(), horizonDays = 45 } = {}) {
  const cleanName = String(name || '').trim() || 'малыш';
  if (!birthdate) {
    return {
      type: 'profile',
      title: 'Добавьте дату рождения малыша',
      subtitle: 'Тогда я смогу поздравлять с важными датами и точнее подбирать режим по возрасту.',
      cta: 'Заполнить профиль',
      days_until: null,
      event_date: null,
      age_months: null,
      age_label: 'Возраст не указан'
    };
  }

  const items = buildUpcomingBabyDates({
    babies: [{ id: 'local', name: cleanName, birthdate }],
    now,
    horizonDays
  });
  const next = items[0];
  if (!next) {
    const ageMonths = getBabyAgeMonths(birthdate, now);
    return {
      type: 'steady',
      title: `${cleanName}: ${formatAgeLabel(ageMonths)}`,
      subtitle: 'Ведите дневник сна несколько дней — я подскажу, где режим можно сделать спокойнее.',
      cta: 'Открыть дневник',
      days_until: null,
      event_date: null,
      age_months: ageMonths,
      age_label: formatAgeLabel(ageMonths)
    };
  }

  const prefix = next.days_until === 0 ? 'Сегодня' : `Через ${next.days_until} ${pluralDays(next.days_until)}`;
  return {
    type: next.type,
    title: `${prefix} ${cleanName}: ${next.age_label}`,
    subtitle: next.type === 'birthday'
      ? 'Подготовьте поздравление и проверьте, как меняются сон, питание и ритуалы в новом возрасте.'
      : 'Это хороший момент пересмотреть окна бодрствования, дневные сны и кормления.',
    cta: 'Что важно сейчас',
    days_until: next.days_until,
    event_date: next.event_date,
    age_months: next.age_months,
    age_label: next.age_label
  };
}

function pluralDays(value) {
  const n = Math.abs(Number(value));
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'день';
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return 'дня';
  return 'дней';
}

function getBabyAgeMonths(birthdate, now = new Date()) {
  const birth = parseDateOnly(birthdate);
  if (!birth) return null;
  const current = toUtcDateOnly(now);
  let months = (current.getUTCFullYear() - birth.getUTCFullYear()) * 12
    + current.getUTCMonth() - birth.getUTCMonth();
  if (current.getUTCDate() < birth.getUTCDate()) months -= 1;
  return Math.max(0, months);
}

function formatMilestone(baby, type, eventDate, nowDate, ageMonths) {
  return {
    baby_id: baby.id || '',
    user_id: baby.user_id || null,
    client_id: baby.client_id || null,
    name: baby.name || 'Без имени',
    birthdate: baby.birthdate || null,
    type,
    event_date: formatDateOnly(eventDate),
    days_until: diffDays(nowDate, eventDate),
    age_months: ageMonths,
    age_label: formatAgeLabel(ageMonths)
  };
}

function formatAgeLabel(ageMonths) {
  if (ageMonths === null || ageMonths === undefined) return 'Возраст не указан';
  if (ageMonths === 12) return '1 год';
  if (ageMonths > 12 && ageMonths % 12 === 0) return `${ageMonths / 12} года`;
  if (ageMonths > 12) {
    const years = Math.floor(ageMonths / 12);
    const months = ageMonths % 12;
    return `${years} г. ${months} мес.`;
  }
  if (ageMonths === 1) return '1 месяц';
  if ([2, 3, 4].includes(ageMonths)) return `${ageMonths} месяца`;
  return `${ageMonths} месяцев`;
}

function parseDateOnly(value) {
  if (!value) return null;
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return Number.isNaN(date.getTime()) ? null : date;
}

function toUtcDateOnly(value) {
  const date = value instanceof Date ? value : new Date(value);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function nextBirthday(birth, nowDate) {
  let date = new Date(Date.UTC(nowDate.getUTCFullYear(), birth.getUTCMonth(), birth.getUTCDate()));
  if (date < nowDate) {
    date = new Date(Date.UTC(nowDate.getUTCFullYear() + 1, birth.getUTCMonth(), birth.getUTCDate()));
  }
  return date;
}

function addMonths(date, months) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, date.getUTCDate()));
}

function addDays(date, days) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days));
}

function diffDays(from, to) {
  return Math.round((to.getTime() - from.getTime()) / 86400000);
}

function formatDateOnly(date) {
  return date.toISOString().slice(0, 10);
}

if (typeof module !== 'undefined') {
  module.exports = {
    MILESTONE_MONTHS,
    buildUpcomingBabyDates,
    buildNextBabyEvent,
    getBabyAgeMonths,
    formatAgeLabel
  };
}


if (typeof window !== 'undefined') {
  window.BabyMilestones = {
    MILESTONE_MONTHS,
    buildUpcomingBabyDates,
    buildNextBabyEvent,
    getBabyAgeMonths,
    formatAgeLabel
  };
}
