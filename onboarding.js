// ─── Onboarding v2 ────────────────────────────────────────────────────────────
// 5-slide welcome: features + baby name + photo + trial offer

const ONBOARD_KEY = 'babymode_onboarded_v2';

const SLIDES = [
  {
    img: 'img_sleep.png',
    emoji: '🌙',
    title: 'Спокойный режим малыша',
    text: 'Соберу понятный план сна, кормления и бодрствования по возрасту, помогу заметить закономерности и подскажу, что делать сегодня'
  },
  {
    img: 'img_play.png',
    emoji: '🍼',
    title: 'План дня за минуту',
    text: 'Укажите возраст и время подъёма — приложение рассчитает окна бодрствования, дневные сны, кормления и вечерний ритуал'
  },
  {
    img: 'img_feed.png',
    emoji: '💬',
    title: 'ИИ-помощник рядом',
    text: 'Задавайте вопросы о сне, плаче, кормлении и скачках развития. Если вести дневник 3+ дня, ответы будут учитывать данные малыша'
  },
  {
    type: 'name', // special slide — input baby name
    emoji: '👶',
    title: 'Как зовут малыша?',
    text: 'Персонализируем приложение под вашего ребёнка ♡'
  },
  {
    type: 'photo', // special slide — upload baby photo
    emoji: '📸',
    title: 'Добавьте фото малыша',
    text: 'Оно будет отображаться в приложении (хранится только на вашем устройстве)'
  }
];

let _currentSlide = 0;
let _onboardEl = null;

function initOnboarding() {
  if (localStorage.getItem(ONBOARD_KEY)) return;
  if (window.BabyAnalytics) BabyAnalytics.track('onboarding_start');
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

  requestAnimationFrame(() => _onboardEl.classList.add('ob-visible'));
}

function _renderSlide(idx) {
  const s = SLIDES[idx];
  const slidesEl = document.getElementById('obSlides');
  const dotsEl   = document.getElementById('obDots');
  const btnEl    = document.getElementById('obNextBtn');
  const isLast   = idx === SLIDES.length - 1;

  if (s.type === 'name') {
    slidesEl.innerHTML = `
      <div class="ob-slide">
        <div style="font-size:3.5rem;margin-bottom:12px;animation:float 4s ease-in-out infinite">${s.emoji}</div>
        <h2 class="ob-title">${s.title}</h2>
        <p class="ob-text" style="margin-bottom:16px">${s.text}</p>
        <div class="ob-name-wrap">
          <input class="ob-name-input" id="obBabyName" type="text"
            placeholder="Имя малыша..." maxlength="20"
            value="${localStorage.getItem('babymode_baby_name') || ''}"
            oninput="this.value=this.value.replace(/[^а-яёА-ЯЁa-zA-Z\\s-]/g,'')">
          <input class="ob-name-input ob-birth-input" id="obBabyBirthdate" type="date"
            max="${new Date().toISOString().slice(0, 10)}"
            value="${localStorage.getItem('babymode_baby_birthdate') || ''}">
        </div>
        <p style="font-size:.72rem;color:var(--text-hint);font-weight:500;text-align:center">Дата нужна, чтобы поздравлять и давать подсказки по возрасту. Можно пропустить</p>
      </div>
    `;
    setTimeout(() => {
      const inp = document.getElementById('obBabyName');
      if (inp) inp.focus();
    }, 300);
  } else if (s.type === 'photo') {
    const savedPhoto = localStorage.getItem('babymode_photo');
    slidesEl.innerHTML = `
      <div class="ob-slide">
        <div style="font-size:2.5rem;margin-bottom:8px;animation:float 4s ease-in-out infinite">${s.emoji}</div>
        <h2 class="ob-title">${s.title}</h2>
        <p class="ob-text">${s.text}</p>
        <div class="ob-photo-area" id="obPhotoArea" onclick="obPickPhoto()">
          ${savedPhoto ? `<img src="${savedPhoto}" alt="Фото малыша" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:50%">` : `
          <div class="ob-photo-icon">📷</div>
          <div class="ob-photo-label">Добавить фото</div>
          `}
        </div>
        <p style="font-size:.72rem;color:var(--text-hint);font-weight:500;text-align:center;margin-top:8px">Можно пропустить</p>
      </div>
    `;
  } else {
    slidesEl.innerHTML = `
      <div class="ob-slide">
        <div class="ob-img-wrap">
          <img src="${s.img}" alt="${s.title}" class="ob-img" loading="lazy">
          <div class="ob-img-glow"></div>
        </div>
        <h2 class="ob-title ob-title-grad">${s.title}</h2>
        <p class="ob-text">${s.text}</p>
      </div>
    `;
  }

  dotsEl.innerHTML = SLIDES.map((_, i) =>
    `<div class="ob-dot ${i === idx ? 'active' : ''}" onclick="_jumpSlide(${i})"></div>`
  ).join('');

  if (isLast) {
    btnEl.textContent = '🌸 Начать!';
    btnEl.style.background = 'linear-gradient(135deg,#FF9A7B,#C97BDB)';
  } else {
    btnEl.textContent = 'Далее →';
    btnEl.style.background = '';
  }
}

