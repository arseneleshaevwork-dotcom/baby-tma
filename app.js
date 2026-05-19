// ─── Data ────────────────────────────────────────────────────────────────────
const PROFILES = {
  1:{ww:[45,45,50,55,60,90],nd:[60,60,50,40,25],ns:8.5,ts:16,label:'1 месяц',fi:150},
  2:{ww:[60,65,70,80,100],nd:[90,75,60,40],ns:9,ts:15.5,label:'2 месяца',fi:165},
  3:{ww:[75,80,90,100,120],nd:[90,90,60,30],ns:10,ts:15,label:'3 месяца',fi:180},
  4:{ww:[90,100,110,130],nd:[90,90,45],ns:10.5,ts:14.5,label:'4 месяца',fi:180},
  5:{ww:[100,110,130,135],nd:[90,90,40],ns:10.5,ts:14.5,label:'5 месяцев',fi:195},
  6:{ww:[130,150,160,150],nd:[90,75,30],ns:11,ts:14,label:'6 месяцев',fi:210},
  7:{ww:[155,175,225],nd:[90,60],ns:11,ts:14,label:'7 месяцев',fi:0},
  8:{ww:[160,185,230],nd:[90,60],ns:11,ts:14,label:'8 месяцев',fi:0},
  9:{ww:[175,205,225],nd:[90,60],ns:11,ts:14,label:'9 месяцев',fi:0},
  10:{ww:[185,210,235],nd:[90,60],ns:11,ts:13.5,label:'10 месяцев',fi:0},
  11:{ww:[195,215,240],nd:[90,55],ns:11,ts:13.5,label:'11 месяцев',fi:0},
  12:{ww:[300,330],nd:[90],ns:11,ts:13,label:'12 месяцев',fi:0},
  15:{ww:[315,330],nd:[105],ns:11,ts:13,label:'15 месяцев',fi:0},
  18:{ww:[330,345],nd:[105],ns:11,ts:12.5,label:'18 месяцев',fi:0},
  21:{ww:[345,345],nd:[105],ns:11,ts:12.5,label:'21 месяц',fi:0},
  24:{ww:[360,345],nd:[105],ns:11,ts:12,label:'2 года',fi:0},
  30:{ww:[390,345],nd:[90],ns:11.5,ts:12,label:'2.5 года',fi:0},
  36:{ww:[420,330],nd:[75],ns:11.5,ts:11.5,label:'3 года',fi:0},
};

// Minimum wake windows per age (safety guard for flex)
const MIN_WW = {
  1:40,2:55,3:70,4:85,5:95,6:115,7:140,8:145,9:160,10:170,11:180,
  12:270,15:285,18:300,21:315,24:330,30:360,36:390
};

function getProfile(age){
  const keys=[1,2,3,4,5,6,7,8,9,10,11,12,15,18,21,24,30,36];
  let k=keys[0]; for(const key of keys){if(age>=key)k=key;} return PROFILES[k];
}
function fmt(m){const h=Math.floor((m/60)%24),mn=m%60;return`${String(h).padStart(2,'0')}:${String(mn).padStart(2,'0')}`;}

// ─── State ───────────────────────────────────────────────────────────────────
let _age=12,_wakeMin=420,_feedType='breast',_activity='home',_p=null;
let _napStarts=[],_lastNapEnd=0,_bedtime=0;
let _blockShifts={}; // idx->minutes offset
let _bufferMin=0;

