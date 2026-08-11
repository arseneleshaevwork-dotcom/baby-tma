// ─── FAQ Chat Engine ─────────────────────────────────────────────────────────
const FAQ = [
  // СОН
  {k:['регресс','регрессия','4 месяца','регресс сна'],t:'Сон',
   a:'<strong>Около 4 месяцев сон действительно может временно измениться:</strong> циклы становятся заметнее, а пробуждений может быть больше. Сохраняйте знакомый ритуал, следите за признаками усталости и меняйте время укладывания небольшими шагами по 10–15 минут. Если малыш плохо ест, вялый или сон резко изменился вместе с другими симптомами — обсудите это с педиатром.'},
  {k:['не засыпает','не может уснуть','долго засыпает','плачет перед сном'],t:'Сон',
   a:'<strong>Долгое засыпание</strong> часто означает: ✦ Перегул — малыш перевозбуждён (пропустили окно сна) ✦ Или недогул — ещё не устал. Решение: следите за признаками усталости (трёт глаза, зевает, взгляд «стекленеет»). Укладывайте сразу, не ждите плача. Вечером — начните ритуал за 20–30 мин до сна.'},
  {k:['просыпается ночью','частые пробуждения','будится ночью'],t:'Сон',
   a:'<strong>Ночные пробуждения могут быть нормальны и после 6 месяцев.</strong> Проверьте голод, дискомфорт, болезнь, условия сна и не слишком ли тяжёлым был вечер. Сохраняйте предсказуемый спокойный ритуал и безопасное отдельное место сна. Ночные кормления не убирают только по возрасту: учитывайте набор веса и рекомендации педиатра.'},
  {k:['белый шум','шум для сна','звуки для сна'],t:'Сон',
   a:'<strong>Белый шум</strong> может маскировать резкие бытовые звуки, но используйте его осторожно: минимальная комфортная громкость, источник подальше от кроватки и таймер. Не ставьте телефон или колонку рядом с головой малыша и не используйте шум вместо безопасного места сна.'},
  {k:['окно сна','окно бодрствования','сколько бодрствовать'],t:'Сон',
   a:'<strong>Окно бодрствования</strong> — практический, а не медицинский ориентир между снами. Оно меняется по возрасту, времени дня и состоянию малыша. Начните с режима в приложении, наблюдайте за зевотой, взглядом и лёгкостью засыпания, затем двигайте укладывание на 10–15 минут и оценивайте 2–3 дня.'},
  {k:['перевести на 1 сон','один сон','убрать второй сон','один дневной'],t:'Сон',
   a:'<strong>Переход на 1 дневной сон</strong> происходит в 12–18 мес. Признаки готовности: ✦ Отказывается от одного из снов 5+ дней подряд ✦ Трудно уложить на второй сон ✦ Ночной сон не страдает. При переходе: укладывайте дневной сон в 12:00–13:00. Ожидайте 2–4 недели адаптации — малыш может быть капризнее обычного.'},
  {k:['спит мало','мало спит','нормы сна','сколько должен спать'],t:'Сон',
   a:'<strong>Потребность во сне задают диапазоном, а не одной цифрой.</strong> Для 4–12 месяцев часто используют ориентир 12–16 часов в сутки с дневными снами, для 1–2 лет — 11–14 часов. Для новорождённых ритм особенно вариативен. Важны самочувствие, кормление, развитие и динамика дневника; устойчивое отклонение лучше обсудить с педиатром.'},
  {k:['засыпает только с грудью','только с грудью','ассоциация на грудь'],t:'Сон',
   a:'<strong>Засыпание с грудью — распространённый и не обязательно проблемный способ.</strong> Если он перестал подходить семье, меняйте его постепенно: добавьте песню или поглаживание, иногда завершайте кормление до полного засыпания и подключайте другого взрослого. Не сокращайте ночные кормления только ради сна без учёта возраста, веса и питания днём.'},
  // КОРМЛЕНИЕ
  {k:['прикорм','первый прикорм','начало прикорма','когда вводить прикорм'],t:'Кормление',
   a:'<strong>Начало прикорма:</strong> ВОЗ рекомендует начинать примерно с 6 месяцев и для детей на грудном вскармливании, и для детей на смеси. Важны готовность держать голову, интерес к еде и способность глотать пищу. Новые продукты вводите по одному; при недоношенности, плохом наборе веса или аллергии согласуйте старт с педиатром.'},
  {k:['сколько есть','сколько кормить','объём кормления','норма кормления'],t:'Кормление',
   a:'<strong>Объём кормления нельзя безопасно определить только по возрасту.</strong> Он зависит от веса, типа питания, конкретной смеси и состояния ребёнка. На грудном вскармливании ориентируйтесь на сигналы голода и насыщения; для смеси соблюдайте пропорции и объём из инструкции производителя и план педиатра. Мокрые подгузники и динамику веса оценивают вместе с врачом.'},
  {k:['грудь','гв','грудное вскармливание','лактация'],t:'Кормление',
   a:'<strong>Грудное вскармливание:</strong> ВОЗ рекомендует до 2 лет и дольше. Кормление по требованию в первые 3 мес. формирует лактацию. Частые вопросы: ✦ Молока достаточно? — ориентир: 6+ мокрых подгузников в день, нормальная прибавка ✦ Трещины: проверьте захват (ртом ребёнка должна быть захвачена ареола) ✦ Не нужно сцеживать "до последней капли" — это только усилит выработку.'},
  {k:['смесь','искусственное','ИВ','молочная смесь'],t:'Кормление',
   a:'<strong>Кормление смесью:</strong> выбирайте смесь вместе с педиатром и готовьте строго по инструкции, не меняя соотношение воды и порошка. Используйте приготовленную смесь в течение 2 часов, а после начала кормления — в течение 1 часа; остатки выбрасывайте. Не подогревайте бутылочку в микроволновке и соблюдайте правила мытья и стерилизации для вашего возраста и оборудования.'},
  {k:['не ест','отказывается есть','плохой аппетит'],t:'Кормление',
   a:'<strong>Ребёнок плохо ест:</strong> Частая причина — прорезывание зубов (10–11 мес. и 12–19 мес.) или болезнь. Другие причины: ✦ Слишком большие порции (страх) ✦ Скучная еда ✦ Отвлечение (телевизор). Что делать: ✦ Не заставляйте ✦ Предлагайте знакомое рядом с новым ✦ Ешьте вместе — дети подражают взрослым ✦ Нейпрофудия: нормально, если ребёнок принимает новый продукт с 10–15 попытки.'},
  // ПЛАЧ И ПОВЕДЕНИЕ
  {k:['плачет','не успокоить','истерика','постоянно плачет','колики'],t:'Плач',
   a:'<strong>При продолжительном плаче</strong> проверьте голод, подгузник, температуру, тесную одежду и признаки болезни. Можно спокойно носить малыша, покачать, приглушить свет или включить тихий звук подальше от кроватки. Никогда не трясите ребёнка. Если плач необычный, есть температура, рвота, вялость, травма, проблемы с дыханием или ребёнка невозможно успокоить — нужна медицинская оценка.'},
  {k:['зубы','режутся зубы','прорезывание'],t:'Плач',
   a:'<strong>Прорезывание зубов:</strong> Часто помогает охлаждённый, но не замороженный прорезыватель и мягкий массаж дёсен чистым пальцем. Не используйте обезболивающие гели с бензокаином или лидокаином для младенцев. Если есть высокая температура, сильная вялость или отказ от питья, не списывайте это только на зубы — обратитесь к врачу.'},
  {k:['капризничает','капризный','плохое настроение','нервный'],t:'Плач',
   a:'<strong>Капризное поведение</strong> чаще всего связано с: ✦ Усталостью (пропустили окно сна) ✦ Голодом ✦ Скукой ✦ Новым навыком (переворот, ползание — мозг перегружен) ✦ Изменением режима. Совет: ведите дневник — часто видна закономерность. Вечерние капризы (5–7 вечера) — классика, это "час пик" усталости.'},
  // РАЗВИТИЕ
  {k:['когда сядет','садиться','когда начнёт сидеть'],t:'Развитие',
   a:'<strong>Самостоятельное сидение появляется в широком возрастном диапазоне.</strong> Не усаживайте малыша надолго в положение, которое он ещё не удерживает, и давайте больше безопасного времени на полу и на животе под присмотром. Если ребёнок теряет уже освоенный навык или развитие заметно беспокоит вас, обсудите это с педиатром.'},
  {k:['ползать','когда поползёт','не ползает'],t:'Развитие',
   a:'<strong>Ползание развивается по-разному:</strong> дети могут ползать на четвереньках, по-пластунски или перейти к вставанию другим путём. Помогают безопасное время на полу и интересная игрушка чуть в стороне. Не тяните за руки и не форсируйте этап; вопросы по моторике лучше обсуждать на плановом осмотре.'},
  {k:['ходить','когда пойдёт','первые шаги'],t:'Развитие',
   a:'<strong>Первые шаги:</strong> Норма — 9–18 мес. Чаще всего в 12–13 мес. Этапы: ✦ 9–10 мес: встаёт у опоры ✦ 11–12 мес: ходит вдоль опоры ✦ 12–15 мес: самостоятельно. Не используйте ходунки — они тормозят развитие нужных мышц и рефлексов.'},
  {k:['говорить','речь','когда заговорит','не говорит'],t:'Развитие',
   a:'<strong>Речь развивается с индивидуальным темпом.</strong> Разговаривайте, называйте предметы, читайте и отвечайте на жесты и звуки ребёнка. Если малыш теряет навыки, не реагирует на звук или имя, мало использует жесты либо речь заметно беспокоит вас — начните с педиатра; он при необходимости направит к профильному специалисту и на проверку слуха.'},
  // УХОД
  {k:['купать','купание','сколько раз купать'],t:'Уход',
   a:'<strong>Купание малыша:</strong> До заживления пупка — обтирания. После: ✦ 0–6 мес: ежедневно или через день, 5–10 мин ✦ 6–12 мес: 2–3 раза в неделю (если нет загрязнений) ✦ Температура воды: 36–37°C ✦ Не используйте мыло чаще 2 раз в неделю — сушит кожу ✦ Вечернее купание помогает снизить температуру тела и улучшает засыпание.'},
  {k:['подгузник','сколько подгузников','мокрые подгузники'],t:'Уход',
   a:'<strong>Подгузники:</strong> Норма — 6–8 мокрых подгузников в день (признак достаточного питания). Менять каждые 2–3 ч или сразу после дефекации. Опрелости: ✦ Воздушные ванны 15–20 мин/день ✦ Крем под подгузник при каждой смене ✦ Проверьте марку подгузников. Горшок — готовность в 18–24 мес. (не раньше!).'},
  {k:['прогулка','сколько гулять','на улице'],t:'Уход',
   a:'<strong>Прогулки</strong> можно подстраивать под погоду, самочувствие и режим семьи. Одевайте малыша слоями, защищайте от солнца, ветра и перегрева и проверяйте грудь или шею. При экстремальном холоде, жаре, сильном загрязнении воздуха или болезни сократите прогулку и следуйте местным рекомендациям врача и метеослужб.'},
];

