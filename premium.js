// ─── Premium / PDF Manual ────────────────────────────────────────────────────
let isPremium = localStorage.getItem('babymode_premium') === '1';

function initPremium() {
  document.getElementById('premiumStatus').textContent =
    isPremium ? '✅ Premium активен' : '🔒 Демо-режим';
}

function buyPremium() {
  // Здесь будет подключение к платёжной системе (Stripe / ЮКасса)
  showToast('🚀 Подключение к оплате скоро будет доступно!');
  // Demo: simulate unlock after 1.5s
  setTimeout(() => {
    isPremium = true;
    localStorage.setItem('babymode_premium','1');
    document.getElementById('premiumStatus').textContent = '✅ Premium активен';
    showToast('🎉 Premium активирован (демо-режим)');
  }, 1500);
}

function generatePDF() {
  const age    = parseInt(document.getElementById('ageMonths')?.value || 12);
  const wt     = document.getElementById('wakeTime')?.value || '07:00';
  const blocks = window._lastBlocks || [];

  // Use browser print for now — jsPDF can be added later
  const w = window.open('', '_blank');
  if (!w) { showToast('Разрешите всплывающие окна'); return; }

  const ageLabel = document.getElementById('schedBadge')?.textContent || age + ' мес.';
  const tagNames = {sleep:'Сон',feed:'Кормление',active:'Активность',hygiene:'Уход',walk:'Прогулка'};
  const tagColors = {sleep:'#818cf8',feed:'#fb923c',active:'#4ade80',hygiene:'#38bdf8',walk:'#f472b6'};

  let rows = '';
  for (const b of blocks) {
    rows += `<tr>
      <td style="font-weight:700;color:#6366f1;white-space:nowrap">${b.time}</td>
      <td style="font-size:1.1em">${b.title}</td>
      <td style="color:#666">${b.note}</td>
      <td><span style="background:${tagColors[b.tag]}22;color:${tagColors[b.tag]};padding:2px 8px;border-radius:6px;font-size:.78em;font-weight:700">${tagNames[b.tag]||''}</span></td>
    </tr>`;
  }

  w.document.write(`<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8">
<title>Режим Малыша — ${ageLabel}</title>
<style>
  body{font-family:'Segoe UI',Arial,sans-serif;color:#1a1a2e;padding:32px;max-width:800px;margin:0 auto}
  h1{font-size:2em;color:#7c3aed;margin-bottom:4px}
  .sub{color:#6b7280;font-size:.9em;margin-bottom:24px}
  table{width:100%;border-collapse:collapse;margin-bottom:24px}
  th{background:#f3f0ff;color:#4c1d95;font-size:.75em;text-transform:uppercase;letter-spacing:.05em;padding:10px 12px;text-align:left}
  td{padding:10px 12px;border-bottom:1px solid #f0f0f0;font-size:.9em;vertical-align:top}
  tr:hover td{background:#fafafa}
  .section{background:linear-gradient(135deg,#f3f0ff,#fdf2f8);border-radius:12px;padding:16px;margin-bottom:18px}
  .section h3{color:#7c3aed;font-size:.9em;text-transform:uppercase;letter-spacing:.05em;margin-bottom:10px}
  .section ul{padding-left:16px;font-size:.87em;line-height:1.8;color:#374151}
  .stats{display:flex;gap:16px;margin-bottom:20px}
  .stat{flex:1;text-align:center;background:#f3f0ff;border-radius:12px;padding:14px}
  .stat .v{font-size:2em;font-weight:900;color:#7c3aed}
  .stat .l{font-size:.72em;color:#6b7280;text-transform:uppercase}
  .norms{width:100%;border-collapse:collapse}
  .norms th{background:#f3f0ff;color:#4c1d95;font-size:.75em;padding:8px 10px;text-align:center}
  .norms td{padding:8px 10px;border:1px solid #e5e7eb;text-align:center;font-size:.85em}
  .norms tr:nth-child(even) td{background:#fafafa}
  footer{margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:.75em;color:#9ca3af;text-align:center}
  @media print{body{padding:16px}button{display:none}}
</style></head><body>
<h1>👶 Режим Малыша</h1>
<div class="sub">Научно обоснованное расписание · ${ageLabel} · Подъём в ${wt}</div>

<div class="stats">
  <div class="stat"><div class="v" id="ps1">—</div><div class="l">Всего сна</div></div>
  <div class="stat"><div class="v" id="ps2">—</div><div class="l">Дневных сна</div></div>
  <div class="stat"><div class="v" id="ps3">—</div><div class="l">Ночной сон</div></div>
</div>

<table>
  <thead><tr><th>Время</th><th>Активность</th><th>Описание</th><th>Тип</th></tr></thead>
  <tbody>${rows}</tbody>
</table>

<div class="section">
  <h3>📌 Научные основы расписания</h3>
  <ul>
    <li>Расписание основано на <strong>wake windows (окнах бодрствования)</strong> — ключевой концепции детского сна</li>
    <li>Рекомендации <strong>ВОЗ, AAP (Американской академии педиатрии) и NHS (Великобритания)</strong></li>
    <li>Нормы сна адаптированы под возраст: от 16 ч/сут у новорождённых до 11 ч у детей 3 лет</li>
    <li>Оптимальная температура для сна: <strong>18–21°C</strong> (данные NHS)</li>
    <li>Белый шум: эффективен для засыпания при 60 дБ (исследование Spencer, 2004)</li>
  </ul>
</div>

<div class="section">
  <h3>🌙 Таблица норм сна по возрасту (ВОЗ / AAP)</h3>
  <table class="norms">
    <thead><tr><th>Возраст</th><th>Всего сна</th><th>Ночной</th><th>Дн. снов</th><th>Окно бодрств.</th></tr></thead>
    <tbody>
      <tr><td>0–3 мес</td><td>14–17 ч</td><td>8–9 ч</td><td>4–5</td><td>45–90 мин</td></tr>
      <tr><td>4–5 мес</td><td>12–15 ч</td><td>10 ч</td><td>3–4</td><td>1.5–2 ч</td></tr>
      <tr><td>6–8 мес</td><td>12–14 ч</td><td>11 ч</td><td>2–3</td><td>2–2.5 ч</td></tr>
      <tr><td>9–11 мес</td><td>12–14 ч</td><td>11 ч</td><td>2</td><td>2.5–3.5 ч</td></tr>
      <tr><td>12–17 мес</td><td>12–14 ч</td><td>11 ч</td><td>1–2</td><td>4–5 ч</td></tr>
      <tr><td>18–24 мес</td><td>11–14 ч</td><td>11 ч</td><td>1</td><td>5–6 ч</td></tr>
      <tr><td>2–3 года</td><td>11–14 ч</td><td>11.5 ч</td><td>1 (опц.)</td><td>6–7 ч</td></tr>
    </tbody>
  </table>
</div>

<div class="section">
  <h3>🍼 Нормы кормления по возрасту</h3>
  <ul>
    <li><strong>0–3 мес:</strong> 60–120 мл каждые 2–3 ч (8–12 раз/сут на ГВ)</li>
    <li><strong>3–6 мес:</strong> 120–180 мл, каждые 3–4 ч</li>
    <li><strong>6–9 мес:</strong> 150–220 мл + начало прикорма с 6 мес.</li>
    <li><strong>9–12 мес:</strong> 180–240 мл + активный прикорм 3 раза/день</li>
    <li><strong>12+ мес:</strong> Переход на общий стол + 400–500 мл молока/смеси</li>
  </ul>
</div>

<div class="section">
  <h3>💡 Ключевые советы по режиму</h3>
  <ul>
    <li>Режим — это <strong>ориентир, не расписание</strong>. Отклонение ±30 мин — норма</li>
    <li>Сначала режим нужен маме, потом малышу — не корите себя за сбои</li>
    <li>Вечерний ритуал: купание → кормление → сказка → сон. Повторяйте каждый день</li>
    <li>При регрессе сна: не вводите новые ассоциации — берите на руки, но кладите в кроватку сонным</li>
    <li>Дневник сна помогает видеть закономерности: ведите хотя бы 2 недели</li>
    <li>Не сравнивайте своего малыша с другими — каждый ребёнок уникален ❤️</li>
  </ul>
</div>

<div class="section">
  <h3>🥕 Меню прикорма (6–12 мес.)</h3>
  <ul>
    <li><strong>6 мес:</strong> Кабачок, брокколи, цветная капуста (пюре, 1 ингредиент)</li>
    <li><strong>7 мес:</strong> Тыква, морковь, картофель, безглютеновые каши (гречка, рис)</li>
    <li><strong>8 мес:</strong> Мясо (индейка, кролик), яичный желток, фруктовые пюре</li>
    <li><strong>9 мес:</strong> Рыба (треска), кефир, творог, хлеб</li>
    <li><strong>10–12 мес:</strong> Постепенный переход к общему столу, кусочки</li>
  </ul>
</div>

<footer>Режим Малыша © 2025 · Данные основаны на рекомендациях ВОЗ, AAP, NHS · Не является медицинским советом · Консультируйтесь с педиатром</footer>

<script>
  // Fill stats from parent page if available
  try {
    const statsVals = window.opener?._pdfStats;
    if(statsVals){
      document.getElementById('ps1').textContent = statsVals[0];
      document.getElementById('ps2').textContent = statsVals[1];
      document.getElementById('ps3').textContent = statsVals[2];
    }
  } catch(e){}
  window.print();
</script>
</body></html>`);
  w.document.close();
  // Pass stats to popup
  const sv = document.querySelectorAll('.stat-card .val');
  if(sv.length>=3) {
    try { w._pdfStats = [sv[0].textContent, sv[1].textContent, sv[2].textContent]; } catch(e){}
  }
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}
