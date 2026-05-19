// ─── Daily Tracker & Analytics ───────────────────────────────────────────────
const TRACKER_KEY = 'babymode_logs';
let trackerPeriod = 'week';
let moodSel = '😊';
let trackerChartInst = null;

function getLogs() {
  try { return JSON.parse(localStorage.getItem(TRACKER_KEY) || '[]'); } catch(e) { return []; }
}
function saveLogs(logs) { localStorage.setItem(TRACKER_KEY, JSON.stringify(logs)); }

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
  const bed   = document.getElementById('lgBed').value;
  const note  = document.getElementById('lgNote').value.trim();

  if (!wake || !bed) { showToast('Укажите время подъёма и укладывания'); return; }

  const toMin = t => { const [h,m]=t.split(':'); return +h*60+ +m; };
  const dur   = (s,e) => s&&e ? Math.max(0,toMin(e)-toMin(s)) : 0;

  const dayNaps = dur(nap1s,nap1e) + dur(nap2s,nap2e);
  const nightLen = toMin(bed) < toMin(wake)
    ? (24*60 - toMin(bed)) + toMin(wake)
    : toMin(bed) - toMin(wake);

  const today = new Date().toISOString().slice(0,10);
  const logs  = getLogs().filter(l => l.date !== today); // one per day
  logs.push({ date:today, wake, bed, dayNaps, nightLen, mood:moodSel, note });
  saveLogs(logs);
  showToast('✅ День сохранён!');
  renderTracker();
}

function setPeriod(p, btn) {
  trackerPeriod = p;
  document.querySelectorAll('.period-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderTracker();
}

function renderTracker() {
  const logs = getLogs();
  const now  = new Date();
  const days  = trackerPeriod === 'week' ? 7 : 30;
  const cutoff = new Date(now - days * 86400000).toISOString().slice(0,10);
  const filtered = logs.filter(l => l.date >= cutoff).sort((a,b) => a.date.localeCompare(b.date));

  if (!filtered.length) {
    document.getElementById('trackerChart').style.display = 'none';
    document.getElementById('trackerTable').innerHTML =
      '<p style="text-align:center;color:var(--muted);padding:24px">Нет данных за этот период. Добавьте первую запись выше 👆</p>';
    return;
  }

  document.getElementById('trackerChart').style.display = 'block';

  // Chart
  const labels = filtered.map(l => {
    const d = new Date(l.date);
    return d.toLocaleDateString('ru',{day:'numeric',month:'short'});
  });
  const dayData  = filtered.map(l => +(l.dayNaps/60).toFixed(1));
  const nightData= filtered.map(l => +(l.nightLen/60).toFixed(1));

  if (trackerChartInst) trackerChartInst.destroy();
  trackerChartInst = new Chart(document.getElementById('trackerChartCanvas'), {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label:'Дн. сон (ч)', data:dayData, backgroundColor:'rgba(129,140,248,0.7)', borderRadius:6, borderSkipped:false },
        { label:'Ночной сон (ч)', data:nightData, backgroundColor:'rgba(232,121,249,0.6)', borderRadius:6, borderSkipped:false },
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

  // Table
  const avgNight = filtered.reduce((s,l)=>s+l.nightLen,0) / filtered.length;
  const avgDay   = filtered.reduce((s,l)=>s+l.dayNaps,0)  / filtered.length;

  let html = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px">
      <div class="stat-card"><div class="val">${(avgNight/60).toFixed(1)}ч</div><div class="lbl">Ср. ночной сон</div></div>
      <div class="stat-card"><div class="val">${(avgDay/60).toFixed(1)}ч</div><div class="lbl">Ср. дневной сон</div></div>
    </div>
    <table class="log-table">
      <tr><th>Дата</th><th>Подъём</th><th>Дн. сон</th><th>Укладывание</th><th>Настроение</th></tr>
  `;
  for (const l of [...filtered].reverse()) {
    const d = new Date(l.date).toLocaleDateString('ru',{day:'numeric',month:'short'});
    html += `<tr>
      <td>${d}</td>
      <td>${l.wake}</td>
      <td>${l.dayNaps ? Math.floor(l.dayNaps/60)+'ч '+(l.dayNaps%60)+'м' : '—'}</td>
      <td>${l.bed}</td>
      <td style="font-size:1.2rem">${l.mood}</td>
    </tr>`;
  }
  html += '</table>';
  document.getElementById('trackerTable').innerHTML = html;
}

function exportLog() {
  const logs = getLogs().sort((a,b)=>a.date.localeCompare(b.date));
  if (!logs.length) { showToast('Нет данных для экспорта'); return; }
  let text = 'Дневник режима малыша\n' + '='.repeat(40) + '\n\n';
  for (const l of logs) {
    text += `${l.date} | Подъём ${l.wake} | Ночной сон ${Math.round(l.nightLen/60*10)/10}ч | Дн. сон ${Math.round(l.dayNaps/60*10)/10}ч | Укладывание ${l.bed} | Настр. ${l.mood}`;
    if (l.note) text += ` | ${l.note}`;
    text += '\n';
  }
  const blob = new Blob([text], {type:'text/plain;charset=utf-8'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = 'baby_log.txt'; a.click();
}