const TOPICS = ['Сон','Кормление','Плач','Развитие','Уход'];

const INTENTS = [
  {
    id: 'urgent',
    topic: 'Безопасность',
    patterns: [
      'температура', '39', '40', 'вялый', 'вялая', 'судороги', 'задыхается',
      'синеет', 'рвота', 'обезвоживание', 'кровь', 'травма', 'упал', 'не дышит'
    ],
    answer: '<strong>Похоже на ситуацию, где нужна медицинская оценка.</strong> При затруднённом дыхании, посинении, судорогах, потере сознания, сильной вялости или резком ухудшении срочно вызывайте скорую. Температура 38°C и выше у ребёнка младше 3 месяцев требует быстрой связи с педиатром. Не давайте лекарства и дозировки, не рекомендованные для возраста и веса ребёнка.'
  },
  {
    id: 'sleep_bad',
    topic: 'Сон',
    patterns: ['плохо спит', 'не спит', 'спит плохо', 'часто встает', 'часто просыпается', 'каждый час', 'ночью просыпается', 'сон испортился'],
    answer: '<strong>Если малыш плохо спит ночью</strong>, сначала проверьте 4 вещи: ✦ не перегулял ли перед сном ✦ не короткое ли последнее окно бодрствования ✦ достаточно ли дневного сна ✦ нет ли сильной ассоциации на засыпание (грудь/качание каждый цикл). Практичный шаг на сегодня: начните ритуал на 20–30 минут раньше, приглушите свет, оставьте один спокойный способ укладывания и 3 дня записывайте дневной/ночной сон в дневник.'
  },
  {
    id: 'day_naps',
    topic: 'Сон',
    patterns: ['днем не спит', 'дневной сон', 'короткие сны', 'сон 30 минут', 'просыпается через 30', 'просыпается через 40'],
    answer: '<strong>Короткие дневные сны</strong> часто связаны с окном бодрствования. Если сон 25–40 минут: попробуйте укладывать на 10–15 минут раньше 2–3 дня подряд. Если малыш проснулся бодрым — возможно, недогул; если плачет и трёт глаза — чаще перегул. Помогает одинаковый ритуал, затемнение, белый шум и спокойное продление сна 5–10 минут.'
  },
  {
    id: 'schedule',
    topic: 'Режим',
    patterns: ['режим', 'распорядок', 'график', 'наладить день', 'как выстроить', 'как наладить', 'расписание'],
    answer: '<strong>Чтобы наладить режим</strong>, начните не с идеального расписания, а с 3 якорей: подъём примерно в одно время, подходящие окна бодрствования и спокойный вечерний ритуал. В приложении сгенерируйте режим по возрасту, затем 3 дня отмечайте фактический сон. Если малыш засыпает тяжело — двигайте укладывание на 10–15 минут, а не перестраивайте весь день сразу.'
  },
  {
    id: 'wake_windows',
    topic: 'Сон',
    patterns: ['окно', 'бодрствование', 'сколько бодрствовать', 'гулять между снами', 'между снами'],
    answer: '<strong>Окна бодрствования</strong> лучше подбирать по возрасту и поведению: если малыш долго засыпает и веселится — окно может быть коротким; если плачет, трёт глаза и “перегорает” — окно длинное. Двигайте окно маленькими шагами по 10–15 минут и смотрите на 2–3 дня, не на один сон.'
  },
  {
    id: 'feeding_refusal',
    topic: 'Кормление',
    patterns: ['не ест', 'отказывается от еды', 'отказывается от груди', 'мало ест', 'плохо ест', 'не берет грудь'],
    answer: '<strong>Если малыш стал хуже есть</strong>, проверьте сон, зубы, болезнь и не слишком ли большие порции. Не заставляйте: лучше чаще предлагать маленькие объёмы, убрать отвлечения и следить за мокрыми подгузниками. Если есть вялость, мало мочи, высокая температура или отказ от питья — нужна связь с врачом.'
  }
];

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function _getBabyContext() {
  const storage = typeof localStorage !== 'undefined' ? localStorage : null;
  const age = parseInt((storage && storage.getItem('babymode_last_age')) || '0');
  const name = (storage && storage.getItem('babymode_baby_name')) || '';
  return { age, name };
}

