(function(global) {
  'use strict';

  const TOMBSTONES_KEY = 'babymode_diary_tombstones_v1';
  const SETTINGS_UPDATED_KEY = 'babymode_settings_updated_at_v1';
  const PROFILE_UPDATED_KEY = 'babymode_profile_updated_at_v1';
  const BASELINE_TIMESTAMP = '2020-01-01T00:00:00.000Z';
  let syncTimer = null;
  let syncing = false;
  let bootstrapped = false;

  function schedule(delay) {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => syncNow(), Number(delay) || 1200);
  }

  async function syncNow() {
    if (syncing || !global.BabyAccount?.canUseServer() || !global.BABY_SYNC_ENDPOINT) return false;
    syncing = true;
    try {
      if (!bootstrapped) {
        const pullResponse = await global.BabyAccount.request(global.BABY_SYNC_ENDPOINT, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: { action: 'pull' }
        });
        const pullData = await pullResponse.json().catch(() => ({}));
        if (!pullResponse.ok || !pullData.ok) return false;
        applySnapshot(pullData);
        bootstrapped = true;
      }
      const response = await global.BabyAccount.request(global.BABY_SYNC_ENDPOINT, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: buildPayload()
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) return false;
      applySnapshot(data);
      if (global.BabyAnalytics) global.BabyAnalytics.track('cloud_sync', { diary_days: Array.isArray(data.diary) ? data.diary.length : 0 });
      return true;
    } catch (_) {
      return false;
    } finally {
      syncing = false;
    }
  }

  function buildPayload() {
    const now = new Date().toISOString();
    let diary = [];
    let todaySchedule = null;
    try { diary = JSON.parse(localStorage.getItem('babymode_logs') || '[]'); } catch (_) {}
    try { todaySchedule = JSON.parse(localStorage.getItem('babymode_today_schedule_v1') || 'null'); } catch (_) {}
    return {
      action: 'push',
      profile: {
        name: localStorage.getItem('babymode_baby_name') || '',
        birthdate: localStorage.getItem('babymode_baby_birthdate') || '',
        age_months: localStorage.getItem('babymode_last_age') || ''
      },
      profile_updated_at: localStorage.getItem(PROFILE_UPDATED_KEY) || BASELINE_TIMESTAMP,
      settings: {
        wake_time: localStorage.getItem('babymode_wake_time') || '',
        feed_type: localStorage.getItem('babymode_feed_type') || '',
        last_age: localStorage.getItem('babymode_last_age') || '',
        notifications: localStorage.getItem('babymode_notif_enabled') || '',
        ai_consent: localStorage.getItem('babymode_ai_consent_v2') || '',
        today_schedule: todaySchedule
      },
      settings_updated_at: localStorage.getItem(SETTINGS_UPDATED_KEY) || BASELINE_TIMESTAMP,
      diary: diary.map(log => ({ ...log, _updatedAt: log._updatedAt || now })),
      deleted_diary_days: readTombstones()
    };
  }

  function applySnapshot(data) {
    applyProfile(data.profile, data.profile_updated_at);
    applySettings(data.settings, data.settings_updated_at);
    const local = readDiary();
    const remote = Array.isArray(data.diary) ? data.diary : [];
    const deleted = mergeTombstones(readTombstones(), data.deleted_diary_days || []);
    const tombstoneMap = new Map(deleted.map(item => [item.date, Date.parse(item._updatedAt) || 0]));
    const merged = new Map();
    [...local, ...remote].forEach(log => {
      if (!log?.date) return;
      const updated = Date.parse(log._updatedAt) || 0;
      if (updated <= (tombstoneMap.get(log.date) || 0)) return;
      const current = merged.get(log.date);
      if (!current || updated >= (Date.parse(current._updatedAt) || 0)) merged.set(log.date, log);
    });
    localStorage.setItem('babymode_logs', JSON.stringify([...merged.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)))));
    localStorage.setItem(TOMBSTONES_KEY, JSON.stringify(deleted.slice(-400)));
    if (typeof global.renderTracker === 'function') global.renderTracker();
    if (typeof global.renderProfilePage === 'function') global.renderProfilePage();
    if (typeof global.renderTodayPlan === 'function') global.renderTodayPlan();
  }

  function applyProfile(profile, updatedAt) {
    if (!profile) return;
    const remoteAt = Date.parse(updatedAt || profile.updated_at || 0) || 0;
    const localAt = Date.parse(localStorage.getItem(PROFILE_UPDATED_KEY) || 0) || 0;
    if (remoteAt < localAt) return;
    if (profile.name) localStorage.setItem('babymode_baby_name', profile.name);
    else localStorage.removeItem('babymode_baby_name');
    if (profile.birthdate) localStorage.setItem('babymode_baby_birthdate', profile.birthdate);
    else localStorage.removeItem('babymode_baby_birthdate');
    if (profile.age_months !== null && profile.age_months !== undefined) localStorage.setItem('babymode_last_age', String(profile.age_months));
    if (updatedAt || profile.updated_at) localStorage.setItem(PROFILE_UPDATED_KEY, updatedAt || profile.updated_at);
    if (typeof global._applyBabyName === 'function') global._applyBabyName(profile.name || '');
  }

  function applySettings(settings, updatedAt) {
    const remoteAt = Date.parse(updatedAt || 0) || 0;
    const localAt = Date.parse(localStorage.getItem(SETTINGS_UPDATED_KEY) || 0) || 0;
    if (!settings || remoteAt < localAt) return;
    if (settings.wake_time) localStorage.setItem('babymode_wake_time', settings.wake_time);
    if (settings.feed_type) localStorage.setItem('babymode_feed_type', settings.feed_type);
    if (settings.last_age !== null && settings.last_age !== undefined) localStorage.setItem('babymode_last_age', String(settings.last_age));
    if (settings.notifications !== undefined) localStorage.setItem('babymode_notif_enabled', settings.notifications ? '1' : '0');
    if (settings.ai_consent === 'granted') localStorage.setItem('babymode_ai_consent_v2', 'granted');
    if (settings.today_schedule) localStorage.setItem('babymode_today_schedule_v1', JSON.stringify(settings.today_schedule));
    if (updatedAt) localStorage.setItem(SETTINGS_UPDATED_KEY, updatedAt);
  }

  function markSettingsChanged() {
    localStorage.setItem(SETTINGS_UPDATED_KEY, new Date().toISOString());
    schedule();
  }

  function markProfileChanged() {
    localStorage.setItem(PROFILE_UPDATED_KEY, new Date().toISOString());
    schedule();
  }

  function readDiary() {
    try { return JSON.parse(localStorage.getItem('babymode_logs') || '[]'); }
    catch (_) { return []; }
  }

  function readTombstones() {
    try { return JSON.parse(localStorage.getItem(TOMBSTONES_KEY) || '[]'); }
    catch (_) { return []; }
  }

  function recordDeletedDates(items) {
    const merged = mergeTombstones(readTombstones(), items || []);
    localStorage.setItem(TOMBSTONES_KEY, JSON.stringify(merged.slice(-400)));
    schedule();
  }

  function mergeTombstones(left, right) {
    const merged = new Map();
    [...(left || []), ...(right || [])].forEach(item => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(item?.date || ''))) return;
      const current = merged.get(item.date);
      if (!current || Date.parse(item._updatedAt) >= Date.parse(current._updatedAt)) merged.set(item.date, item);
    });
    return [...merged.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }

  global.BabyCloudSync = { syncNow, schedule, markSettingsChanged, markProfileChanged, recordDeletedDates };
  global.addEventListener('baby-account-ready', event => { if (event.detail?.authenticated) syncNow(); });
  global.addEventListener('baby-account-authenticated', () => syncNow());
  global.addEventListener('online', () => syncNow());
})(window);
