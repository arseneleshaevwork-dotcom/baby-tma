// ─── PDF Export ────────────────────────────────────────────────────────────────
// Premium page logic moved to subscription.js
// This file handles PDF generation only

function generatePDF() {
  const age    = parseInt(document.getElementById('ageMonths')?.value || 12);
  const wt     = document.getElementById('wakeTime')?.value || '07:00';
  const blocks = window._lastBlocks || [];

  const w = window.open('', '_blank');
  if (!w) { showToast('Разрешите всплывающие окна'); return; }

  const ageLabel = document.getElementById('schedBadge')?.textContent || age + ' мес.';
  const babyName = localStorage.getItem('babymode_baby_name') || '';
  const tagNames  = {sleep:'Сон',feed:'Кормление',active:'Активность',hygiene:'Уход',walk:'Прогулка'};
  const tagColors = {sleep:'#7C83E8',feed:'#FF9A7B',active:'#5DC9A0',hygiene:'#5BC4D8',walk:'#F48FB1'};

  let rows = '';
  for (const b of blocks) {
    rows += `<tr>
      <td style="font-weight:800;color:#C97BDB;white-space:nowrap">${b.time}</td>
      <td style="font-size:1.1em">${b.title}</td>
      <td style="color:#7A6680">${b.note}</td>
      <td><span style="background:${tagColors[b.tag]}22;color:${tagColors[b.tag]};padding:2px 9px;border-radius:12px;font-size:.78em;font-weight:800">${tagNames[b.tag]||''}</span></td>
    </tr>`;
  }

  w.document.write(`<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8">
<title>Режим Малыша${babyName ? ' — ' + babyName : ''}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap');
  body{font-family:'Nunito',Arial,sans-serif;color:#3D2C3E;padding:32px;max-width:800px;margin:0 auto;background:#FFF9F5}
  h1{font-size:2em;background:linear-gradient(135deg,#FF9A7B,#C97BDB);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:4px}
  .sub{color:#B4A4BB;font-size:.9em;margin-bottom:24px;font-weight:600}
  table{width:100%;border-collapse:collapse;margin-bottom:24px}
  th{background:linear-gradient(135deg,#FFF0F8,#F8F0FF);color:#C97BDB;font-size:.75em;text-transform:uppercase;letter-spacing:.05em;padding:10px 12px;text-align:left;font-weight:800}
  td{padding:10px 12px;border-bottom:1px solid #F0E8F4;font-size:.9em;vertical-align:top}
  .section{background:linear-gradient(135deg,#FFF0F8,#F8F0FF);border-radius:16px;padding:16px;margin-bottom:18px}
  .section h3{color:#C97BDB;font-size:.9em;text-transform:uppercase;letter-spacing:.05em;margin-bottom:10px;font-weight:800}
  .section ul{padding-left:16px;font-size:.87em;line-height:1.8;color:#7A6680}
  .stats{display:flex;gap:16px;margin-bottom:20px}
  .stat{flex:1;text-align:center;background:linear-gradient(135deg,#FFF0F8,#F8F0FF);border-radius:16px;padding:14px}
  .stat .v{font-size:2em;font-weight:900;background:linear-gradient(135deg,#FF9A7B,#C97BDB);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
  .stat .l{font-size:.72em;color:#B4A4BB;text-transform:uppercase;font-weight:700}
  .norms{width:100%;border-collapse:collapse}
  .norms th{background:linear-gradient(135deg,#FFF0F8,#F8F0FF);color:#C97BDB;font-size:.75em;padding:8px 10px;text-align:center;font-weight:800}
  .norms td{padding:8px 10px;border:1px solid #F0E8F4;text-align:center;font-size:.85em}
  footer{margin-top:32px;padding-top:16px;border-top:1px solid #F0E8F4;font-size:.75em;color:#B4A4BB;text-align:center}
  @media print{body{padding:16px}button{display:none}}
</style></head><body>
<h1>👶 Режим${babyName ? ' — ' + babyName : ' Малыша'}</h1>
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
    <li>Вечерний ритуал: купание → массаж → кормление → сказка → сон</li>
    <li>При регрессе сна: не вводите новые ассоциации — берите на руки, но кладите в кроватку сонным</li>
    <li>Не сравнивайте своего малыша с другими — каждый ребёнок уникален ❤️</li>
  </ul>
</div>

<footer>Режим Малыша © 2025 · Данные основаны на рекомендациях ВОЗ, AAP, NHS · Не является медицинским советом · Консультируйтесь с педиатром</footer>

<script>
  try {
    const sv = window.opener?._pdfStats;
    if(sv){ document.getElementById('ps1').textContent=sv[0]; document.getElementById('ps2').textContent=sv[1]; document.getElementById('ps3').textContent=sv[2]; }
  } catch(e){}
  window.print();
</script>
</body></html>`);
  w.document.close();
  const sv = document.querySelectorAll('.stat-card .val');
  if (sv.length >= 3) {
    try { w._pdfStats = [sv[0].textContent, sv[1].textContent, sv[2].textContent]; } catch(e) {}
  }
}