function _injectAgeContext(answer, age) {
  if (!age) return answer;
  // Append age-specific note if not already covered by keyword match
  const ageNote = _getAgeNote(age);
  return ageNote ? answer + `\n\n<span class="chat-age-note">👶 Для ${age} мес.: ${ageNote}</span>` : answer;
}

function _getAgeNote(age) {
  if (age >= 3 && age <= 5)  return 'Возможен регресс сна 4 мес. — сохраняйте ритуал.'
  if (age >= 6 && age <= 8)  return 'Частый ориентир суммарного сна — 12–16 ч с дневными снами.'
  if (age >= 9 && age <= 11) return 'Частый ориентир суммарного сна — 12–16 ч; новые навыки могут временно менять сон.'
  if (age >= 12 && age <= 18) return 'Частый ориентир — 11–14 ч; переход к одному дневному сну происходит постепенно.'
  if (age >= 19 && age <= 36) return 'Частый ориентир — 11–14 ч суммарного сна, обычно с одним дневным сном.'
  return '';
}

function findAnswer(q) {
  const low = normalizeQuestion(q);
  let best = null, bestScore = 0;
  const candidates = [...INTENTS, ...FAQ.map(item => ({
    id: item.t,
    topic: item.t,
    patterns: item.k,
    answer: item.a
  }))];

  for (const item of candidates) {
    let score = 0;
    for (const k of item.patterns) {
      const normalizedKey = normalizeQuestion(k);
      if (low.includes(normalizedKey)) score += normalizedKey.length + 10;
      else if (hasTokenOverlap(low, normalizedKey)) score += 4;
    }
    if (score > bestScore) { bestScore = score; best = item; }
  }
  const { age, name } = _getBabyContext();
  const baseAnswer = best && bestScore >= 4
    ? (best.id === 'urgent' ? best.answer : _injectAgeContext(best.answer, age))
    : buildFallbackAnswer(q, age, name);
  const answerWithStep = appendNextStepHtml(baseAnswer, q);

  // v2: prepend personal diary context if premium and 3+ days
  const canPersonalize = typeof SUB === 'undefined' || SUB.can('aiAnalysis');
  if (canPersonalize && typeof getLogs === 'function' && typeof SleepIntel !== 'undefined') {
    const logs = getLogs();
    if (logs.length >= 3 && age) {
      const summary = SleepIntel.summarizeSleepLogs(logs, age);
      const norms   = SleepIntel.getSleepNorms(age);
      const nightOk = summary.avgNight >= norms.nightMin - 30;
      const debt    = summary.sleepDebt >= 60;
      const babyRef = escapeHtml(name || 'малыш');
      const trendTxt = { improving: 'улучшается 📈', worse: 'ухудшается 📉', flat: 'стабильный 📊' }[summary.trend] || '';

      const personalBlock = `<div class="chat-personal-block">
        <div class="cpb-label">📊 По данным дневника ${babyRef} (${logs.length} дн.):</div>
        <div class="cpb-stats">
          <span>🌙 Ночной: <b>${(summary.avgNight/60).toFixed(1)}ч</b> ${nightOk ? '✅' : '⚠️'}</span>
          <span>☀️ Дневной: <b>${(summary.avgDay/60).toFixed(1)}ч</b></span>
          ${debt ? `<span>⚡ Недосып: <b>${(summary.sleepDebt/60).toFixed(1)}ч</b></span>` : ''}
          ${trendTxt ? `<span>Тренд: ${trendTxt}</span>` : ''}
        </div>
      </div>`;

      return personalBlock + answerWithStep;
    }
  }

  return answerWithStep;
}

