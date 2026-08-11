// ─── Smart Sleep Diary v2 ─────────────────────────────────────────────────────
// Tags, AI analysis after 3+ days, recovery day detection

const TRACKER_KEY = 'babymode_logs';
const QUICK_SLEEP_KEY = 'babymode_quick_sleep_start';
const LAST_DIARY_MUTATION_KEY = 'babymode_last_diary_mutation_v1';
let trackerPeriod = 'week';
let moodSel = '😊';
let trackerChartInst = null;
let selectedTags = new Set();

const SLEEP_TAGS = [
  { id: 'long_soothe',  label: '⏳ Долгое укладывание', color: '#f97316' },
  { id: 'cry_sleep',    label: '😢 Плач при засыпании', color: '#ef4444' },
  { id: 'cry_wake',     label: '😭 Плач при пробуждении', color: '#ef4444' },
  { id: 'illness',      label: '🤒 Болезнь', color: '#f97316' },
  { id: 'travel',       label: '✈️ Путешествие', color: '#8b5cf6' },
  { id: 'teeth',        label: '🦷 Зубы', color: '#f59e0b' },
  { id: 'regression',   label: '📉 Регресс', color: '#ec4899' },
  { id: 'slept_well',   label: '✨ Спал отлично', color: '#22c55e' },
];

function getLogs() {
  try { return JSON.parse(localStorage.getItem(TRACKER_KEY) || '[]'); } catch(e) { return []; }
}
function saveLogs(logs) {
  const next = Array.isArray(logs) ? logs : [];
  let previous = [];
  try { previous = JSON.parse(localStorage.getItem(TRACKER_KEY) || '[]'); } catch (_) {}
  const previousByDate = new Map(previous.filter(item => item?.date).map(item => [item.date, item]));
  const now = new Date().toISOString();
  next.forEach(log => {
    if (!log?.date) return;
    const before = previousByDate.get(log.date);
    const changed = stableDiaryValue(log) !== stableDiaryValue(before);
    log._updatedAt = changed ? now : (log._updatedAt || before?._updatedAt || now);
  });
  const nextDates = new Set(next.map(item => item?.date).filter(Boolean));
  const deleted = previous.filter(item => item?.date && !nextDates.has(item.date))
    .map(item => ({ date: item.date, _updatedAt: now }));
  localStorage.setItem(TRACKER_KEY, JSON.stringify(next));
  if (deleted.length && window.BabyCloudSync) BabyCloudSync.recordDeletedDates(deleted);
  if (window.BabyCloudSync) BabyCloudSync.schedule();
}

function stableDiaryValue(log) {
  if (!log || typeof log !== 'object') return '';
  const copy = { ...log };
  delete copy._updatedAt;
  try { return JSON.stringify(copy); } catch (_) { return ''; }
}

function rememberDiaryMutation(logs, label) {
  localStorage.setItem(LAST_DIARY_MUTATION_KEY, JSON.stringify({
    at: Date.now(),
    label: String(label || 'изменение'),
    logs: Array.isArray(logs) ? logs : []
  }));
}

function getDiaryUndoState(now = Date.now()) {
  try {
    const state = JSON.parse(localStorage.getItem(LAST_DIARY_MUTATION_KEY) || 'null');
    if (!state || !Array.isArray(state.logs) || !Number.isFinite(state.at)) return null;
    return now - state.at <= 30 * 60000 ? state : null;
  } catch (_) {
    return null;
  }
}

function renderUndoDiaryButton() {
  const button = document.getElementById('undoDiaryBtn');
  if (!button) return;
  const state = getDiaryUndoState();
  button.style.display = state ? 'block' : 'none';
  if (state) button.textContent = `↶ Отменить: ${state.label}`;
}

function undoLastDiaryAction() {
  const state = getDiaryUndoState();
  if (!state) { localStorage.removeItem(LAST_DIARY_MUTATION_KEY); renderUndoDiaryButton(); showToast('Отменять уже нечего'); return; }
  saveLogs(state.logs);
  localStorage.removeItem(LAST_DIARY_MUTATION_KEY);
  renderTracker();
  if (typeof renderTodayPlan === 'function') renderTodayPlan();
  showToast('Последнее действие отменено');
}