function obPickPhoto() {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = 'image/*';
  input.onchange = e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const b64 = ev.target.result;
      localStorage.setItem('babymode_photo', b64);
      // Update photo area preview
      const area = document.getElementById('obPhotoArea');
      if (area) {
        area.innerHTML = `<img src="${b64}" alt="Фото малыша" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:50%">`;
      }
      if (typeof _applyBabyPhoto === 'function') _applyBabyPhoto(b64);
      if (typeof hapticSuccess === 'function') hapticSuccess();
    };
    reader.readAsDataURL(file);
  };
  input.click();
}

function _jumpSlide(idx) {
  _saveCurrent();
  _currentSlide = idx;
  _renderSlide(idx);
}

function nextSlide() {
  _saveCurrent();
  if (_currentSlide < SLIDES.length - 1) {
    _currentSlide++;
    _renderSlide(_currentSlide);
    if (typeof hapticSel === 'function') hapticSel();
  } else {
    finishOnboarding();
  }
}

function _saveCurrent() {
  const s = SLIDES[_currentSlide];
  if (s.type === 'name') {
    const inp = document.getElementById('obBabyName');
    const birth = document.getElementById('obBabyBirthdate');
    const name = inp && inp.value.trim() ? inp.value.trim() : '';
    const birthdate = birth && birth.value ? birth.value : '';
    if (name || birthdate) {
      if (name) localStorage.setItem('babymode_baby_name', name);
      if (birthdate) localStorage.setItem('babymode_baby_birthdate', birthdate);
      if (window.BabyAnalytics) {
        BabyAnalytics.saveBabyProfile({
          name,
          birthdate,
          ageMonths: localStorage.getItem('babymode_last_age') || ''
        });
      }
      if (name && typeof _applyBabyName === 'function') _applyBabyName(name);
    }
  }
}

function skipOnboarding() {
  _saveCurrent();
  finishOnboarding();
}

function finishOnboarding() {
  _saveCurrent();
  localStorage.setItem(ONBOARD_KEY, '1');
  if (window.BabyAnalytics) BabyAnalytics.track('onboarding_complete');

  if (_onboardEl) {
    _onboardEl.classList.remove('ob-visible');
    _onboardEl.classList.add('ob-hiding');
    setTimeout(() => { if (_onboardEl) _onboardEl.remove(); }, 400);
  }
  if (typeof hapticSuccess === 'function') hapticSuccess();

  // Show trial offer after 1s
  setTimeout(() => {
    if (typeof SUB !== 'undefined' && SUB.getStatus() === 'free') {
      const trialStarted = !!localStorage.getItem('babymode_trial_start');
      if (!trialStarted) {
        showToast('🎁 Активируйте 7 дней Premium бесплатно!');
      }
    }
    if (typeof initNotifications === 'function') initNotifications();
  }, 1000);
}
