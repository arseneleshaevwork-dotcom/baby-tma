// Lightweight analytics client for Telegram Mini App events.

const ANALYTICS_QUEUE_KEY = 'babymode_analytics_queue';
const ANALYTICS_CLIENT_KEY = 'babymode_client_id';
const BABY_NAME_KEY = 'babymode_baby_name';
const BABY_BIRTHDATE_KEY = 'babymode_baby_birthdate';
const BABY_AGE_KEY = 'babymode_last_age';
const DEFAULT_ENDPOINT = '';
const MAX_QUEUE = 200;

function normalizeBabyProfile(profile = {}) {
  const name = String(profile.name || '').trim();
  const birthdate = String(profile.birthdate || '').trim();
  const ageValue = profile.ageMonths === '' || profile.ageMonths === null || profile.ageMonths === undefined
    ? null
    : parseInt(profile.ageMonths, 10);

  return {
    name,
    birthdate,
    ageMonths: Number.isFinite(ageValue) ? ageValue : null
  };
}

function createAnalytics(env = {}) {
  const storage = env.storage || (typeof localStorage !== 'undefined' ? localStorage : null);
  const endpoint = env.endpoint !== undefined
    ? env.endpoint
    : (typeof window !== 'undefined' ? (window.BABY_ANALYTICS_ENDPOINT || DEFAULT_ENDPOINT) : DEFAULT_ENDPOINT);
  const now = env.now || (() => Date.now());
  const randomId = env.randomId || makeId;
  const fetcher = env.fetch || (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : null);
  const telegram = env.telegram || (typeof window !== 'undefined' ? window.Telegram : null);
  const locationRef = env.location || (typeof window !== 'undefined' ? window.location : null);
  const navigatorRef = env.navigator || (typeof navigator !== 'undefined' ? navigator : null);
  const sessionId = randomId();

  function getClientId() {
    if (!storage) return randomId();
    let clientId = storage.getItem(ANALYTICS_CLIENT_KEY);
    if (!clientId) {
      clientId = randomId();
      storage.setItem(ANALYTICS_CLIENT_KEY, clientId);
    }
    return clientId;
  }

  function getBabyProfile() {
    if (!storage) return normalizeBabyProfile();
    return normalizeBabyProfile({
      name: storage.getItem(BABY_NAME_KEY) || '',
      birthdate: storage.getItem(BABY_BIRTHDATE_KEY) || '',
      ageMonths: storage.getItem(BABY_AGE_KEY) || ''
    });
  }

  function saveBabyProfile(profile) {
    if (!storage) return normalizeBabyProfile(profile);
    const normalized = normalizeBabyProfile(profile);
    if (normalized.name) storage.setItem(BABY_NAME_KEY, normalized.name);
    if (normalized.birthdate) storage.setItem(BABY_BIRTHDATE_KEY, normalized.birthdate);
    if (normalized.ageMonths !== null) storage.setItem(BABY_AGE_KEY, String(normalized.ageMonths));
    track('profile_saved', { has_name: !!normalized.name, has_birthdate: !!normalized.birthdate });
    return normalized;
  }

  function track(event, payload = {}) {
    if (!event || !storage) return null;
    const entry = buildEvent(event, payload);
    const queue = readQueue();
    queue.push(entry);
    writeQueue(queue.slice(-MAX_QUEUE));
    return entry;
  }

  async function flush() {
    if (!endpoint || !fetcher || !storage) return false;
    const queue = readQueue();
    if (!queue.length) return true;

    const response = await fetcher(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events: queue })
    });

    if (!response || !response.ok) return false;
    writeQueue([]);
    return true;
  }

  function buildEvent(event, payload) {
    const tgUser = telegram && telegram.WebApp && telegram.WebApp.initDataUnsafe
      ? telegram.WebApp.initDataUnsafe.user || null
      : null;

    return {
      id: randomId(),
      event,
      payload,
      client_id: getClientId(),
      session_id: sessionId,
      telegram_user: tgUser ? {
        id: tgUser.id,
        username: tgUser.username || '',
        first_name: tgUser.first_name || '',
        language_code: tgUser.language_code || ''
      } : null,
      baby: getBabyProfile(),
      page: locationRef ? locationRef.href : '',
      user_agent: navigatorRef ? navigatorRef.userAgent || '' : '',
      language: navigatorRef ? navigatorRef.language || '' : '',
      created_at: new Date(now()).toISOString()
    };
  }

  function readQueue() {
    try { return JSON.parse(storage.getItem(ANALYTICS_QUEUE_KEY) || '[]'); }
    catch (e) { return []; }
  }

  function writeQueue(queue) {
    storage.setItem(ANALYTICS_QUEUE_KEY, JSON.stringify(queue));
  }

  return { track, flush, getBabyProfile, saveBabyProfile, _readQueue: readQueue };
}

function makeId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
}

if (typeof window !== 'undefined') {
  window.BabyAnalytics = createAnalytics();
  window.addEventListener('pagehide', () => window.BabyAnalytics.flush());
  setInterval(() => window.BabyAnalytics.flush(), 15000);
}

if (typeof module !== 'undefined') {
  module.exports = { createAnalytics, normalizeBabyProfile };
}