function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function hm(date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function toMin(t) {
  if (!t) return 0;
  const [h, m] = t.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return h * 60 + m;
}

function calcDuration(start, end) {
  if (!start || !end) return 0;
  const startMin = toMin(start);
  const endMin = toMin(end);
  if (startMin === endMin) return 0;
  return endMin > startMin ? endMin - startMin : (24 * 60 - startMin) + endMin;
}

function calcDayNaps(pairs) {
  return (pairs || []).reduce((sum, pair) => sum + calcDuration(pair[0], pair[1]), 0);
}

function calcNightLen(bed, wake, awakeMin = 0) {
  return Math.max(0, calcDuration(bed, wake) - Math.max(0, Number(awakeMin) || 0));
}

function sameNap(quickNap, pair) {
  return quickNap && pair && quickNap.start === pair[0] && quickNap.end === pair[1];
}

function classifySleepEvent(start, end, durationMin) {
  const duration = Math.max(0, Number(durationMin) || 0);
  const startHour = start instanceof Date ? start.getHours() : 12;
  const crossesDate = start instanceof Date && end instanceof Date
    ? localDateKey(start) !== localDateKey(end)
    : false;
  return crossesDate || duration >= 240 || ((startHour >= 18 || startHour < 5) && duration >= 120) ? 'night' : 'nap';
}

function mergeManualLog(existing = {}, manual = {}) {
  const quickNaps = Array.isArray(existing.quickNaps) ? existing.quickNaps : [];
  const manualPairs = [
    [manual.nap1s, manual.nap1e],
    [manual.nap2s, manual.nap2e],
    [manual.nap3s, manual.nap3e]
  ];
  const manualDayNaps = calcDayNaps(manualPairs);
  const quickDayNaps = quickNaps.reduce((sum, nap) => {
    const alreadyEntered = manualPairs.some(pair => sameNap(nap, pair));
    return sum + (alreadyEntered ? 0 : (Number(nap.dur) || 0));
  }, 0);
  const selected = Array.isArray(manual.selectedTags) ? manual.selectedTags : [];
  const existingTags = Array.isArray(existing.tags) ? existing.tags : [];
  const tags = [...new Set([...existingTags, ...selected])];
  const note = String(manual.note || '').trim() || existing.note || '';

  return {
    ...existing,
    date: manual.date,
    wake: manual.wake,
    bed: manual.bed,
    nap1s: manual.nap1s,
    nap1e: manual.nap1e,
    nap2s: manual.nap2s,
    nap2e: manual.nap2e,
    nap3s: manual.nap3s,
    nap3e: manual.nap3e,
    nightAwakeMin: Math.max(0, Number(manual.nightAwakeMin) || 0),
    dayNaps: manualDayNaps + quickDayNaps,
    nightLen: calcNightLen(manual.bed, manual.wake, manual.nightAwakeMin),
    mood: manual.mood,
    tags,
    note,
    quickNaps,
    nightWakings: Number(existing.nightWakings || 0)
  };
}

function getOrCreateLogForDate(logs, date, defaults = {}) {
  let log = logs.find(l => l.date === date);
  if (!log) {
    const wake = document.getElementById('lgWake')?.value || document.getElementById('wakeTime')?.value || '07:00';
    const bed = document.getElementById('lgBed')?.value || '19:30';
    log = {
      date,
      wake: defaults.wake || wake,
      bed: defaults.bed || bed,
      nap1s: '', nap1e: '', nap2s: '', nap2e: '', nap3s: '', nap3e: '',
      dayNaps: 0,
      nightLen: calcNightLen(bed, wake),
      nightAwakeMin: 0,
      mood: moodSel,
      tags: [],
      note: '',
      quickNaps: [],
      sleepEvents: [],
      nightWakings: 0
    };
    logs.push(log);
  }
  if (!Array.isArray(log.quickNaps)) log.quickNaps = [];
  if (!Array.isArray(log.sleepEvents)) log.sleepEvents = [];
  if (!Array.isArray(log.tags)) log.tags = [];
  return log;
}

function getOrCreateTodayLog(logs) {
  return getOrCreateLogForDate(logs, localDateKey());
}

function startQuickSleep() {
  if (parseInt(localStorage.getItem(QUICK_SLEEP_KEY) || '0')) {
    showToast('Сон уже идёт');
    return;
  }
  localStorage.setItem(QUICK_SLEEP_KEY, String(Date.now()));
  if (window.BabyAnalytics) BabyAnalytics.track('sleep_started');
  renderQuickSleepControls();
  if (typeof _updateFab === 'function') _updateFab();
  showToast('😴 Сон начат');
}

function finishQuickSleep() {
  const started = parseInt(localStorage.getItem(QUICK_SLEEP_KEY) || '0');
  if (!started) { showToast('Сначала нажмите “Уснул”'); return; }

  const start = new Date(started);
  const end = new Date();
  const dur = Math.max(1, Math.round((end - start) / 60000));
  const kind = classifySleepEvent(start, end, dur);
  const logs = getLogs();
  rememberDiaryMutation(logs, 'запись сна');
  const log = getOrCreateLogForDate(logs, localDateKey(start), {
    bed: hm(start), wake: hm(end)
  });

  log.sleepEvents.push({
    startAt: start.toISOString(),
    endAt: end.toISOString(),
    start: hm(start),
    end: hm(end),
    dur,
    kind
  });
  if (kind === 'night') {
    log.bed = hm(start);
    log.wake = hm(end);
    log.nightLen = calcNightLen(log.bed, log.wake, log.nightAwakeMin);
  } else {
    log.quickNaps.push({ start: hm(start), end: hm(end), dur });
    log.dayNaps = (log.dayNaps || 0) + dur;
  }

  saveLogs(logs);
  localStorage.removeItem(QUICK_SLEEP_KEY);
  if (window.BabyAnalytics) BabyAnalytics.track('sleep_finished', { duration_min: dur, kind });
  renderQuickSleepControls();
  if (typeof _updateFab === 'function') _updateFab();
  renderTracker();
  if (typeof renderTodayPlan === 'function') renderTodayPlan();
  showToast(`${kind === 'night' ? '🌙 Ночной сон' : '🌤 Дневной сон'} записан: ${dur} мин`);
}

function quickSleepTag(tag) {
  const logs = getLogs();
  rememberDiaryMutation(logs, tag === 'night_wake' ? 'ночное пробуждение' : 'отметку дня');
  const log = getOrCreateTodayLog(logs);
  if (tag === 'night_wake') {
    log.nightWakings = (log.nightWakings || 0) + 1;
    if (!log.tags.includes('cry_wake')) log.tags.push('cry_wake');
    showToast('🌙 Ночное пробуждение записано');
  } else if (tag && !log.tags.includes(tag)) {
    log.tags.push(tag);
    showToast('🏷 Отметка добавлена');
  }
  saveLogs(logs);
  if (window.BabyAnalytics) BabyAnalytics.track('quick_tag_added', { tag });
  renderTracker();
  if (typeof renderTodayPlan === 'function') renderTodayPlan();
}

function renderQuickSleepControls() {
  renderUndoDiaryButton();
  const status = document.getElementById('quickSleepStatus');
  const timer = document.getElementById('quickSleepTimer');
  const startButton = document.getElementById('qscStartBtn');
  const finishButton = document.getElementById('qscFinishBtn');
  if (!status || !timer) return;

  const started = parseInt(localStorage.getItem(QUICK_SLEEP_KEY) || '0');
  if (startButton) startButton.disabled = Boolean(started);
  if (finishButton) finishButton.disabled = !started;
  if (!started) {
    status.textContent = 'Сон не запущен';
    timer.textContent = '—';
    return;
  }

  const mins = Math.max(0, Math.round((Date.now() - started) / 60000));
  status.textContent = `Спит с ${hm(new Date(started))}`;
  timer.textContent = mins < 60 ? `${mins} мин` : `${Math.floor(mins / 60)}ч ${mins % 60}м`;
}

if (typeof window !== 'undefined') {
  setInterval(renderQuickSleepControls, 60000);
}

function toggleTag(id) {
  if (selectedTags.has(id)) selectedTags.delete(id);
  else selectedTags.add(id);
  renderTagButtons();
  if (typeof hapticLight === 'function') hapticLight();
}

function renderTagButtons() {
  const container = document.getElementById('sleepTags');
  if (!container) return;
  container.innerHTML = SLEEP_TAGS.map(t => `
    <button class="sleep-tag ${selectedTags.has(t.id) ? 'active' : ''}"
      onclick="toggleTag('${t.id}')" style="${selectedTags.has(t.id) ? `--tag-color:${t.color}` : ''}">
      ${t.label}
    </button>
  `).join('');
}

function selectMood(m, el) {
  moodSel = m;
  document.querySelectorAll('.mood-btn').forEach(b => b.classList.remove('selected'));
  el.classList.add('selected');
}

function saveLog() {
  const wake  = document.getElementById('lgWake').value;
  const nap1s = document.getElementById('lgNap1S').value;
  const nap1e = document.getElementById('lgNap1E').value;
  const nap2s = document.getElementById('lgNap2S').value;
  const nap2e = document.getElementById('lgNap2E').value;
  const nap3s = document.getElementById('lgNap3S') ? document.getElementById('lgNap3S').value : '';
  const nap3e = document.getElementById('lgNap3E') ? document.getElementById('lgNap3E').value : '';
  const bed   = document.getElementById('lgBed').value;
  const nightAwakeMin = document.getElementById('lgNightAwake')?.value || 0;
  const note  = document.getElementById('lgNote').value.trim();

  if (!wake || !bed) { showToast('Укажите время подъёма и укладывания'); return; }

  const today = localDateKey();
  const logs = getLogs();
  rememberDiaryMutation(logs, 'сохранение дня');
  const existing = logs.find(l => l.date === today) || {};
  const log = mergeManualLog(existing, {
    date: today, wake, bed,
    nap1s, nap1e, nap2s, nap2e, nap3s, nap3e, nightAwakeMin,
    selectedTags: [...selectedTags],
    mood: moodSel,
    note
  });
  const nextLogs = logs.filter(l => l.date !== today);
  nextLogs.push(log);
  nextLogs.sort((a, b) => a.date.localeCompare(b.date));
  saveLogs(nextLogs);
  if (window.BabyAnalytics) {
    BabyAnalytics.track('diary_saved', {
      night_min: log.nightLen,
      day_naps_min: log.dayNaps,
      tags_count: log.tags.length,
      has_note: !!note
    });
  }

  selectedTags.clear();
  renderTagButtons();
  showToast('✅ День сохранён!');
  if (typeof hapticSuccess === 'function') hapticSuccess();
  renderTracker();
  if (typeof renderTodayPlan === 'function') renderTodayPlan();

  // Check if we have 3+ days to run analysis
  const allLogs = getLogs();
  if (allLogs.length >= 3) {
    setTimeout(() => analyzeAndSuggest(allLogs), 600);
  }
}

// ─── AI Analysis ─────────────────────────────────────────────────────────────
function analyzeAndSuggest(logs) {
  const age = parseInt(localStorage.getItem('babymode_last_age') || document.getElementById('ageMonths')?.value || '6');
  const hasPremium = typeof SUB === 'undefined' || SUB.can('aiAnalysis');

  if (!hasPremium) {
    renderAnalysisLocked(logs, age);
    return;
  }

  if (typeof SleepIntel !== 'undefined') {
    const summary = SleepIntel.summarizeSleepLogs(logs, age);
    renderAnalysis(SleepIntel.buildSleepSuggestions(summary, age), summary);
    return;
  }

  const recent = logs.slice(-5);
  const avgNight = recent.reduce((s,l) => s + l.nightLen, 0) / recent.length;
  const suggestions = [];
  if (avgNight < 600) {
    suggestions.push({
      icon: '🌙',
      type: 'warning',
      title: 'Ночной сон ниже ориентира',
      text: 'Попробуйте уложить малыша на 15-20 мин раньше и сохранить спокойный вечерний ритуал.',
      action: 'recovery'
    });
  }
  if (suggestions.length > 0) renderAnalysis(suggestions);
}

function renderAnalysis(suggestions, summary) {
  const block = document.getElementById('analysisBlock');
  if (!block) return;
  const age = parseInt(localStorage.getItem('babymode_last_age') || document.getElementById('ageMonths')?.value || '6');
  const plan = summary && typeof SleepIntel !== 'undefined'
    ? SleepIntel.buildTomorrowPlan(summary, age, _getTomorrowPlanContext())
    : null;
  const calendar = typeof SleepIntel !== 'undefined' ? SleepIntel.getSleepCalendar(age) : [];
  const weekly = window.BabyCoach && typeof SleepIntel !== 'undefined'
    ? BabyCoach.buildWeeklyReview(getLogs(), age, SleepIntel)
    : null;

  block.innerHTML = `
    <div class="analysis-header">
      <span class="analysis-icon">🤖</span>
      <span>Персональный анализ</span>
      <span class="analysis-badge">${suggestions.length} совет${suggestions.length > 1 ? 'а' : ''}</span>
    </div>
    ${summary ? `
      <div class="sleep-debt-card">
        <div>
          <div class="sdc-label">Недосып за ${summary.recent.length} дн.</div>
          <div class="sdc-value">${summary.sleepDebt ? (summary.sleepDebt / 60).toFixed(1) + 'ч' : 'нет'}</div>
        </div>
        <div class="sdc-meta">
          Норма ${Math.round(summary.norms.totalMin / 60 * 10) / 10}ч/сут · факт ${(summary.avgTotal / 60).toFixed(1)}ч
        </div>
      </div>
    ` : ''}
    ${weekly ? renderWeeklyReview(weekly) : ''}
    ${calendar.length ? renderSleepCalendar(calendar) : ''}
    ${plan ? renderTomorrowPlan(plan) : ''}
    ${suggestions.map(s => `
      <div class="analysis-card analysis-${s.type}">
        <div class="analysis-card-header">
          <span>${s.icon}</span>
          <strong>${s.title}</strong>
        </div>
        <p>${s.text}</p>
        ${s.action === 'recovery' ? `
          <button class="recovery-btn" onclick="suggestRecoveryDay();hapticLight()">
            📅 Предложить восстановительный день
          </button>
        ` : ''}
      </div>
    `).join('')}
  `;
  block.style.display = 'block';
}

function renderWeeklyReview(review) {
  return `
    <div class="weekly-review-card">
      <div class="weekly-review-head"><span>Итог периода</span><strong>${review.title}</strong></div>
      <div class="weekly-review-trend">${review.trend}</div>
      <div class="weekly-review-stats">
        <span><strong>${review.night}</strong> ночью</span>
        <span><strong>${review.day}</strong> днём</span>
        <span><strong>${review.sleepDebt}</strong> недосып</span>
      </div>
      <div class="weekly-review-focus"><small>Главный фокус</small><strong>${review.focus}</strong><p>${review.reason}</p></div>
      <button onclick="openWeeklyReviewInChat();hapticLight()">Обсудить итог с помощником</button>
    </div>`;
}

function openWeeklyReviewInChat() {
  if (window.BabyAnalytics) BabyAnalytics.track('weekly_review_opened', { source: 'diary' });
  if (typeof goPage === 'function') goPage('chat', document.getElementById('bn-chat'));
  if (typeof chatQuickAction === 'function') setTimeout(() => chatQuickAction('weekly'), 100);
}

function renderSleepCalendar(calendar) {
  const labels = { now: 'сейчас', soon: 'скоро', later: 'позже' };
  const items = calendar.map(item => `
    <div class="sc-item sc-${item.status}">
      <div class="sc-icon">${item.icon}</div>
      <div class="sc-body">
        <div class="sc-top">
          <strong>${item.title}</strong>
          <span>${labels[item.status]}</span>
        </div>
        <div class="sc-label">${item.label}</div>
        <p>${item.text}</p>
      </div>
    </div>
  `).join('');

  return `
    <div class="sleep-calendar-card">
      <div class="sc-title">📆 Календарь сна</div>
      ${items}
    </div>
  `;
}

function _getTomorrowPlanContext() {
  const logs = getLogs();
  const last = logs[logs.length - 1] || {};
  return {
    wake: last.wake || document.getElementById('wakeTime')?.value || '07:00',
    bedtime: last.bed || '20:00'
  };
}

function renderTomorrowPlan(plan) {
  const rows = plan.schedule.map(item => `
    <div class="tp-row">
      <span>${item.label}</span>
      <strong>${item.value}</strong>
    </div>
  `).join('');
  const rules = plan.rules.map(rule => `<li>${rule}</li>`).join('');

  return `
    <div class="tomorrow-plan-card">
      <div class="tp-head">
        <div class="tp-icon">${plan.icon}</div>
        <div>
          <div class="tp-kicker">План на завтра</div>
          <div class="tp-title">${plan.title}</div>
        </div>
      </div>
      <div class="tp-goal">${plan.goal}</div>
      <p class="tp-reason">${plan.reason}</p>
      <div class="tp-schedule">${rows}</div>
      <ul class="tp-rules">${rules}</ul>
      <button class="recovery-btn" onclick="applyTomorrowPlan();hapticSuccess()">
        📅 Применить к режиму
      </button>
    </div>
  `;
}

function applyTomorrowPlan() {
  const age = parseInt(localStorage.getItem('babymode_last_age') || document.getElementById('ageMonths')?.value || '6');
  const summary = typeof SleepIntel !== 'undefined'
    ? SleepIntel.summarizeSleepLogs(getLogs(), age)
    : null;
  if (!summary) return;

  const plan = SleepIntel.buildTomorrowPlan(summary, age, _getTomorrowPlanContext());
  localStorage.setItem('babymode_tomorrow_plan', JSON.stringify(plan));

  if (typeof applyPlanToGenerator === 'function') {
    applyPlanToGenerator(plan);
  }
}

function renderAnalysisLocked(logs, age) {
  const block = document.getElementById('analysisBlock');
  if (!block) return;
  const summary = typeof SleepIntel !== 'undefined'
    ? SleepIntel.summarizeSleepLogs(logs, age)
    : null;

  block.innerHTML = `
    <div class="analysis-header">
      <span class="analysis-icon">🤖</span>
      <span>Персональный анализ</span>
      <span class="analysis-badge">Premium</span>
    </div>
    <div class="analysis-card analysis-info">
      <div class="analysis-card-header">
        <span>🌙</span>
        <strong>${summary && summary.sleepDebt ? 'Вижу признаки недосыпа' : 'Закономерность найдена'}</strong>
      </div>
      <p>${summary && summary.sleepDebt
        ? `По последним записям накопилось около ${(summary.sleepDebt / 60).toFixed(1)}ч недосыпа. Premium покажет причину, календарь скачков и план на завтра.`
        : 'После 3 записей дневника Premium показывает паттерны сна, календарь скачков и план на завтра.'}</p>
      <button class="recovery-btn" onclick="goPage('premium',null);renderPremiumPage();hapticLight()">
        ⭐ Открыть Premium-анализ
      </button>
    </div>
  `;
  block.style.display = 'block';
}

function suggestRecoveryDay() {
  const tg = window.Telegram && window.Telegram.WebApp;
  if (tg && tg.showPopup) {
    tg.showPopup({
      title: '😴 Восстановительный день',
      message: 'Перенесите подъём на 30 мин позже и добавьте 15 мин к каждому дневному сну. Это поможет компенсировать дефицит сна за 1–2 дня.',
      buttons: [
        { id: 'apply', type: 'default', text: 'Понятно!' },
      ]
    }, () => {});
  } else {
    showToast('😴 Перенесите подъём на 30 мин позже и добавьте 15 мин к дневным снам');
  }
}

function shareLog() {
  const logs = getLogs();
  if (!logs.length) { showToast('Нет данных для отправки'); return; }
  if (typeof SUB !== 'undefined' && !SUB.can('shareCard')) {
    SUB.requirePremium('shareCard', function(){});
    return;
  }

  openFamilyReportModal();
}

function buildPdfReportModel(logs, options = {}) {
  const days = Math.min(30, Math.max(1, Number(options.days) || 7));
  const recent = (Array.isArray(logs) ? logs : [])
    .slice().sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')))
    .slice(-days);
  const average = key => recent.length
    ? Math.round(recent.reduce((sum, log) => sum + Math.max(0, Number(log[key]) || 0), 0) / recent.length)
    : 0;
  return {
    days,
    babyName: String(options.babyName || '').trim().slice(0, 40),
    age: Math.max(0, Number(options.age) || 0),
    generatedAt: options.generatedAt || new Date().toISOString(),
    avgNight: average('nightLen'),
    avgDay: average('dayNaps'),
    avgTotal: average('nightLen') + average('dayNaps'),
    rows: recent.map(log => ({
      date: String(log.date || ''),
      wake: String(log.wake || '—'),
      bed: String(log.bed || '—'),
      nightMin: Math.max(0, Number(log.nightLen) || 0),
      dayMin: Math.max(0, Number(log.dayNaps) || 0),
      nightWakings: Math.max(0, Number(log.nightWakings) || 0),
      tags: Array.isArray(log.tags) ? log.tags.slice(0, 3) : []
    }))
  };
}

function openPdfReportMenu() {
  const logs = getLogs();
  if (!logs.length) { showToast('Нет данных для отчёта'); return; }
  if (typeof SUB !== 'undefined' && !SUB.can('shareCard')) {
    SUB.requirePremium('shareCard', function(){});
    return;
  }
  let modal = document.getElementById('pdfReportModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'pdfReportModal';
    document.body.appendChild(modal);
  }
  modal.className = 'family-report-modal show';
  modal.innerHTML = `
    <div class="frm-sheet pdf-report-sheet">
      <div class="frm-handle"></div>
      <div class="frm-title">PDF-отчёт о сне</div>
      <div class="frm-sub">Удобно сохранить себе или отправить консультанту</div>
      <div class="pdf-periods">
        <button onclick="exportPdfReport(7)"><strong>7 дней</strong><span>Короткий итог</span></button>
        <button onclick="exportPdfReport(14)"><strong>14 дней</strong><span>Для анализа</span></button>
        <button onclick="exportPdfReport(30)"><strong>30 дней</strong><span>Полная динамика</span></button>
      </div>
      <button class="cta-outline-btn" onclick="closePdfReportMenu();hapticLight()">Закрыть</button>
    </div>`;
}

function closePdfReportMenu() {
  document.getElementById('pdfReportModal')?.classList.remove('show');
}

async function exportPdfReport(days) {
  closePdfReportMenu();
  const model = buildPdfReportModel(getLogs(), {
    days,
    babyName: localStorage.getItem('babymode_baby_name') || '',
    age: parseInt(localStorage.getItem('babymode_last_age') || '0')
  });
  if (!model.rows.length) { showToast('Нет данных для отчёта'); return; }
  showToast('Готовлю PDF...');
  try {
    const jsPDF = await loadJsPdf();
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
    const rowsPerPage = 8;
    const pages = Math.max(1, Math.ceil(model.rows.length / rowsPerPage));
    for (let page = 0; page < pages; page++) {
      if (page) doc.addPage();
      const rows = model.rows.slice(page * rowsPerPage, (page + 1) * rowsPerPage);
      const canvas = drawPdfReportPage(model, rows, page + 1, pages);
      doc.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
    }
    doc.save(`rezhim-malysha-${localDateKey()}.pdf`);
    if (window.BabyAnalytics) BabyAnalytics.track('pdf_report_exported', { days: model.rows.length });
    showToast('PDF-отчёт готов');
  } catch (error) {
    console.error('PDF export failed:', error);
    showToast('Не удалось создать PDF. Попробуйте ещё раз при стабильном интернете.');
  }
}

function loadJsPdf() {
  if (window.jspdf?.jsPDF) return Promise.resolve(window.jspdf.jsPDF);
  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-jspdf-loader]');
    if (existing) {
      existing.addEventListener('load', () => resolve(window.jspdf.jsPDF), { once: true });
      existing.addEventListener('error', reject, { once: true });
      return;
    }
    const script = document.createElement('script');
    script.dataset.jspdfLoader = '1';
    script.src = 'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js';
    script.onload = () => window.jspdf?.jsPDF ? resolve(window.jspdf.jsPDF) : reject(new Error('jspdf_missing'));
    script.onerror = () => reject(new Error('jspdf_load_failed'));
    document.head.appendChild(script);
  });
}

