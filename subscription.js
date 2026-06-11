// ─── Subscription / Freemium Logic ─────────────────────────────────────────
// Manages trial period, premium status, and feature gates

const SUB = (() => {
  const KEY_PREMIUM    = 'babymode_premium';
  const KEY_TRIAL_DATE = 'babymode_trial_start';
  const TRIAL_DAYS     = 7;

  // Feature gates — what's free vs premium
  const GATES = {
    scheduleProfiles: false,  // Болезнь, путешествие, жара — premium
    diaryUnlimited:  false,   // >7 дней записей — premium
    articlesAll:     false,   // >5 статей — premium
    aiAnalysis:      false,   // AI анализ — premium
    ritual:          true,    // Ритуал засыпания — free
    shareCard:       false,   // Красивая карточка — premium
    notifications:   false,   // Кастомные напоминания — premium
  };

  let _isPremium = false;
  let _trialActive = false;
  let _trialDaysLeft = 0;

  function init() {
    _isPremium = localStorage.getItem(KEY_PREMIUM) === '1';

    const trialStart = localStorage.getItem(KEY_TRIAL_DATE);
    if (trialStart) {
      const elapsed = (Date.now() - parseInt(trialStart)) / (1000 * 60 * 60 * 24);
      _trialDaysLeft = Math.max(0, Math.ceil(TRIAL_DAYS - elapsed));
      _trialActive = _trialDaysLeft > 0;
    }

    _renderHeaderBadge();
  }

  function startTrial() {
    if (localStorage.getItem(KEY_TRIAL_DATE)) return; // already started
    localStorage.setItem(KEY_TRIAL_DATE, Date.now().toString());
    _trialActive = true;
    _trialDaysLeft = TRIAL_DAYS;
    _renderHeaderBadge();
    _showConfetti();
    showToast('🎉 7 дней Premium бесплатно активированы!');
  }

  function activatePremium() {
    _isPremium = true;
    localStorage.setItem(KEY_PREMIUM, '1');
    _trialActive = false;
    _renderHeaderBadge();
    _showConfetti();
  }

  // Check if user has access to a feature
  function can(feature) {
    if (_isPremium) return true;
    if (_trialActive) return true;
    return GATES[feature] === true; // explicitly free
  }

  // Returns 'premium' | 'trial' | 'free'
  function getStatus() {
    if (_isPremium) return 'premium';
    if (_trialActive) return 'trial';
    return 'free';
  }

  function getDaysLeft() { return _trialDaysLeft; }
  function isPremium()   { return _isPremium; }
  function isTrialActive() { return _trialActive; }

  // Show paywall if feature is locked
  function requirePremium(featureName, callback) {
    if (can(featureName)) {
      callback();
      return true;
    }
    _showPaywallToast(featureName);
    return false;
  }

  function _showPaywallToast(feature) {
    const msgs = {
      diaryUnlimited:  '📓 Неограниченный дневник — в Premium',
      articlesAll:     '📚 Все статьи доступны в Premium',
      aiAnalysis:      '🤖 AI анализ — в Premium',
      scheduleProfiles:'⚙️ Профили ситуаций — в Premium',
      shareCard:       '📱 Красивая карточка — в Premium',
      notifications:   '🔔 Напоминания — в Premium',
    };
    const msg = msgs[feature] || '⭐ Эта функция доступна в Premium';
    if (typeof showToast === 'function') showToast(msg);
    // Navigate to premium page after short delay
    setTimeout(() => {
      const btn = document.getElementById('bn-premium');
      if (btn) btn.click();
    }, 1500);
  }

  function _renderHeaderBadge() {
    let badge = document.getElementById('trial-header-badge');
    if (!badge) return;

    const status = getStatus();
    if (status === 'premium') {
      badge.textContent = '⭐ Premium';
      badge.style.display = 'inline-flex';
      badge.style.background = 'linear-gradient(135deg,#C97BDB,#FF9A7B)';
    } else if (status === 'trial') {
      badge.textContent = `🌸 ${_trialDaysLeft} дн. Premium`;
      badge.style.display = 'inline-flex';
    } else {
      badge.style.display = 'none';
    }
  }

  function _showConfetti() {
    const colors = ['#FF9A7B','#C97BDB','#FFB347','#5DC9A0','#F48FB1','#7C83E8'];
    for (let i = 0; i < 30; i++) {
      setTimeout(() => {
        const el = document.createElement('div');
        el.className = 'confetti-piece';
        el.style.cssText = `
          left:${Math.random() * 100}vw;
          top:0;
          background:${colors[Math.floor(Math.random() * colors.length)]};
          width:${6 + Math.random() * 6}px;
          height:${6 + Math.random() * 6}px;
          border-radius:${Math.random() > 0.5 ? '50%' : '2px'};
          animation-duration:${0.8 + Math.random() * 0.8}s;
          animation-delay:${Math.random() * 0.3}s;
        `;
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 1500);
      }, i * 30);
    }
  }

  return { init, startTrial, activatePremium, can, getStatus, getDaysLeft, isPremium, isTrialActive, requirePremium };
})();

