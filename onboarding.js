// ─── Onboarding ───────────────────────────────────────────────────────────────
// Shows a 4-slide welcome flow on first launch. Stored in localStorage.

const ONBOARD_KEY = 'babymode_onboarded_v1';

const SLIDES = [
  {
    img: 'img_sleep.png',
    emoji: '🌙',
    title: 'Сон по науке',
    text: 'Расписание на основе wake windows — рекомендаций ВОЗ, AAP и NHS для вашего возраста малыша'
  },
  {
    img: 'img_play.png',
    emoji: '🎮',
    title: 'Активность и развитие',
    text: 'Игры, гимнастика и прогулки расставлены в оптимальное время дня — когда малыш в лучшем настроении'
  },
  {
    img: 'img_feed.png',
    emoji: '🍼',
    title: 'Кормление по режиму',
    text: 'Грудное, смешанное или прикорм — расписание подстраивается под тип кормления и возраст'
  },
  {
    img: 'img_walk.png',
    emoji: '📊',
    title: 'Дневник и напоминания',
    text: 'Ведите записи, получайте напоминания в Telegram и смотрите аналитику сна за неделю'
  }
];

let _currentSlide = 0;
let _onboardEl = null;

function initOnboarding() {
  if (localStorage.getItem(ONBOARD_KEY)) return; // already seen
  _renderOnboarding();
}

function _renderOnboarding() {
  _onboardEl = document.createElement('div');
  _onboardEl.id = 'onboarding';
  _onboardEl.innerHTML = `
    <div class="ob-backdrop"></div>
    <div class="ob-card">
      <button class="ob-skip" onclick="skipOnboarding()">Пропустить</button>
      <div class="ob-slides" id="obSlides"></div>
      <div class="ob-dots" id="obDots"></div>
      <button class="ob-btn" id="obNextBtn" onclick="nextSlide()">Далее →</button>
    </div>
  `;
  document.body.appendChild(_onboardEl);
  _renderSlide(0);

  // Swipe support
  let startX = 0;
  const card = _onboardEl.querySelector('.ob-card');
  card.addEventListener('touchstart', e => { startX = e.touches[0].clientX; }, {passive:true});
  card.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - startX;
    if (dx < -50) nextSlide();
    else if (dx > 50 && _currentSlide > 0) { _currentSlide -= 2; nextSlide(); }
  }, {passive:true});

  // Animate in
  requestAnimationFrame(() => _onboardEl.classList.add('ob-visible'));
}

function _renderSlide(idx) {
  const s = SLIDES[idx];
  const slidesEl = document.getElementById('obSlides');
  const dotsEl   = document.getElementById('obDots');
  const btnEl    = document.getElementById('obNextBtn');

  slidesEl.innerHTML = `
    <div class="ob-slide ob-slide-in">
      <div class="ob-img-wrap">
        <img src="${s.img}" alt="${s.title}" class="ob-img" loading="lazy">
        <div class="ob-img-glow"></div>
      </div>
      <div class="ob-emoji">${s.emoji}</div>
      <h2 class="ob-title">${s.title}</h2>
      <p class="ob-text">${s.text}</p>
    </div>
  `;

  dotsEl.innerHTML = SLIDES.map((_, i) =>
    `<div class="ob-dot ${i === idx ? 'active' : ''}" onclick="_jumpSlide(${i})"></div>`
  ).join('');

  btnEl.textContent = idx === SLIDES.length - 1 ? '🚀 Начать!' : 'Далее →';
  btnEl.style.background = idx === SLIDES.length - 1
    ? 'linear-gradient(135deg,#d946ef,#8b5cf6)'
    : '';
}

function _jumpSlide(idx) {
  _currentSlide = idx;
  _renderSlide(idx);
}

function nextSlide() {
  if (_currentSlide < SLIDES.length - 1) {
    _currentSlide++;
    _renderSlide(_currentSlide);
    if (typeof hapticSel === 'function') hapticSel();
  } else {
    finishOnboarding();
  }
}

function skipOnboarding() {
  finishOnboarding();
}

function finishOnboarding() {
  localStorage.setItem(ONBOARD_KEY, '1');
  if (_onboardEl) {
    _onboardEl.classList.remove('ob-visible');
    _onboardEl.classList.add('ob-hiding');
    setTimeout(() => { if (_onboardEl) _onboardEl.remove(); }, 400);
  }
  if (typeof hapticSuccess === 'function') hapticSuccess();
  // Show notification permission prompt after 1.5s
  setTimeout(initNotifications, 1500);
}
