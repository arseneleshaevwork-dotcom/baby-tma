// ─── Onboarding v2 ────────────────────────────────────────────────────────────
// 5-slide welcome: features + baby name + photo + trial offer

const ONBOARD_KEY = 'babymode_onboarded_v2';

const SLIDES = [
  {
    type: 'welcome',
    emoji: '🌸',
    title: 'Добро пожаловать в спокойный режим',
    text: 'Я помогу собрать день малыша, вести дневник сна и мягко напоминать о важных событиях.',
    chips: ['режим на сегодня', 'дневник сна', 'важные даты']
  },
  {
    type: 'profile',
    emoji: '👶',
    title: 'Расскажите о малыше',
    text: 'Эти данные нужны для точного возраста, поздравлений и персональных подсказок.'
  },
  {
    type: 'reminders',
    emoji: '🔔',
    title: 'Напоминать о важном?',
    text: 'Я могу напоминать о днях рождения, месячных этапах и ближайших событиях режима после генерации дня.'
  }
];

let _currentSlide = 0;
let _onboardEl = null;

function initOnboarding() {
  if (localStorage.getItem(ONBOARD_KEY)) return;
  _currentSlide = 0;
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

  if (s.type === 'profile') {
    const savedName = _sanitizeOnboardingName(localStorage.getItem('babymode_baby_name'));
    const savedBirthdate = /^\d{4}-\d{2}-\d{2}$/.test(localStorage.getItem('babymode_baby_birthdate') || '')
      ? localStorage.getItem('babymode_baby_birthdate') : '';
    const savedWakeTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(localStorage.getItem('babymode_wake_time') || '')
      ? localStorage.getItem('babymode_wake_time') : (document.getElementById('wakeTime')?.value || '07:00');
    slidesEl.innerHTML = `
      <div class="ob-slide ob-profile-slide">
        <div class="ob-bubble">${s.emoji}</div>
        <h2 class="ob-title">${s.title}</h2>
        <p class="ob-text" style="margin-bottom:14px">${s.text}</p>
        <div class="ob-profile-grid">
          <label class="ob-field-label">Имя малыша
            <input class="ob-name-input" id="obBabyName" type="text" placeholder="Например, Артем" maxlength="20"
              value="${_escapeOnboardingAttribute(savedName)}"
              oninput="this.value=this.value.replace(/[^а-яёА-ЯЁa-zA-Z\\s-]/g,'')">
          </label>
          <label class="ob-field-label">Дата рождения
            <input class="ob-name-input ob-birth-input" id="obBabyBirthdate" type="date"
              max="${new Date().toISOString().slice(0, 10)}"
              value="${_escapeOnboardingAttribute(savedBirthdate)}">
          </label>
          <label class="ob-field-label">Обычный подъем
            <input class="ob-name-input" id="obWakeTime" type="time" value="${_escapeOnboardingAttribute(savedWakeTime)}">
          </label>
          <label class="ob-field-label">Кормление
            <select class="ob-name-input" id="obFeedType">
              ${_feedOptions(localStorage.getItem('babymode_feed_type') || document.getElementById('feedType')?.value || 'breast')}
            </select>
          </label>
        </div>
      </div>
    `;
    setTimeout(() => document.getElementById('obBabyName')?.focus(), 250);
  } else if (s.type === 'reminders') {
    const pref = localStorage.getItem('babymode_notif_enabled');
    const checked = pref === 'tg' || pref === 'pending' || !pref;
    slidesEl.innerHTML = `
      <div class="ob-slide ob-reminder-slide">
        <div class="ob-bubble ob-bubble-ring">${s.emoji}</div>
        <h2 class="ob-title">${s.title}</h2>
        <p class="ob-text">${s.text}</p>
        <div class="ob-reminder-list">
          <div><strong>🎂 Дни рождения</strong><span>поздравление и подсказки по возрасту</span></div>
          <div><strong>📆 Месячные этапы</strong><span>1, 3, 6, 9, 12, 18, 24 месяца</span></div>
          <div><strong>🌙 Режим дня</strong><span>ближайший сон, кормление и прогулка после генерации</span></div>
        </div>
        <label class="ob-toggle-row">
          <input type="checkbox" id="obReminderConsent" ${checked ? 'checked' : ''}>
          <span>Включить мягкие напоминания</span>
        </label>
      </div>
    `;
  } else {
    slidesEl.innerHTML = `
      <div class="ob-slide ob-welcome-slide">
        <div class="ob-hero-orbit">
          <div class="ob-hero-emoji">${s.emoji}</div>
          <span>🌙</span><span>🍼</span><span>📊</span>
        </div>
        <h2 class="ob-title ob-title-grad">${s.title}</h2>
        <p class="ob-text">${s.text}</p>
        <div class="ob-chip-row">${s.chips.map(chip => `<span>${chip}</span>`).join('')}</div>
      </div>
    `;
  }

  dotsEl.innerHTML = SLIDES.map((_, i) =>
    `<div class="ob-dot ${i === idx ? 'active' : ''}" onclick="_jumpSlide(${i})"></div>`
  ).join('');

  if (isLast) {
    btnEl.textContent = '🌸 Сохранить и начать';
    btnEl.style.background = 'linear-gradient(135deg,#FF9A7B,#C97BDB)';
  } else {
    btnEl.textContent = 'Далее →';
    btnEl.style.background = '';
  }
}