// ─── Schedule Builder ────────────────────────────────────────────────────────
function buildSchedule(age,wakeMin,feedType,activity,bufferMin,shifts){
  const p=getProfile(age);
  const blocks=[],daySegs=[];
  const isOld=age>=12,hasSolids=age>=5;
  const minWW=MIN_WW[Object.keys(MIN_WW).map(Number).filter(k=>k<=age).pop()]||40;

  // Compute nap starts with buffer + shifts
  const napStarts=[];
  let cumWW=0;
  for(let i=0;i<p.nd.length;i++){
    const shiftMin=(shifts&&shifts[i])||0;
    const buf=Math.round(bufferMin/p.nd.length);
    const adjusted=Math.max(p.ww[i]+buf+shiftMin, minWW);
    cumWW+=adjusted;
    napStarts.push(wakeMin+cumWW);
  }
  const lastNapEnd=napStarts[p.nd.length-1]+p.nd[p.nd.length-1];
  const lastWW=Math.max(p.ww[p.ww.length-1]+Math.round(bufferMin/2),minWW);
  const bedtime=lastNapEnd+lastWW;

  // Store for external use
  _napStarts=napStarts;_lastNapEnd=lastNapEnd;_bedtime=bedtime;

  daySegs.push({start:wakeMin-p.ns*60,dur:p.ns*60,tag:'sleep'});
  let cur=wakeMin;

  const push=(tag,emoji,title,note,dur=0)=>{
    blocks.push({time:fmt(cur),tag,title:emoji+' '+title,note});
    if(dur>0)daySegs.push({start:cur,dur,tag});
    cur+=dur;
  };

  push('hygiene','🌅','Подъём','Нежное пробуждение, смена подгузника',10);
  if(!isOld&&feedType!=='solids'){
    push('feed','🤱',feedType==='formula'?'Кормление смесью':'Кормление грудью','Первое утреннее кормление',20);
  } else {
    push('feed','🥣','Завтрак','Каша, фрукты или йогурт',25);
  }

  for(let i=0;i<p.nd.length;i++){
    const ns=napStarts[i],ne=ns+p.nd[i];
    const next=i<p.nd.length-1?napStarts[i+1]:null;

    if(i===0&&activity!=='home'&&ns-cur>65){
      push('walk','🌳','Утренняя прогулка','Свежий воздух и солнечный свет — лучший регулятор биоритмов',Math.min(50,ns-cur-20));
    }
    if(ns-cur>15) push('active','🎮','Игры и развитие','Развивающие игры, тактильный контакт, гимнастика',0);

    const napH=Math.floor((ns/60)%24);
    if(hasSolids&&napH>=11&&napH<=13&&ns-cur>=25){cur=Math.max(cur,ns-25);push('feed','🥗','Обед','Суп, овощное пюре или каша с белком',20);}

    cur=Math.max(cur,ns-5);
    push('sleep','😴','Укладывание'+(p.nd.length>1?' сна №'+(i+1):''),'Приглушённый свет, тишина, белый шум',0);
    cur=ns;
    push('sleep','💤','Дневной сон'+(p.nd.length>1?' №'+(i+1):''),'~'+p.nd[i]+' мин · Не будите раньше',p.nd[i]);
    push('hygiene','🌤️','Пробуждение после сна','Зайдите с улыбкой, объятия',10);

    if(!isOld&&feedType!=='solids'){
      push('feed','🍼',feedType==='formula'?'Кормление смесью':'Кормление','После сна — кормление',20);
    } else if(hasSolids){
      const ml=i===0&&p.nd.length>1?['🥗','Обед','Суп или пюре с белком']:
               i===0?['🥗','Обед','Полноценный обед']:['🍎','Полдник','Фрукты, творог или кисломолочное'];
      push('feed',ml[0],ml[1],ml[2],20);
    }

    if(next!==null){
      if(activity!=='home'&&next-cur>70) push('walk','🌳','Прогулка','Движение, свежий воздух',50);
      else push('active','🎵','Активные игры','Музыка, сенсорные игры',0);
      cur=next-10;
    }
  }

  cur=lastNapEnd+15;
  const dinnerTime=bedtime-85;
  if(hasSolids&&dinnerTime>cur+10){
    if(activity!=='home'&&dinnerTime-cur>50) push('walk','🌳','Вечерняя прогулка','Спокойная прогулка перед ночью',40);
    else push('active','🎨','Спокойные игры','Книжки, кубики',0);
    cur=dinnerTime;
    push('feed','🍝','Ужин','Лёгкий ужин: каша, тушёные овощи',20);
  } else if(!hasSolids&&activity!=='home') push('walk','🌳','Вечерняя прогулка','Свежий воздух перед ночью',30);

  cur=Math.max(cur,bedtime-45);
  push('hygiene','🛁','Купание','Тёплая ванна 36–37°C · массаж',20);
  if(!isOld) push('feed','🤱','Вечернее кормление','Сытое кормление — залог долгого ночного сна',15);
  push('sleep','📖','Ритуал укладывания','Колыбельная / сказка в полумраке',12);
  cur=bedtime;
  push('sleep','🌙','Ночной сон','Укладывание: '+fmt(bedtime)+' · Ночной сон ~'+p.ns+'ч · Подъём ~'+fmt(bedtime+p.ns*60),0);
  daySegs.push({start:bedtime,dur:p.ns*60,tag:'sleep'});

  return{blocks,daySegs,profile:p};
}

// ─── Render ──────────────────────────────────────────────────────────────────
const tagNames={sleep:'Сон',feed:'Кормление',active:'Активность',hygiene:'Уход',walk:'Прогулка'};
const colorMap={sleep:'#818cf8',active:'rgba(74,222,128,.7)',feed:'#fb923c',hygiene:'#38bdf8',walk:'#f472b6'};
let pieCI=null,barCI=null;