function drawPdfReportPage(model, rows, page, pages) {
  const canvas = document.createElement('canvas');
  canvas.width = 1240;
  canvas.height = 1754;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fffaf7';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#3d2c3e';
  ctx.font = '800 54px Arial, sans-serif';
  ctx.fillText('Малыш в ритме', 84, 105);
  ctx.fillStyle = '#8d758f';
  ctx.font = '28px Arial, sans-serif';
  const child = model.babyName ? `${model.babyName}${model.age ? ` · ${model.age} мес.` : ''}` : (model.age ? `${model.age} мес.` : 'Дневник сна');
  ctx.fillText(`${child} · отчёт за ${model.rows.length} дн.`, 84, 150);
  ctx.textAlign = 'right';
  ctx.fillText(`${page}/${pages}`, 1156, 110);
  ctx.textAlign = 'left';

  const metrics = [
    ['Ночной сон', formatReportDuration(model.avgNight)],
    ['Дневной сон', formatReportDuration(model.avgDay)],
    ['Всего', formatReportDuration(model.avgTotal)]
  ];
  metrics.forEach((metric, index) => {
    const x = 84 + index * 362;
    ctx.fillStyle = index === 0 ? '#f1e8ff' : index === 1 ? '#e3f7ef' : '#ffe9df';
    ctx.fillRect(x, 205, 330, 150);
    ctx.fillStyle = '#756276';
    ctx.font = '24px Arial, sans-serif';
    ctx.fillText(metric[0], x + 24, 250);
    ctx.fillStyle = '#3d2c3e';
    ctx.font = '800 40px Arial, sans-serif';
    ctx.fillText(metric[1], x + 24, 314);
  });

  ctx.fillStyle = '#3d2c3e';
  ctx.font = '800 34px Arial, sans-serif';
  ctx.fillText('Записи дневника', 84, 430);
  rows.forEach((row, index) => {
    const y = 470 + index * 140;
    ctx.fillStyle = index % 2 ? '#ffffff' : '#f8f3f8';
    ctx.fillRect(84, y, 1072, 112);
    ctx.fillStyle = '#3d2c3e';
    ctx.font = '800 27px Arial, sans-serif';
    ctx.fillText(new Date(row.date + 'T12:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }), 108, y + 42);
    ctx.fillStyle = '#756276';
    ctx.font = '24px Arial, sans-serif';
    ctx.fillText(`Подъём ${row.wake} · ночь ${formatReportDuration(row.nightMin)} · день ${formatReportDuration(row.dayMin)} · сон ${row.bed}`, 108, y + 82);
    if (row.nightWakings) {
      ctx.textAlign = 'right';
      ctx.fillStyle = '#b45d64';
      ctx.fillText(`Пробуждений: ${row.nightWakings}`, 1128, y + 42);
      ctx.textAlign = 'left';
    }
  });
  ctx.fillStyle = '#8d758f';
  ctx.font = '22px Arial, sans-serif';
  ctx.fillText('Ориентиры не заменяют консультацию врача. Важны самочувствие и индивидуальные потребности ребёнка.', 84, 1670);
  return canvas;
}

function formatReportDuration(minutes) {
  const value = Math.max(0, Math.round(Number(minutes) || 0));
  return `${Math.floor(value / 60)} ч ${value % 60} мин`;
}

function openFamilyReportModal() {
  const logs = getLogs();
  if (!logs.length) { showToast('Нет данных для отправки'); return; }

  const age = parseInt(localStorage.getItem('babymode_last_age') || document.getElementById('ageMonths')?.value || '6');
  const summary = typeof SleepIntel !== 'undefined'
    ? SleepIntel.summarizeSleepLogs(logs, age)
    : null;
  const plan = summary && typeof SleepIntel !== 'undefined'
    ? SleepIntel.buildTomorrowPlan(summary, age, _getTomorrowPlanContext())
    : null;
  const babyName = localStorage.getItem('babymode_baby_name') || '';
  const preview = summary && plan && typeof SleepIntel !== 'undefined'
    ? SleepIntel.buildFamilyReport(summary, plan, { babyName, audience: 'dad' })
    : _buildSimpleLogShare(logs);

  let modal = document.getElementById('familyReportModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'familyReportModal';
    document.body.appendChild(modal);
  }
  modal.className = 'family-report-modal show';
  modal.innerHTML = `
    <div class="frm-sheet">
      <div class="frm-handle"></div>
      <div class="frm-title">Отправить отчёт близким</div>
      <div class="frm-sub">Выберите, кому отправляем — текст адаптируется под роль</div>
      <div class="frm-audiences">
        <button onclick="sendFamilyReport('dad')">👨 Папе</button>
        <button onclick="sendFamilyReport('grandma')">👵 Бабушке</button>
        <button onclick="sendFamilyReport('specialist')">🩺 Консультанту</button>
      </div>
      <div class="frm-preview">${preview.replace(/</g,'&lt;').slice(0, 520).replace(/\n/g,'<br>')}...</div>
      <button class="cta-outline-btn" onclick="closeFamilyReportModal();hapticLight()">Закрыть</button>
    </div>
  `;
}

function sendFamilyReport(audience) {
  const logs = getLogs();
  if (!logs.length) { showToast('Нет данных для отправки'); return; }
  const age = parseInt(localStorage.getItem('babymode_last_age') || document.getElementById('ageMonths')?.value || '6');
  const summary = typeof SleepIntel !== 'undefined'
    ? SleepIntel.summarizeSleepLogs(logs, age)
    : null;
  const plan = summary && typeof SleepIntel !== 'undefined'
    ? SleepIntel.buildTomorrowPlan(summary, age, _getTomorrowPlanContext())
    : null;
  const babyName = localStorage.getItem('babymode_baby_name') || '';
  const text = summary && plan && typeof SleepIntel !== 'undefined'
    ? SleepIntel.buildFamilyReport(summary, plan, { babyName, audience })
    : _buildSimpleLogShare(logs);

  closeFamilyReportModal();
  const tg = window.Telegram && window.Telegram.WebApp;
  if (tg && tg.switchInlineQuery) {
    tg.switchInlineQuery(text);
  } else {
    navigator.clipboard && navigator.clipboard.writeText(text);
    showToast('📋 Скопировано в буфер');
  }
}

function closeFamilyReportModal() {
  const modal = document.getElementById('familyReportModal');
  if (modal) modal.classList.remove('show');
}

function _buildSimpleLogShare(logs) {
  const recent = logs.slice(-7);
  const avg = l => recent.reduce((s,d) => s + (d[l]||0), 0) / recent.length;
  return `👶 Дневник сна малыша (${recent.length} дней)\n\n`
    + `🌙 Средний ночной сон: ${(avg('nightLen')/60).toFixed(1)}ч\n`
    + `☀️ Средний дневной сон: ${(avg('dayNaps')/60).toFixed(1)}ч\n\n`
    + `📊 Подробный режим: t.me/babymode1_bot/babymode`;
}

function setPeriod(p, btn) {
  trackerPeriod = p;
  document.querySelectorAll('.period-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderTracker();
}

function _getDiaryLimit() {
  if (typeof SUB === 'undefined') return Infinity;
  if (SUB.can('diaryUnlimited')) return Infinity;
  return 7; // free tier: last 7 days only
}

function renderDiarySummary(logs) {
  const sorted = (Array.isArray(logs) ? logs : []).slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const latest = sorted[sorted.length - 1] || null;
  const sleep = document.getElementById('diarySummarySleep');
  const wakings = document.getElementById('diarySummaryWakings');
  const days = document.getElementById('diarySummaryDays');
  const streak = document.getElementById('diaryStreak');
  const total = latest ? Math.max(0, Number(latest.nightLen || 0) + Number(latest.dayNaps || 0)) : 0;
  if (sleep) sleep.textContent = total ? `${Math.floor(total / 60)}ч ${Math.round(total % 60)}м` : '—';
  if (wakings) wakings.textContent = latest ? String(Math.max(0, Number(latest.nightWakings || 0))) : '0';
  if (days) days.textContent = String(sorted.length);
  if (streak) streak.textContent = sorted.length ? `${sorted.length} ${sorted.length === 1 ? 'день' : sorted.length < 5 ? 'дня' : 'дней'}` : 'Первая запись';
}

function renderTracker() {
  renderTagButtons();
  renderQuickSleepControls();

  const logs = getLogs();
  renderDiarySummary(logs);
  hydrateTodayLog(logs);
  const now  = new Date();
  const diaryLimit = _getDiaryLimit();
  const days  = trackerPeriod === 'week' ? 7 : (diaryLimit === Infinity ? 30 : Math.min(7, diaryLimit));
  const cutoff = localDateKey(new Date(now - days * 86400000));
  const allFiltered = logs.filter(l => l.date >= cutoff).sort((a,b) => a.date.localeCompare(b.date));
  const filtered = diaryLimit === Infinity ? allFiltered : allFiltered.slice(-diaryLimit);

  if (!filtered.length) {
    const chart = document.getElementById('trackerChart');
    if (chart) chart.style.display = 'none';
    const table = document.getElementById('trackerTable');
    if (table) table.innerHTML =
      '<p style="text-align:center;color:var(--tg-hint);padding:24px">Нет данных за этот период. Добавьте первую запись выше 👆</p>';
    return;
  }

  const chart = document.getElementById('trackerChart');
  if (chart) chart.style.display = 'block';

  // Chart
  const labels   = filtered.map(l => new Date(l.date).toLocaleDateString('ru',{day:'numeric',month:'short'}));
  const dayData  = filtered.map(l => +(l.dayNaps/60).toFixed(1));
  const nightData= filtered.map(l => +(l.nightLen/60).toFixed(1));

  const canvas = document.getElementById('trackerChartCanvas');
  if (canvas && typeof Chart === 'undefined' && typeof ensureChartLibrary === 'function') {
    ensureChartLibrary().then(renderTracker).catch(function(){});
  }
  if (canvas && typeof Chart !== 'undefined') {
    if (trackerChartInst) trackerChartInst.destroy();
    trackerChartInst = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label:'Дн. сон (ч)', data:dayData, backgroundColor:'rgba(99,102,241,0.7)', borderRadius:6, borderSkipped:false },
          { label:'Ночной сон (ч)', data:nightData, backgroundColor:'rgba(217,70,239,0.6)', borderRadius:6, borderSkipped:false },
        ]
      },
      options: {
        responsive:true,
        plugins:{ legend:{ labels:{ color:'#94a3b8', font:{size:11} } } },
        scales:{
          x:{ ticks:{color:'#94a3b8',font:{size:10}}, grid:{color:'rgba(255,255,255,0.04)'} },
          y:{ ticks:{color:'#94a3b8',font:{size:11},callback:v=>v+'ч'}, grid:{color:'rgba(255,255,255,0.04)'}, beginAtZero:true, max:14 }
        }
      }
    });
  }

  // Summary stats
  const avgNight = filtered.reduce((s,l) => s+l.nightLen,0) / filtered.length;
  const avgDay   = filtered.reduce((s,l) => s+l.dayNaps,0)  / filtered.length;
  const age = parseInt(localStorage.getItem('babymode_last_age') || document.getElementById('ageMonths')?.value || '6');
  const normSummary = typeof SleepIntel !== 'undefined' ? SleepIntel.summarizeSleepLogs(filtered, age) : null;
  const normStatus = normSummary && typeof SleepIntel !== 'undefined' ? SleepIntel.compareSleepWithNorms(normSummary) : null;

  // Tag frequency
  const tagCounts = {};
  filtered.forEach(l => (l.tags||[]).forEach(t => { tagCounts[t] = (tagCounts[t]||0)+1; }));
  const topTag = Object.entries(tagCounts).sort((a,b) => b[1]-a[1])[0];
  const topTagInfo = topTag ? SLEEP_TAGS.find(t => t.id === topTag[0]) : null;

  let html = `
    <div class="tracker-averages">
      <div class="stat-card"><div class="val">${(avgNight/60).toFixed(1)}ч</div><div class="lbl">Ср. ночной сон</div></div>
      <div class="stat-card"><div class="val">${(avgDay/60).toFixed(1)}ч</div><div class="lbl">Ср. дневной сон</div></div>
    </div>
    ${normStatus ? renderNormStatus(normStatus) : ''}
    ${topTagInfo ? `<div class="top-tag-row"><span>Частая проблема:</span><span class="top-tag-badge">${topTagInfo.label}</span></div>` : ''}
    <div class="diary-history-list">
  `;
  for (const l of [...filtered].reverse()) {
    const d = new Date(l.date).toLocaleDateString('ru',{day:'numeric',month:'short'});
    const tags = (l.tags||[]).map(id => {
      const t = SLEEP_TAGS.find(t => t.id === id);
      return t ? `<span class="log-tag">${t.label.split(' ')[0]}</span>` : '';
    }).join('');
    const totalSleep = Math.max(0, Number(l.nightLen || 0) + Number(l.dayNaps || 0));
    html += `<article class="diary-history-row">
      <time>${d}</time>
      <span class="diary-history-icon"><i data-lucide="moon"></i></span>
      <div><strong>${l.wake} — ${l.bed}</strong><span>Дневной сон: ${l.dayNaps ? Math.floor(l.dayNaps/60)+'ч '+(l.dayNaps%60)+'м' : 'нет данных'}${tags ? ' · ' + tags : ''}</span></div>
      <b>${totalSleep ? (totalSleep / 60).toFixed(1) + 'ч' : '—'}</b>
    </article>`;
  }
  html += '</div>';

  // Show limit banner if free user has more logs than shown
  if (diaryLimit !== Infinity && logs.length > diaryLimit) {
    html += `
      <div class="diary-limit-banner" onclick="goPage('premium',null);renderPremiumPage();hapticLight()">
        <span class="dlb-icon">🔒</span>
        <div class="dlb-text">
          <strong>Показано ${diaryLimit} из ${logs.length} дней</strong>
          <span>Полная история — в Premium</span>
        </div>
        <span class="dlb-cta">Открыть ⭐</span>
      </div>`;
  }

  const table = document.getElementById('trackerTable');
  if (table) table.innerHTML = html;
  if (typeof refreshIcons === 'function') refreshIcons();

  // Run analysis on full logs (not limited view)
  if (logs.length >= 3) analyzeAndSuggest(logs);
}