function getSuggestedNextStep(question, answer = '') {
  const normalizedQuestion = normalizeQuestion(question);
  const text = normalizeQuestion(`${question} ${answer}`);
  if (/(не дыш|задыха|синеет|судорог|без созн|скорую|срочно|112)/.test(normalizedQuestion)) {
    return 'Позвоните в скорую помощь или 112 сейчас и следуйте указаниям диспетчера.';
  }
  if (/(корм|груд|смес|бутыл|не ест|аппетит)/.test(text)) {
    return 'На ближайшем кормлении спокойно предложите привычный объём без давления и отметьте самочувствие малыша.';
  }
  if (/(плач|крич|колик|беспоко)/.test(text)) {
    return 'Сейчас по очереди проверьте голод, подгузник, температуру, усталость и признаки боли.';
  }
  if (/(сон|спит|засып|просып|режим|окно|бодрств)/.test(text)) {
    return 'Сегодня измените только одно окно сна на 10–15 минут и запишите результат в дневник.';
  }
  return 'Добавьте возраст малыша и последние события сна или кормления, чтобы получить более точный план.';
}

function nextStepBlock(step) {
  return `<div class="chat-next-step"><strong>Следующий шаг</strong><span>${escapeHtml(step)}</span></div>`;
}

function appendNextStepHtml(answer, question) {
  const html = String(answer || '');
  if (/chat-next-step|следующий шаг\s*:/i.test(html)) return html;
  return html + nextStepBlock(getSuggestedNextStep(question, html.replace(/<[^>]*>/g, ' ')));
}

