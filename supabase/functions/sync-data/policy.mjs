const ALLOWED_TAGS = new Set(['long_soothe', 'cry_sleep', 'cry_wake', 'illness', 'travel', 'teeth', 'regression', 'slept_well']);
const ALLOWED_MOODS = new Set(['😊', '😐', '😢', '😴', '🤒']);
const ALLOWED_SETTINGS = new Set([
  'wake_time', 'feed_type', 'last_age', 'notifications', 'ai_consent', 'today_schedule'
]);

export function sanitizeSyncProfile(value, now = new Date()) {
  const profile = value && typeof value === 'object' ? value : {};
  const name = cleanText(profile.name, 40);
  const birthdate = /^\d{4}-\d{2}-\d{2}$/.test(String(profile.birthdate || '')) ? String(profile.birthdate) : '';
  const parsed = birthdate ? new Date(`${birthdate}T12:00:00Z`) : null;
  const safeBirthdate = parsed && !Number.isNaN(parsed.getTime()) && parsed <= now && parsed >= new Date('2020-01-01T00:00:00Z')
    ? birthdate
    : '';
  const age = clampNumber(profile.age_months, 0, 60);
  return { name, birthdate: safeBirthdate, age_months: age };
}

export function sanitizeSyncSettings(value) {
  const source = value && typeof value === 'object' ? value : {};
  const result = {};
  for (const [key, raw] of Object.entries(source)) {
    if (!ALLOWED_SETTINGS.has(key)) continue;
    if (key === 'wake_time' && /^([01]\d|2[0-3]):[0-5]\d$/.test(String(raw || ''))) result[key] = String(raw);
    if (key === 'feed_type' && ['breast', 'formula', 'mixed', 'solids'].includes(String(raw))) result[key] = String(raw);
    if (key === 'last_age') result[key] = clampNumber(raw, 0, 60);
    if (key === 'notifications') result[key] = raw === true || raw === '1' || raw === 'true';
    if (key === 'ai_consent') result[key] = raw === 'granted' ? 'granted' : '';
    if (key === 'today_schedule' && raw && typeof raw === 'object') {
      const encoded = JSON.stringify(raw);
      if (encoded.length <= 30_000) result[key] = raw;
    }
  }
  return result;
}

export function sanitizeDiaryEntry(value, now = new Date()) {
  const log = value && typeof value === 'object' ? value : {};
  const date = String(log.date || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const parsedDate = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(parsedDate.getTime()) || parsedDate > new Date(now.getTime() + 86400_000) || parsedDate < new Date('2020-01-01T00:00:00Z')) return null;
  const clientUpdatedAt = sanitizeClientTimestamp(log._updatedAt || log.client_updated_at, now);
  const safeTime = value => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || '')) ? String(value) : '';
  const quickNaps = (Array.isArray(log.quickNaps) ? log.quickNaps : []).slice(0, 12).map(nap => ({
    start: safeTime(nap?.start), end: safeTime(nap?.end), dur: clampNumber(nap?.dur, 0, 1440)
  })).filter(nap => nap.start && nap.end);
  const sleepEvents = (Array.isArray(log.sleepEvents) ? log.sleepEvents : []).slice(-40).map(event => ({
    startAt: safeIso(event?.startAt), endAt: safeIso(event?.endAt),
    start: safeTime(event?.start), end: safeTime(event?.end),
    dur: clampNumber(event?.dur, 0, 1440), kind: event?.kind === 'night' ? 'night' : 'nap'
  })).filter(event => event.start && event.end);
  return {
    date,
    wake: safeTime(log.wake) || '07:00',
    bed: safeTime(log.bed) || '19:30',
    nap1s: safeTime(log.nap1s), nap1e: safeTime(log.nap1e),
    nap2s: safeTime(log.nap2s), nap2e: safeTime(log.nap2e),
    nap3s: safeTime(log.nap3s), nap3e: safeTime(log.nap3e),
    dayNaps: clampNumber(log.dayNaps, 0, 1440),
    nightLen: clampNumber(log.nightLen, 0, 1440),
    nightAwakeMin: clampNumber(log.nightAwakeMin, 0, 720),
    nightWakings: clampNumber(log.nightWakings, 0, 50),
    mood: ALLOWED_MOODS.has(log.mood) ? log.mood : '😊',
    tags: [...new Set((Array.isArray(log.tags) ? log.tags : []).filter(tag => ALLOWED_TAGS.has(tag)))],
    note: cleanText(log.note, 500),
    quickNaps,
    sleepEvents,
    _updatedAt: clientUpdatedAt
  };
}

export function sanitizeDeletedDiaryDay(value, now = new Date()) {
  const item = value && typeof value === 'object' ? value : {};
  const date = String(item.date || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return { date, _updatedAt: sanitizeClientTimestamp(item._updatedAt, now) };
}

function sanitizeClientTimestamp(value, now) {
  const parsed = new Date(value || 0);
  if (Number.isNaN(parsed.getTime())) return now.toISOString();
  if (parsed.getTime() > now.getTime() + 5 * 60_000) return now.toISOString();
  if (parsed.getTime() < new Date('2020-01-01T00:00:00Z').getTime()) return now.toISOString();
  return parsed.toISOString();
}

function safeIso(value) {
  const parsed = new Date(value || 0);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString();
}

function cleanText(value, max) {
  return String(value || '').replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, max);
}

function clampNumber(value, min, max) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.round(parsed))) : min;
}