function hydrateTodayLog(logs) {
  const active = document.activeElement;
  if (active && active.closest && active.closest('#page-tracker') && ['INPUT', 'TEXTAREA'].includes(active.tagName)) return;
  const log = (logs || []).find(item => item.date === localDateKey());
  if (!log) return;
  const values = {
    lgWake: log.wake, lgBed: log.bed,
    lgNap1S: log.nap1s, lgNap1E: log.nap1e,
    lgNap2S: log.nap2s, lgNap2E: log.nap2e,
    lgNap3S: log.nap3s, lgNap3E: log.nap3e,
    lgNightAwake: log.nightAwakeMin || 0,
    lgNote: log.note || ''
  };
  Object.entries(values).forEach(([id, value]) => {
    const input = document.getElementById(id);
    if (input && value !== undefined && value !== null) input.value = value;
  });
}

function renderNormStatus(normStatus) {
  const item = (label, data) => `
    <div class="norm-pill ${data.status}">
      <span>${label}</span>
      <strong>${data.label}</strong>
    </div>
  `;
  return `
    <div class="norm-status-row">
      ${item('Всего', normStatus.total)}
      ${item('Ночь', normStatus.night)}
      ${item('День', normStatus.day)}
    </div>
  `;
}

function exportLog() {
  const logs = getLogs().sort((a,b) => a.date.localeCompare(b.date));
  if (!logs.length) { showToast('Нет данных для экспорта'); return; }
  let text = 'Дневник режима малыша\n' + '='.repeat(40) + '\n\n';
  for (const l of logs) {
    const tags = (l.tags||[]).map(id => SLEEP_TAGS.find(t=>t.id===id)?.label || id).join(', ');
    text += `${l.date} | Подъём ${l.wake} | Ночной сон ${Math.round(l.nightLen/60*10)/10}ч | Дн. сон ${Math.round(l.dayNaps/60*10)/10}ч | Укладывание ${l.bed} | Настр. ${l.mood}`;
    if (tags) text += ` | Теги: ${tags}`;
    if (l.note) text += ` | ${l.note}`;
    text += '\n';
  }
  const blob = new Blob([text], {type:'text/plain;charset=utf-8'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = 'baby_log.txt'; a.click();
  showToast('📥 Файл скачан');
}

if (typeof module !== 'undefined') {
  module.exports = {
    buildPdfReportModel,
    calcDayNaps,
    calcDuration,
    calcNightLen,
    classifySleepEvent,
    localDateKey,
    mergeManualLog,
    toMin
  };
}
