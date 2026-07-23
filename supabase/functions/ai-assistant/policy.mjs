const ALLOWED_TAGS = new Set([
  'long_soothe', 'cry_sleep', 'cry_wake', 'illness', 'travel', 'teeth',
  'regression', 'slept_well'
]);

export const AI_CONSENT_VERSION = '2026-07-24-v1';
export const MAX_QUESTION_LENGTH = 1500;
export const FREE_DAILY_LIMIT = 4;
export const PREMIUM_DAILY_LIMIT = 40;

export function sanitizeQuestion(value) {
  return String(value || '').replace(/\u0000/g, '').trim().slice(0, MAX_QUESTION_LENGTH);
}

export function sanitizeAgeMonths(value) {
  const age = Number(value);
  return Number.isFinite(age) ? Math.max(0, Math.min(36, Math.round(age))) : null;
}

export function sanitizeDiary(entries, now = new Date()) {
  if (!Array.isArray(entries)) return [];
  const today = new Date(now);
  today.setHours(23, 59, 59, 999);
  const cutoff = new Date(today.getTime() - 13 * 86400000);
  cutoff.setHours(0, 0, 0, 0);

  return entries.map(item => {
    const date = /^\d{4}-\d{2}-\d{2}$/.test(String(item?.date || ''))
      ? new Date(`${item.date}T12:00:00Z`)
      : null;
    if (!date || Number.isNaN(date.getTime()) || date < cutoff || date > today) return null;
    return {
      date: String(item.date),
      wake: sanitizeTime(item.wake),
      bedtime: sanitizeTime(item.bedtime || item.bed),
      day_sleep_min: clampInteger(item.day_sleep_min ?? item.dayNaps, 0, 1200),
      night_sleep_min: clampInteger(item.night_sleep_min ?? item.nightLen, 0, 1200),
      night_wakings: clampInteger(item.night_wakings ?? item.nightWakings, 0, 50),
      tags: Array.isArray(item.tags) ? [...new Set(item.tags.filter(tag => ALLOWED_TAGS.has(tag)))].slice(0, 8) : []
    };
  }).filter(Boolean).sort((a, b) => a.date.localeCompare(b.date)).slice(-14);
}

export function selectSources(question) {
  const value = String(question || '').toLowerCase().replace(/ё/g, 'е');
  if (/корм|смес|груд|прикорм|ест|еда/.test(value)) {
    return [
      { label: 'ВОЗ: прикорм', url: 'https://www.who.int/health-topics/complementary-feeding' },
      { label: 'CDC: приготовление смеси', url: 'https://www.cdc.gov/infant-toddler-nutrition/formula-feeding/preparation-and-storage.html' }
    ];
  }
  if (/развит|полз|сид|ход|реч|говор/.test(value)) {
    return [{ label: 'CDC: этапы развития', url: 'https://www.cdc.gov/milestones' }];
  }
  if (/температур|жар|сып|дыш|судорог|рвот|вял|бол/.test(value)) {
    return [{ label: 'NHS: температура у детей', url: 'https://www.nhs.uk/symptoms/fever-in-children/' }];
  }
  return [
    { label: 'AAP: безопасный сон', url: 'https://www.healthychildren.org/English/ages-stages/baby/sleep/Pages/A-Parents-Guide-to-Safe-Sleep.aspx' },
    { label: 'NHS: сон малыша', url: 'https://www.nhs.uk/baby/caring-for-a-newborn/helping-your-baby-to-sleep/' }
  ];
}

export function extractOutputText(response) {
  if (typeof response?.output_text === 'string' && response.output_text.trim()) return response.output_text.trim();
  const parts = [];
  for (const item of response?.output || []) {
    for (const content of item?.content || []) {
      if (content?.type === 'output_text' && content.text) parts.push(String(content.text));
    }
  }
  return parts.join('\n').trim();
}

function sanitizeTime(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || '')) ? String(value) : null;
}

function clampInteger(value, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, Math.round(number))) : 0;
}