// ─── Premium Page Renderer ───────────────────────────────────────────────────
function initPremium() {
  renderPremiumPage();
}

function renderPremiumPage() {
  const page = document.getElementById('page-premium');
  if (!page) return;

  const status = SUB.getStatus();
  const daysLeft = SUB.getDaysLeft();

  if (status === 'premium') {
    page.innerHTML = _renderPremiumActive();
  } else if (status === 'trial') {
    page.innerHTML = _renderTrialActive(daysLeft);
  } else {
    page.innerHTML = _renderFreePage();
  }
}

function _renderPremiumActive() {
  return `
    <div class="premium-active-card">
      <div class="premium-crown">👑</div>
      <div class="premium-active-title">Premium активен</div>
      <div class="premium-active-sub">Все функции разблокированы ♡</div>
    </div>
    <div class="card">
      <div class="section-title">Ваши преимущества</div>
      ${_featuresList(true)}
    </div>
  `;
}

function _renderTrialActive(days) {
  return `
    <div class="sub-hero">
      <span class="sub-hero-emoji">🌸</span>
      <h2>Premium активен</h2>
      <p>Наслаждайтесь всеми функциями бесплатно</p>
    </div>
    <div class="trial-status">
      <div class="ts-icon">⏳</div>
      <div class="ts-text">
        <div class="ts-days">${days} ${_declDays(days)} осталось</div>
        <div class="ts-label">Бесплатного пробного периода</div>
      </div>
    </div>
    <div class="card">
      <div class="section-title">Что включено в Premium</div>
      ${_featuresList(true)}
    </div>
    <div style="padding:0 0 8px">
      <button class="cta-sub-btn" onclick="handleSubscribe('month');hapticMedium()">
        💳 Подписка 299 руб/мес
      </button>
      <button class="cta-outline-btn" onclick="handleSubscribe('year');hapticLight()">
        💫 1490 руб/год — экономия 50%
      </button>
    </div>
    <p style="text-align:center;font-size:.72rem;color:var(--text-hint);margin-top:8px;font-weight:500;">
      Отмените в любой момент
    </p>
  `;
}