function renderSchedule(blocks,daySegs,p){
  window._lastBlocks=blocks;
  const age=_age,minWW=MIN_WW[Object.keys(MIN_WW).map(Number).filter(k=>k<=age).pop()]||40;

  // Status: check if each nap's wake window is within limits
  const statuses=_napStarts.map((ns,i)=>{
    const ww=ns-_wakeMin-(i>0?(_napStarts[i-1]+p.nd[i-1]-_wakeMin):0);
    if(ww>=p.ww[i]-5) return 'ok';
    if(ww>=minWW) return 'warn';
    return 'err';
  });

  document.getElementById('schedTitle').textContent='Режим для малыша — '+p.label;
  document.getElementById('schedSubtitle').textContent='Подъём в '+fmt(_wakeMin)+' · '+p.nd.length+' дн. сна · AAP/ВОЗ/NHS';
  document.getElementById('schedBadge').textContent=p.label;
  const dsh=(p.nd.reduce((a,b)=>a+b,0)/60).toFixed(1);
  document.getElementById('statsRow').innerHTML=
    `<div class="stat-card"><div class="val">${p.ts}ч</div><div class="lbl">Всего сна</div></div>
     <div class="stat-card"><div class="val">${p.nd.length}</div><div class="lbl">Дневных сна</div></div>
     <div class="stat-card"><div class="val">${p.ns}ч</div><div class="lbl">Ночной сон</div></div>`;

  // Nap index for status dot
  let napIdx=0;
  document.getElementById('timeline').innerHTML=blocks.map((b,i)=>{
    let statusDot='';
    if(b.tag==='sleep'&&b.title.includes('Дневной')){
      const s=statuses[napIdx]||'ok'; napIdx++;
      const tip=s==='ok'?'Норма':s==='warn'?'Близко к границе':'Выходит за рекомендации';
      statusDot=`<div class="status-dot ${s}" title="${tip}"></div>`;
    }
    return`<div class="time-block">
      <div class="tb-time">${b.time}</div>
      <div class="tb-dot ${b.tag}"></div>
      <div class="tb-content">
        <div class="tb-top">
          <div class="tb-title">${b.title}</div>
          <div style="display:flex;align-items:center;gap:6px">
            ${statusDot}
            ${b.tag==='sleep'&&b.title.includes('Дневной')?
              `<div class="shift-btns">
                <button class="shift-btn" onclick="shiftNap(${napIdx-1},-15)" title="Сдвинуть на 15 мин раньше">−</button>
                <button class="shift-btn" onclick="shiftNap(${napIdx-1},+15)" title="Сдвинуть на 15 мин позже">+</button>
              </div>`:''}
          </div>
        </div>
        <div class="tb-note">${b.note}</div>
        <span class="tb-tag ${b.tag}">${tagNames[b.tag]}</span>
      </div>
    </div>`;
  }).join('');

  // Tips
  document.getElementById('tipsBlock').innerHTML=`<div class="tips-title">💡 Советы для ${p.label}</div><ul>${getTips(_age).map(t=>`<li>${t}</li>`).join('')}</ul>`;

  // Stats charts
  renderStatCharts(p,daySegs);
}

function renderStatCharts(p,daySegs){
  const daySleepMin=p.nd.reduce((a,b)=>a+b,0);
  const totalAwake=24*60-p.ns*60-daySleepMin;
  const feedMin=Math.round(totalAwake*.12),hygMin=Math.round(totalAwake*.08);
  const actMin=totalAwake-feedMin-hygMin;

  if(pieCI)pieCI.destroy();
  pieCI=new Chart(document.getElementById('pieChart'),{type:'doughnut',
    data:{labels:['Ночной сон','Дневной сон','Активность','Кормление','Гигиена'],
      datasets:[{data:[Math.round(p.ns*60),daySleepMin,actMin,feedMin,hygMin],
        backgroundColor:['#818cf8','#a5b4fc','#4ade80','#fb923c','#38bdf8'],borderWidth:0,hoverOffset:8}]},
    options:{responsive:true,cutout:'68%',plugins:{legend:{display:false},
      tooltip:{callbacks:{label:ctx=>{const m=ctx.parsed;return` ${Math.floor(m/60)}ч ${m%60}мин`;}}}}
    }
  });

  if(barCI)barCI.destroy();
  barCI=new Chart(document.getElementById('barChart'),{type:'bar',
    data:{labels:['Ночной сон','Дневной сон','Всего сна'],
      datasets:[
        {label:'Ваш малыш',data:[p.ns,(daySleepMin/60).toFixed(1),p.ts],backgroundColor:'rgba(139,92,246,.7)',borderRadius:8,borderSkipped:false},
        {label:'Норма ВОЗ',data:[p.ns,(daySleepMin/60).toFixed(1),p.ts],backgroundColor:'rgba(74,222,128,.35)',borderRadius:8,borderSkipped:false}
      ]},
    options:{responsive:true,
      plugins:{legend:{labels:{color:'#94a3b8',font:{size:11}}}},
      scales:{x:{ticks:{color:'#94a3b8',font:{size:11}},grid:{color:'rgba(255,255,255,.05)'}},
        y:{ticks:{color:'#94a3b8',font:{size:11},callback:v=>v+'ч'},grid:{color:'rgba(255,255,255,.05)'},max:14}}
    }
  });

  // 24h bar
  const bar=document.getElementById('dayBar'); bar.innerHTML='';
  const total=24*60;
  const sorted=[...daySegs].sort((a,b)=>a.start-b.start);
  let prev=0;
  for(const seg of sorted){
    const s=((seg.start%total)+total)%total;
    if(s>prev){const g=document.createElement('div');g.className='daybar-seg';g.style.cssText=`width:${((s-prev)/total*100).toFixed(2)}%;background:rgba(255,255,255,.04)`;bar.appendChild(g);}
    const d=document.createElement('div');d.className='daybar-seg';
    const w=Math.min(seg.dur,total-s);
    d.style.cssText=`width:${(w/total*100).toFixed(2)}%;background:${colorMap[seg.tag]||'#888'}`;
    d.title=tagNames[seg.tag]+' '+Math.round(w)+'мин'; bar.appendChild(d); prev=s+w;
  }
}