function normalizeQuestion(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasTokenOverlap(question, pattern) {
  const qTokens = new Set(question.split(' ').filter(token => token.length >= 4));
  const pTokens = pattern.split(' ').filter(token => token.length >= 4);
  if (!pTokens.length) return false;
  return pTokens.some(token => qTokens.has(token));
}

function buildFallbackAnswer(q, age, name) {
  const babyRef = escapeHtml(name || 'малыша');
  const ageText = age ? ` Возраст ${age} мес. я учту.` : '';
  return `<strong>Уточните пару деталей, и я дам конкретный план.</strong>${ageText}<br><br>
  Напишите: 1) возраст ${babyRef}, 2) что именно происходит, 3) когда началось, 4) сон/кормление за сегодня. Например: “6 мес, просыпается каждые 40 минут ночью, днём спал 3 раза”.<br><br>
  Если есть температура, вялость, проблемы с дыханием, судороги, обезвоживание или резкое ухудшение — лучше сразу связаться с педиатром.`;
}

const AI_CONSENT_KEY = 'babymode_ai_consent_v2';
let _chatBusy = false;
let _consentResolve = null;

function _getAiTelegramInitData() {
  try { return window.Telegram?.WebApp?.initData || ''; }
  catch (_) { return ''; }
}

function _canUseOnlineAi() {
  return Boolean(window.BABY_AI_ENDPOINT) && (window.BabyAccount ? BabyAccount.canUseServer() : Boolean(_getAiTelegramInitData()));
}

function _requestAi(body, options) {
  const config = {
    method: 'POST',
    signal: options?.signal,
    headers: { 'Content-Type': 'application/json' },
    body
  };
  return window.BabyAccount
    ? BabyAccount.request(window.BABY_AI_ENDPOINT || '', config)
    : fetch(window.BABY_AI_ENDPOINT || '', { ...config, body: JSON.stringify(body) });
}

function buildAiDiary(logs, now = new Date()) {
  const cutoff = new Date(now.getTime() - 13 * 86400000);
  cutoff.setHours(0, 0, 0, 0);
  return (Array.isArray(logs) ? logs : []).filter(log => {
    const date = /^\d{4}-\d{2}-\d{2}$/.test(String(log?.date || '')) ? new Date(`${log.date}T12:00:00`) : null;
    return date && !Number.isNaN(date.getTime()) && date >= cutoff && date <= now;
  }).sort((a, b) => String(a.date).localeCompare(String(b.date))).slice(-14).map(log => ({
    date: log.date,
    wake: log.wake || null,
    bedtime: log.bed || null,
    day_sleep_min: Math.max(0, Math.round(Number(log.dayNaps) || 0)),
    night_sleep_min: Math.max(0, Math.round(Number(log.nightLen) || 0)),
    night_wakings: Math.max(0, Math.round(Number(log.nightWakings) || 0)),
    tags: Array.isArray(log.tags) ? log.tags.slice(0, 8) : []
  }));
}

function buildAiPayload(question) {
  const { age } = _getBabyContext();
  const canAnalyzeDiary = typeof SUB !== 'undefined' && SUB.can('aiAnalysis');
  return {
    initData: _getAiTelegramInitData(),
    consent: true,
    question: String(question || '').trim().slice(0, 1500),
    ageMonths: age || null,
    diary: canAnalyzeDiary && typeof getLogs === 'function' ? buildAiDiary(getLogs()) : []
  };
}

function hasAiConsent() {
  try { return localStorage.getItem(AI_CONSENT_KEY) === 'granted'; }
  catch (_) { return false; }
}

function requestAiConsent() {
  if (hasAiConsent()) return Promise.resolve(true);
  const modal = document.getElementById('aiConsentModal');
  if (!modal) return Promise.resolve(false);
  modal.style.display = 'flex';
  return new Promise(resolve => { _consentResolve = resolve; });
}

function acceptAiConsent() {
  localStorage.setItem(AI_CONSENT_KEY, 'granted');
  if (window.BabyCloudSync) BabyCloudSync.markSettingsChanged();
  if (window.BabyAnalytics) BabyAnalytics.track('ai_consent_granted', { version: '2026-07-24-v1' });
  finishAiConsent(true);
}

function closeAiConsent() {
  if (window.BabyAnalytics) BabyAnalytics.track('ai_consent_declined', { version: '2026-07-24-v1' });
  finishAiConsent(false);
}

function finishAiConsent(granted) {
  const modal = document.getElementById('aiConsentModal');
  if (modal) modal.style.display = 'none';
  const resolve = _consentResolve;
  _consentResolve = null;
  if (resolve) resolve(granted);
  if (typeof renderProfilePage === 'function') renderProfilePage();
}

async function revokeAiConsent() {
  localStorage.removeItem(AI_CONSENT_KEY);
  if (window.BabyCloudSync) BabyCloudSync.markSettingsChanged();
  const endpoint = window.BABY_AI_ENDPOINT || '';
  const initData = _getAiTelegramInitData();
  if (endpoint && _canUseOnlineAi()) {
    try {
      await _requestAi({ initData, action: 'revoke_consent' });
    } catch (_) {}
  }
  if (window.BabyAnalytics) BabyAnalytics.track('ai_consent_revoked');
  if (typeof renderProfilePage === 'function') renderProfilePage();
  if (typeof showToast === 'function') showToast('Согласие для ИИ-помощника отозвано');
}

function manageAiConsent() {
  if (!hasAiConsent()) {
    if (typeof goPage === 'function') goPage('chat', document.getElementById('bn-chat'));
    if (typeof showToast === 'function') showToast('Согласие появится перед первым вопросом');
    return;
  }
  const run = ok => { if (ok) revokeAiConsent(); };
  const tg = window.Telegram?.WebApp;
  if (tg && typeof tg.showConfirm === 'function') tg.showConfirm('Отозвать согласие на передачу данных ИИ-помощнику?', run);
  else run(window.confirm('Отозвать согласие на передачу данных ИИ-помощнику?'));
}

async function chatSend() {
  const inp = document.getElementById('chatInput');
  const q = inp.value.trim();
  if (!q || _chatBusy) return;
  if (q.length > 1500) { if (typeof showToast === 'function') showToast('Сократите вопрос до 1500 символов'); return; }
  if (window.BabyAccount && !BabyAccount.isMiniApp() && !BabyAccount.isAuthenticated()) {
    BabyAccount.requestLogin('Войдите, чтобы задать вопрос ИИ-помощнику и сохранить историю ответов на ваших устройствах.');
    return;
  }
  addMsg(q, 'user');
  inp.value = '';
  const initData = _getAiTelegramInitData();
  const endpoint = window.BABY_AI_ENDPOINT || '';
  if (!_canUseOnlineAi() || !endpoint) {
    setTimeout(() => addMsg(findAnswer(q), 'bot'), 300);
    return;
  }

  const consent = await requestAiConsent();
  if (!consent) {
    addMsg('Без согласия я не отправляю вопрос внешнему ИИ. Ниже оставляю локальную подсказку:<br><br>' + findAnswer(q), 'bot');
    return;
  }

  _chatBusy = true;
  setChatBusy(true);
  const typing = addMsg('<span class="chat-typing">Готовлю ответ<span>...</span></span>', 'bot');
  if (window.BabyAnalytics) BabyAnalytics.track('ai_question_sent', { length: q.length, diary_days: buildAiPayload(q).diary.length });
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    const response = await _requestAi(buildAiPayload(q), { signal: controller.signal });
    clearTimeout(timeout);
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.answer) throw Object.assign(new Error(data.error || 'request_failed'), { code: data.error, limit: data.limit });
    typing?.remove();
    addMsg(formatAiAnswer(data.answer, data.sources, data.request_id, q), 'bot');
    renderChatContext(data.remaining);
    if (window.BabyAnalytics) BabyAnalytics.track('ai_answer_received', { remaining: data.remaining, mode: data.mode || 'unknown' });
  } catch (error) {
    typing?.remove();
    const message = error?.code === 'daily_limit'
      ? `Лимит онлайн-ответов на сегодня исчерпан (${Number(error.limit) || 4}). Я всё равно могу дать локальную подсказку:<br><br>${findAnswer(q)}`
      : `Онлайн-помощник сейчас недоступен. Вот локальная подсказка, чтобы не оставлять вас без ответа:<br><br>${findAnswer(q)}`;
    addMsg(message, 'bot');
    if (window.BabyAnalytics) BabyAnalytics.track('ai_answer_failed', { reason: String(error?.code || error?.name || 'unknown').slice(0, 40) });
  } finally {
    _chatBusy = false;
    setChatBusy(false);
  }
}

