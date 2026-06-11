// ─── Smart Sleep Diary v2 ─────────────────────────────────────────────────────
// Tags, AI analysis after 3+ days, recovery day detection

const TRACKER_KEY = 'babymode_logs';
const QUICK_SLEEP_KEY = 'babymode_quick_sleep_start';
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
function saveLogs(logs) { localStorage.setItem(TRACKER_KEY, JSON.stringify(logs)); }

function localDateKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function hm(date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function toMin(t) {
  if (!t) return 0;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function calcNightLen(bed, wake) {
  const bedMin = toMin(bed);
  const wakeMin = toMin(wake);
  return bedMin > wakeMin ? (24 * 60 - bedMin) + wakeMin : Math.max(0, wakeMin - bedMin);
}

function getOrCreateTodayLog(logs) {
  const today = localDateKey();
  let log = logs.find(l => l.date === today);
  if (!log) {
    const wake = document.getElementById('lgWake')?.value || document.getElementById('wakeTime')?.value || '07:00';
    const bed = document.getElementById('lgBed')?.value || '19:30';
    log = {
      date: today,
      wake,
      bed,
      nap1s: '', nap1e: '', nap2s: '', nap2e: '', nap3s: '', nap3e: '',
      dayNaps: 0,
      nightLen: calcNightLen(bed, wake),
      mood: moodSel,
      tags: [],
      note: '',
      quickNaps: [],
      nightWakings: 0
    };
    logs.push(log);
  }
  if (!Array.isArray(log.quickNaps)) log.quickNaps = [];
  if (!Array.isArray(log.tags)) log.tags = [];
  return log;
}

function startQuickSleep() {
  localStorage.setItem(QUICK_SLEEP_KEY, String(Date.now()));
  renderQuickSleepControls();
  showToast('😴 Сон начат');
}

function finishQuickSleep() {
  const started = parseInt(localStorage.getItem(QUICK_SLEEP_KEY) || '0');
  if (!started) { showToast('Сначала нажмите “Уснул”'); return; }

  const start = new Date(started);
  const end = new Date();
  const dur = Math.max(1, Math.round((end - start) / 60000));
  const logs = getLogs();
  const log = getOrCreateTodayLog(logs);

  log.quickNaps.push({ start: hm(start), end: hm(end), dur });
  log.dayNaps = (log.dayNaps || 0) + dur;
  if (!log.nap1s) { log.nap1s = hm(start); log.nap1e = hm(end); }
  else if (!log.nap2s) { log.nap2s = hm(start); log.nap2e = hm(end); }
  else if (!log.nap3s) { log.nap3s = hm(start); log.nap3e = hm(end); }

  saveLogs(logs);
  localStorage.removeItem(QUICK_SLEEP_KEY);
  renderQuickSleepControls();
  renderTracker();
  showToast(`🌤 Сон записан: ${dur} мин`);
}

function quickSleepTag(tag) {
  const logs = getLogs();
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
  renderTracker();
}

function renderQuickSleepControls() {
  const status = document.getElementById('quickSleepStatus');
  const timer = document.getElementById('quickSleepTimer');
  if (!status || !timer) return;

  const started = parseInt(localStorage.getItem(QUICK_SLEEP_KEY) || '0');
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
  const note  = document.getElementById('lgNote').value.trim();

  if (!wake || !bed) { showToast('Укажите время подъёма и укладывания'); return; }

  const toMin = t => { if (!t) return 0; const [h,m]=t.split(':'); return +h*60+ +m; };
  const dur   = (s,e) => s&&e ? Math.max(0,toMin(e)-toMin(s)) : 0;

  const dayNaps = dur(nap1s,nap1e) + dur(nap2s,nap2e) + dur(nap3s,nap3e);

  // Night sleep: time from bed to wake (handles midnight crossing)
  const bedMin  = toMin(bed);
  const wakeMin = toMin(wake);
  const nightLen = bedMin > wakeMin ? (24*60 - bedMin) + wakeMin : Math.max(0, wakeMin - bedMin);

  const today = new Date().toISOString().slice(0,10);
  const logs  = getLogs().filter(l => l.date !== today);
  logs.push({
    date: today, wake, bed,
    nap1s, nap1e, nap2s, nap2e, nap3s, nap3e,
    dayNaps, nightLen,
    mood: moodSel,
    tags: [...selectedTags],
    note
  });
  saveLogs(logs);

  selectedTags.clear();
  renderTagButtons();
  showToast('✅ День сохранён!');
  if (typeof hapticSuccess === 'function') hapticSuccess();
  renderTracker();

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
        <strong>${summary && summary.sleepDebt ? 'Вижу признаки недосыпа' : 'Готов анализ режима'}</strong>
      </div>
      <p>${summary && summary.sleepDebt
        ? `По последним записям накопилось около ${(summary.sleepDebt / 60).toFixed(1)}ч недосыпа. Premium покажет причину, календарь скачков и план на завтра.`
        : 'После 3 записей дневника Premium показывает паттерны сна, календарь скачков и план на завтра.'}</p>
      <button class="recovery-btn" onclick="document.getElementById('bn-premium')?.click();hapticLight()">
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

function renderTracker() {
  renderTagButtons();
  renderQuickSleepControls();

  const logs = getLogs();
  const now  = new Date();
  const days  = trackerPeriod === 'week' ? 7 : 30;
  const cutoff = new Date(now - days * 86400000).toISOString().slice(0,10);
  const filtered = logs.filter(l => l.date >= cutoff).sort((a,b) => a.date.localeCompare(b.date));

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
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px">
      <div class="stat-card"><div class="val">${(avgNight/60).toFixed(1)}ч</div><div class="lbl">Ср. ночной сон</div></div>
      <div class="stat-card"><div class="val">${(avgDay/60).toFixed(1)}ч</div><div class="lbl">Ср. дневной сон</div></div>
    </div>
    ${normStatus ? renderNormStatus(normStatus) : ''}
    ${topTagInfo ? `<div class="top-tag-row"><span>Частая проблема:</span><span class="top-tag-badge">${topTagInfo.label}</span></div>` : ''}
    <table class="log-table">
      <tr><th>Дата</th><th>Подъём</th><th>Дн. сон</th><th>Укладывание</th><th>Теги</th></tr>
  `;
  for (const l of [...filtered].reverse()) {
    const d = new Date(l.date).toLocaleDateString('ru',{day:'numeric',month:'short'});
    const tags = (l.tags||[]).map(id => {
      const t = SLEEP_TAGS.find(t => t.id === id);
      return t ? `<span class="log-tag">${t.label.split(' ')[0]}</span>` : '';
    }).join('');
    html += `<tr>
      <td>${d}</td>
      <td>${l.wake}</td>
      <td>${l.dayNaps ? Math.floor(l.dayNaps/60)+'ч '+(l.dayNaps%60)+'м' : '—'}</td>
      <td>${l.bed}</td>
      <td style="font-size:.75rem">${tags || l.mood}</td>
    </tr>`;
  }
  html += '</table>';

  const table = document.getElementById('trackerTable');
  if (table) table.innerHTML = html;

  // Run analysis if 3+ days
  if (logs.length >= 3) analyzeAndSuggest(logs);
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