function _feedOptions(selected) {
  const options = [
    ['breast', 'Грудное'],
    ['formula', 'Смесь'],
    ['mixed', 'Смешанное'],
    ['solids', 'Прикорм + ГВ']
  ];
  return options.map(([value, label]) => `<option value="${value}" ${value === selected ? 'selected' : ''}>${label}</option>`).join('');
}

function obPickPhoto() {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = 'image/*';
  input.onchange = e => {
    const file = e.target.files[0];
    if (!file) return;
    if (!/^image\/(png|jpeg|webp|gif)$/i.test(file.type) || file.size > 5 * 1024 * 1024) {
      if (typeof showToast === 'function') showToast('Выберите PNG, JPEG, WebP или GIF до 5 МБ');
      return;
    }
    const reader = new FileReader();
    reader.onload = ev => {
      const b64 = ev.target.result;
      if (!/^data:image\/(?:png|jpeg|webp|gif);base64,[a-z0-9+/=]+$/i.test(String(b64 || ''))) return;
      localStorage.setItem('babymode_photo', b64);
      // Update photo area preview
      const area = document.getElementById('obPhotoArea');
      if (area) {
        const image = document.createElement('img');
        image.src = b64;
        image.alt = 'Фото малыша';
        image.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:50%';
        area.replaceChildren(image);
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
  if (s.type === 'profile') saveOnboardingProfile();
  if (s.type === 'reminders') saveOnboardingReminderConsent();
}

function saveOnboardingProfile() {
  const inp = document.getElementById('obBabyName');
  const birth = document.getElementById('obBabyBirthdate');
  const wake = document.getElementById('obWakeTime');
  const feed = document.getElementById('obFeedType');
  const name = _sanitizeOnboardingName(inp?.value);
  const rawBirthdate = birth && birth.value ? birth.value : '';
  const birthdate = rawBirthdate && window.BabyMilestones?.isValidBirthdate(rawBirthdate, new Date())
    ? rawBirthdate : '';
  const wakeTime = wake && wake.value ? wake.value : '';
  const feedType = feed && feed.value ? feed.value : '';
  const ageMonths = birthdate && window.BabyMilestones
    ? BabyMilestones.getBabyAgeMonths(birthdate, new Date())
    : (localStorage.getItem('babymode_last_age') || '');

  if (name) localStorage.setItem('babymode_baby_name', name);
  if (birthdate) localStorage.setItem('babymode_baby_birthdate', birthdate);
  if (wakeTime) localStorage.setItem('babymode_wake_time', wakeTime);
  if (feedType) localStorage.setItem('babymode_feed_type', feedType);
  if (ageMonths !== '' && ageMonths !== null && ageMonths !== undefined) localStorage.setItem('babymode_last_age', String(ageMonths));

  const wakeEl = document.getElementById('wakeTime');
  const feedEl = document.getElementById('feedType');
  const ageEl = document.getElementById('ageMonths');
  if (wakeEl && wakeTime) wakeEl.value = wakeTime;
  if (feedEl && feedType) feedEl.value = feedType;
  if (ageEl && ageMonths !== '' && ageMonths !== null && ageMonths !== undefined) ageEl.value = String(_nearestAgeOption(ageMonths));

  if (window.BabyAnalytics && (name || birthdate || ageMonths !== '')) {
    BabyAnalytics.saveBabyProfile({ name, birthdate, ageMonths });
    BabyAnalytics.flush();
  }
  if (name && typeof _applyBabyName === 'function') _applyBabyName(name);
  if (typeof renderBabyEventCard === 'function') renderBabyEventCard();
  if (window.BabyCloudSync) {
    BabyCloudSync.markProfileChanged();
    BabyCloudSync.markSettingsChanged();
  }
}

function _sanitizeOnboardingName(value) {
  return String(value || '').replace(/[^а-яёА-ЯЁa-zA-Z\s-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40);
}

function _escapeOnboardingAttribute(value) {
  return String(value || '').replace(/[&"<>]/g, char => ({ '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;' })[char]);
}

function saveOnboardingReminderConsent() {
  const consent = document.getElementById('obReminderConsent');
  const enabled = !consent || consent.checked;
  if (typeof setNotificationPreference === 'function') {
    setNotificationPreference(enabled ? 'tg' : 'no');
  } else {
    localStorage.setItem('babymode_notif_enabled', enabled ? 'pending' : 'no');
  }
  if (window.BabyCloudSync) BabyCloudSync.markSettingsChanged();
}

function _nearestAgeOption(ageMonths) {
  const values = [1,2,3,4,5,6,7,8,9,10,11,12,15,18,21,24,30,36];
  const age = Math.max(1, parseInt(ageMonths, 10) || 1);
  return values.reduce((best, cur) => Math.abs(cur - age) < Math.abs(best - age) ? cur : best, values[0]);
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

  // Initialize reminders after the onboarding sheet has closed.
  setTimeout(() => {
    if (typeof initNotifications === 'function') initNotifications();
  }, 400);
}