function setChatBusy(busy) {
  const button = document.getElementById('btn-chat-send');
  const input = document.getElementById('chatInput');
  if (button) button.disabled = busy;
  if (input) input.disabled = busy;
}

function renderChatContext(remaining) {
  if (typeof document === 'undefined') return;
  const strip = document.getElementById('chatContextStrip');
  const limit = document.getElementById('chatLimitLabel');
  const canAnalyzeDiary = typeof SUB !== 'undefined' && SUB.can('aiAnalysis');
  const logs = typeof getLogs === 'function' ? getLogs() : [];
  const diaryDays = canAnalyzeDiary ? buildAiDiary(logs).length : 0;

  if (limit) {
    limit.textContent = Number.isFinite(Number(remaining))
      ? `Осталось ${Math.max(0, Number(remaining))} сегодня`
      : `До ${canAnalyzeDiary ? 40 : 4} вопросов в день`;
  }
  if (strip) {
    const text = canAnalyzeDiary
      ? diaryDays
        ? `Дневник за ${diaryDays} ${diaryDays === 1 ? 'день' : diaryDays < 5 ? 'дня' : 'дней'} подключён к диалогу`
        : 'Добавьте записи в дневник для персонального разбора'
      : 'Ответ учитывает возраст малыша. Анализ дневника доступен в Premium';
    strip.classList.toggle('is-premium-context', canAnalyzeDiary && diaryDays > 0);
    strip.innerHTML = `<i data-lucide="${canAnalyzeDiary && diaryDays ? 'shield-check' : 'info'}"></i><span>${text}</span>`;
  }
  if (typeof refreshIcons === 'function') refreshIcons();
}