function _renderFreePage() {
  const trialStarted = !!localStorage.getItem('babymode_trial_start');
  return `
    <div class="sub-hero">
      <span class="sub-hero-emoji">✨</span>
      <h2>Режим Малыша Premium</h2>
      <p>Откройте все возможности для вас и вашего малыша</p>
    </div>

    ${!trialStarted ? `
    <div class="card card-pink" style="text-align:center;padding:20px;">
      <div style="font-size:2rem;margin-bottom:8px;">🎁</div>
      <div style="font-size:1rem;font-weight:900;color:var(--text-dark);margin-bottom:4px;">7 дней Premium бесплатно</div>
      <div style="font-size:.82rem;color:var(--text-hint);font-weight:500;margin-bottom:14px;">Без привязки карты. Попробуйте прямо сейчас!</div>
      <button class="cta-trial-btn" onclick="handleStartTrial();hapticSuccess()">
        🌸 Начать бесплатный период
      </button>
    </div>
    ` : ''}

    <div class="plans-row">
      <div class="plan-card" onclick="handleSubscribe('month');hapticLight()">
        <div class="plan-price">299<span> руб</span></div>
        <div class="plan-label">в месяц</div>
      </div>
      <div class="plan-card recommended" onclick="handleSubscribe('year');hapticLight()">
        <div class="plan-badge">Выгоднее</div>
        <div class="plan-price">1490<span> руб</span></div>
        <div class="plan-label">в год</div>
        <div class="plan-save">Экономия 50%</div>
      </div>
    </div>

    <div class="card">
      <div class="section-title">Что вы получаете</div>
      ${_featuresList(false)}
    </div>

    <div style="padding:0 0 8px">
      <button class="cta-sub-btn" onclick="handleSubscribe('year');hapticMedium()">
        💫 Подписаться за 1490 руб/год
      </button>
      <button class="cta-outline-btn" style="margin-top:8px" onclick="handleSubscribe('month');hapticLight()">
        или 299 руб/месяц
      </button>
    </div>
    <p style="text-align:center;font-size:.72rem;color:var(--text-hint);margin-top:8px;font-weight:500;">
      Отмените в любой момент · Безопасная оплата
    </p>
  `;
}

function _featuresList(unlocked) {
  const features = [
    { icon:'🌙', title:'Нормы сна 0–3 года', sub:'Научная база ВОЗ/AAP', premium:false },
    { icon:'📅', title:'Генератор режима дня', sub:'Базовый для всех', premium:false },
    { icon:'📓', title:'Дневник сна', sub:unlocked ? 'Неограниченно' : 'Только 7 дней', premium:true },
    { icon:'💬', title:'Консультант FAQ', sub:'40+ вопросов и ответов', premium:false },
    { icon:'📚', title:'База знаний', sub:unlocked ? 'Все 18+ статей' : '5 статей бесплатно', premium:true },
    { icon:'⚙️', title:'Профили ситуаций', sub:'Болезнь, путешествие, жара', premium:true },
    { icon:'🤖', title:'AI анализ дневника', sub:'Паттерны и рекомендации', premium:true },
    { icon:'🌙', title:'Ритуал засыпания', sub:'Таймер + белый шум', premium:false },
    { icon:'📱', title:'Красивая карточка', sub:'Поделиться с папой и бабушкой', premium:true },
    { icon:'🔔', title:'Умные напоминания', sub:'Кастомные push-уведомления', premium:true },
  ];

  return `<div class="features-list">${features.map(f => {
    const isPremiumLocked = f.premium && !unlocked;
    return `
      <div class="feat-row ${isPremiumLocked ? '' : ''}">
        <div class="fi">${f.icon}</div>
        <div class="ft">${f.title}<span>${f.sub}</span></div>
        <div class="flock">${isPremiumLocked ? '🔒' : '✅'}</div>
      </div>
    `;
  }).join('')}</div>`;
}

function _declDays(n) {
  if (n === 1) return 'день';
  if (n >= 2 && n <= 4) return 'дня';
  return 'дней';
}

// ─── Handlers ───────────────────────────────────────────────────────────────
function handleStartTrial() {
  SUB.startTrial();
  setTimeout(() => renderPremiumPage(), 300);
}

function handleSubscribe(plan) {
  // Placeholder for actual payment integration (Telegram Stars / ЮКасса)
  showToast('🚀 Оплата скоро будет доступна!');
  // For demo: activate premium after 1.5s
  setTimeout(() => {
    SUB.activatePremium();
    renderPremiumPage();
  }, 1500);
}

// Legacy compat
function buyPremium() { handleSubscribe('month'); }