// ─── Tips ────────────────────────────────────────────────────────────────────
function getTips(age){
  const all=[
    [0,3,'Белый шум (60 дБ) сокращает время засыпания новорождённых на 40% — исследование AAP'],
    [0,3,'Признаки усталости важнее часов: зевота, потирание глаз — укладывайте сразу'],
    [4,6,'Регресс в 4 месяца — нейрологическая перестройка мозга. Режим и ритуалы помогут за 2–6 недель'],
    [4,6,'Идеальная температура в комнате для сна: 18–21°C (NHS)'],
    [6,9,'Первые продукты прикорма давайте утром — если будет реакция, увидите днём'],
    [6,9,'Между новыми продуктами — 3 дня наблюдения (рекомендация ВОЗ)'],
    [9,12,'Переход 2→1 сон: в 12–18 мес. Признак: отказ от одного сна 5+ дней подряд'],
    [12,23,'1 дневной сон: укладывайте не позже 13:00, иначе трудно уснуть в 19:30'],
    [18,36,'Малышам нужна предсказуемость: одинаковый ритуал каждый вечер'],
    [0,99,'Отклонение на 15–30 минут — норма. Гибкость важнее строгости'],
    [0,99,'Вечерний ритуал: купание → кормление → сказка. Мозг вырабатывает условный рефлекс'],
  ];
  return all.filter(([mn,mx])=>age>=mn&&age<=mx).slice(0,4).map(t=>t[2]);
}

// ─── Flex Controls ───────────────────────────────────────────────────────────
function onBuffer(val){
  _bufferMin=+val;
  document.getElementById('bufferVal').textContent=val+' мин';
  refreshSchedule();
}

function shiftNap(napIdx,delta){
  _blockShifts[napIdx]=(_blockShifts[napIdx]||0)+delta;
  refreshSchedule();
}

function resetSchedule(){
  _blockShifts={};_bufferMin=0;
  document.getElementById('bufferSlider').value=0;
  document.getElementById('bufferVal').textContent='0 мин';
  refreshSchedule();
}

function refreshSchedule(){
  const{blocks,daySegs,profile:p}=buildSchedule(_age,_wakeMin,_feedType,_activity,_bufferMin,_blockShifts);
  renderSchedule(blocks,daySegs,p);
}

// ─── Tabs ────────────────────────────────────────────────────────────────────
function navTab(id,btn){
  document.querySelectorAll('.nav-tab').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('.tab-page').forEach(t=>t.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('page-'+id).classList.add('active');
  if(id==='tracker') renderTracker();
}

// ─── Inner stats tabs ────────────────────────────────────────────────────────
function switchTab(id,btn){
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(t=>t.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('tab-'+id).classList.add('active');
}

// ─── Generate ────────────────────────────────────────────────────────────────
function generate(){
  _age=parseInt(document.getElementById('ageMonths').value);
  const wt=document.getElementById('wakeTime').value.split(':');
  _wakeMin=+wt[0]*60+ +wt[1];
  _feedType=document.getElementById('feedType').value;
  _activity=document.getElementById('activity').value;
  _p=getProfile(_age); _blockShifts={}; _bufferMin=0;
  document.getElementById('bufferSlider').value=0;
  document.getElementById('bufferVal').textContent='0 мин';

  const{blocks,daySegs,profile:p}=buildSchedule(_age,_wakeMin,_feedType,_activity,0,{});
  renderSchedule(blocks,daySegs,p);
  // Note: tab switch is handled in index.html override
}