function formatAiAnswer(answer, sources, requestId, question = '') {
  const raw = String(answer || '');
  const explicitStep = raw.match(/(?:^|\n)\s*Следующий шаг\s*:\s*([^\n]+)/i);
  const body = explicitStep ? raw.replace(explicitStep[0], '').trim() : raw;
  const text = escapeHtml(body).replace(/\n/g, '<br>');
  const nextStep = nextStepBlock(explicitStep?.[1]?.trim() || getSuggestedNextStep(question, raw));
  const validSources = (Array.isArray(sources) ? sources : []).filter(source => /^https:\/\//.test(String(source?.url || ''))).slice(0, 3);
  const links = validSources.length
    ? `<div class="chat-sources"><strong>Проверенные источники</strong>${validSources.map(source => `<a href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(source.label || 'Источник')}</a>`).join('')}</div>`
    : '';
  const safeRequestId = /^[0-9a-f-]{36}$/i.test(String(requestId || '')) ? String(requestId) : '';
  const feedback = safeRequestId
    ? `<div class="chat-feedback" data-request-id="${safeRequestId}"><span>Ответ помог?</span><div><button type="button" onclick="sendAiFeedback('${safeRequestId}','helpful',this)">Полезно</button><button type="button" onclick="sendAiFeedback('${safeRequestId}','not_helpful',this)">Не помогло</button></div></div>`
    : '';
  return `${text}${nextStep}${links}${feedback}`;
}

async function sendAiFeedback(requestId, rating, button) {
  const group = button?.closest('.chat-feedback');
  if (!group || !/^[0-9a-f-]{36}$/i.test(String(requestId || '')) || !['helpful', 'not_helpful'].includes(rating)) return;
  group.querySelectorAll('button').forEach(item => { item.disabled = true; });
  try {
    const response = await _requestAi({ initData: _getAiTelegramInitData(), action: 'feedback', requestId, rating });
    if (!response.ok) throw new Error('feedback_failed');
    group.innerHTML = '<span>Спасибо, это поможет улучшить ответы.</span>';
    if (window.BabyAnalytics) BabyAnalytics.track('ai_feedback', { rating });
  } catch (_) {
    group.querySelectorAll('button').forEach(item => { item.disabled = false; });
    if (typeof showToast === 'function') showToast('Не удалось сохранить оценку');
  }
}

function chatTopic(t) {
  const items = FAQ.filter(f => f.t === t);
  const random = items[Math.floor(Math.random() * items.length)];
  addMsg('Расскажи о теме: ' + t, 'user');
  setTimeout(() => addMsg(random.a, 'bot'), 300);
}

function chatQuickAction(action) {
  const { age } = _getBabyContext();
  const logs = typeof getLogs === 'function' ? getLogs() : [];
  if (action === 'next_sleep') {
    const blocks = typeof getTodayScheduleBlocks === 'function' ? getTodayScheduleBlocks() : [];
    const next = window.BabyCoach ? BabyCoach.getNextSleep(blocks, new Date()) : null;
    addMsg('Когда следующий сон?', 'user');
    addMsg(next
      ? `<strong>Следующий сон около ${escapeHtml(next.time)}</strong><br>До него примерно ${escapeHtml(next.countdown)}. ${next.minutesUntil > 10 ? `Начните подготовку через ${escapeHtml(next.preparation)}.` : 'Спокойный ритуал лучше начать уже сейчас.'}`
      : 'На сегодня не вижу будущего сна. Соберите или обновите режим на главной, и я сразу посчитаю время.', 'bot');
    return;
  }

  if (action === 'weekly') {
    if (typeof SUB !== 'undefined' && !SUB.can('aiAnalysis')) { SUB.requirePremium('aiAnalysis', function(){}); return; }
    const progress = window.BabyCoach ? BabyCoach.getLearningProgress(logs) : { ready: logs.length >= 3, completed: logs.length, required: 3 };
    if (!progress.ready) {
      addMsg('Итог недели', 'user');
      addMsg(`Для персонального итога нужно 3 дня дневника. Сейчас собрано ${progress.completed}/${progress.required}.`, 'bot');
      return;
    }
    const review = window.BabyCoach && typeof SleepIntel !== 'undefined' ? BabyCoach.buildWeeklyReview(logs, age || 6, SleepIntel) : null;
    addMsg('Покажи итог недели', 'user');
    if (!review) { addMsg('Пока не удалось собрать итог. Проверьте записи дневника.', 'bot'); return; }
    addMsg(`<strong>${escapeHtml(review.title)}</strong><br>${escapeHtml(review.trend)}<br><br>🌙 Ночной сон: <b>${escapeHtml(review.night)}</b><br>☀️ Дневной сон: <b>${escapeHtml(review.day)}</b><br>Недосып: <b>${escapeHtml(review.sleepDebt)}</b><br><br><strong>Главный фокус:</strong> ${escapeHtml(review.focus)}<br>${escapeHtml(review.reason)}`, 'bot');
    if (window.BabyAnalytics) BabyAnalytics.track('weekly_review_opened', { source: 'chat' });
    return;
  }

  if (action === 'bad_night' && typeof SUB !== 'undefined' && !SUB.can('aiAnalysis')) {
    SUB.requirePremium('aiAnalysis', function(){});
    return;
  }
  const questions = {
    bad_night: 'Разбери прошлую ночь по моему дневнику: что могло повлиять и что сделать сегодня?',
    today: 'Что сейчас важнее всего учесть в режиме малыша сегодня?',
    transition: 'Как понять, что малыш готов к переходу на меньшее количество дневных снов?'
  };
  const input = document.getElementById('chatInput');
  if (!input || !questions[action]) return;
  input.value = questions[action];
  chatSend();
}

function addMsg(text, role) {
  const box = document.getElementById('chatMessages');
  if (!box) return;
  const div = document.createElement('div');
  div.className = 'msg ' + role;
  if (role === 'user') div.textContent = text;
  else div.innerHTML = text;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
  return div;
}

function chatKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); chatSend(); }
}

let _chatInited = false;
function initChat() {
  if (_chatInited) return;
  _chatInited = true;
  const { age, name } = _getBabyContext();
  const safeName = escapeHtml(name);
  const babyInfo = name && age
    ? `Мне известно, что ${safeName} ${age} мес. — отвечаю с учётом этого. `
    : name
    ? `Мне известно, что вашего малыша зовут ${safeName}. `
    : age
    ? `Мне известно, что малышу ${age} мес. `
    : '';
  addMsg(`<strong>Здравствуйте${name ? ', ' + safeName : ''}.</strong><br>Я помогу разобраться со сном и режимом малыша. ${babyInfo}Опишите ситуацию своими словами, а я предложу понятный следующий шаг и отмечу, когда лучше обратиться к врачу.`, 'bot');
  initQuickChatActions(document.getElementById('chatQuickActions'));
  renderChatContext();
}

function initQuickChatActions(container) {
  if (!container || container.children.length) return;
  const actions = [
    ['next_sleep', 'clock-3', 'Когда следующий сон'],
    ['bad_night', 'moon-star', 'Разобрать ночь', true],
    ['weekly', 'chart-no-axes-column-increasing', 'Итог недели', true],
    ['transition', 'route', 'Переход между снами']
  ];
  actions.forEach(([id, icon, label, premium]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'chat-quick-btn';
    button.innerHTML = `<i data-lucide="${icon}"></i><span>${label}${premium ? ' <small>Premium</small>' : ''}</span>`;
    button.onclick = () => { chatQuickAction(id); if (typeof hapticLight === 'function') hapticLight(); };
    container.appendChild(button);
  });
  if (typeof refreshIcons === 'function') refreshIcons();
}

let _topicsInited = false;
function initTopics(container) {
  if (_topicsInited) return;
  _topicsInited = true;
  TOPICS.forEach(t => {
    const b = document.createElement('button');
    b.className = 'chat-topic-btn'; b.textContent = t;
    b.onclick = () => { chatTopic(t); if(typeof hapticLight==='function') hapticLight(); };
    container.appendChild(b);
  });
}

if (typeof module !== 'undefined') {
  module.exports = {
    findAnswer,
    normalizeQuestion,
    buildAiDiary,
    buildAiPayload,
    formatAiAnswer,
    getSuggestedNextStep
  };
}
