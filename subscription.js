// ─── Subscription / Freemium Logic ─────────────────────────────────────────
// Manages trial period, premium status, and feature gates

const SUB = (() => {
  const KEY_PREMIUM    = 'babymode_premium';
  const KEY_PREMIUM_UNTIL = 'babymode_premium_until';
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
  let _premiumUntil = null;

  function init() {
    _loadCachedPremium();

    const trialStart = localStorage.getItem(KEY_TRIAL_DATE);
    if (trialStart) {
      const elapsed = (Date.now() - parseInt(trialStart)) / (1000 * 60 * 60 * 24);
      _trialDaysLeft = Math.max(0, Math.ceil(TRIAL_DAYS - elapsed));
      _trialActive = _trialDaysLeft > 0;
    }

    _renderHeaderBadge();
    refreshPremiumStatus();
  }

  function startTrial() {
    if (localStorage.getItem(KEY_TRIAL_DATE)) return; // already started
    localStorage.setItem(KEY_TRIAL_DATE, Date.now().toString());
    _trialActive = true;
    _trialDaysLeft = TRIAL_DAYS;
    _renderHeaderBadge();
    _showConfetti();
    if (window.BabyAnalytics) BabyAnalytics.track('trial_started');
    showToast('🎉 7 дней Premium бесплатно активированы!');
  }

  function _applyServerPremium(subscription) {
    const active = Boolean(subscription && subscription.active && subscription.current_period_end);
    _isPremium = active;
    _premiumUntil = active ? subscription.current_period_end : null;
    localStorage.setItem(KEY_PREMIUM, active ? '1' : '0');
    if (_premiumUntil) localStorage.setItem(KEY_PREMIUM_UNTIL, _premiumUntil);
    else localStorage.removeItem(KEY_PREMIUM_UNTIL);
    _trialActive = false;
    _renderHeaderBadge();
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
  function getPremiumUntil() { return _premiumUntil; }
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
      shareCard:       '📱 Отчёт для семьи — в Premium',
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

  function _loadCachedPremium() {
    const until = localStorage.getItem(KEY_PREMIUM_UNTIL);
    const active = until && new Date(until).getTime() > Date.now();
    _isPremium = Boolean(active);
    _premiumUntil = active ? until : null;
    if (!active) localStorage.setItem(KEY_PREMIUM, '0');
  }

  async function refreshPremiumStatus() {
    const initData = _getTelegramInitData();
    const endpoint = window.BABY_SUBSCRIPTION_STATUS_ENDPOINT;
    if (!initData || !endpoint) return false;
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData })
      });
      if (!response.ok) return false;
      const data = await response.json();
      _applyServerPremium(data);
      if (typeof renderPremiumPage === 'function') renderPremiumPage();
      return Boolean(data.active);
    } catch(e) {
      return false;
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

  return { init, startTrial, refreshPremiumStatus, can, getStatus, getDaysLeft, getPremiumUntil, isPremium, isTrialActive, requirePremium };
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
  const until = SUB.getPremiumUntil();
  const untilText = until ? `Доступ открыт до ${new Date(until).toLocaleDateString('ru-RU')}` : 'Все функции разблокированы';
  return `
    <div class="premium-active-card">
      <div class="premium-crown">👑</div>
      <div class="premium-active-title">Premium активен</div>
      <div class="premium-active-sub">${untilText}</div>
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
        ⭐ Premium за 299 ⭐ / 30 дней
      </button>
      <button class="cta-outline-btn" onclick="handleSubscribe('year');hapticLight()">
        💫 1490 ⭐ / год — экономия 50%
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
        <div class="plan-price">299<span> ⭐</span></div>
        <div class="plan-label">на 30 дней</div>
      </div>
      <div class="plan-card recommended" onclick="handleSubscribe('year');hapticLight()">
        <div class="plan-badge">Выгоднее</div>
        <div class="plan-price">1490<span> ⭐</span></div>
        <div class="plan-label">на 1 год</div>
        <div class="plan-save">Экономия 50%</div>
      </div>
    </div>

    <div class="card">
      <div class="section-title">Что вы получаете</div>
      ${_featuresList(false)}
    </div>

    <div style="padding:0 0 8px">
      <button class="cta-sub-btn" onclick="handleSubscribe('year');hapticMedium()">
        💫 Подписаться за 1490 ⭐/год
      </button>
      <button class="cta-outline-btn" style="margin-top:8px" onclick="handleSubscribe('month');hapticLight()">
        или 299 ⭐ на 30 дней
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
    { icon:'📚', title:'База знаний', sub:unlocked ? 'Все главы и статьи' : '5 статей бесплатно', premium:true },
    { icon:'⚙️', title:'Профили ситуаций', sub:'Болезнь, путешествие, жара', premium:true },
    { icon:'🤖', title:'AI анализ дневника', sub:'Недосып, паттерны, регрессы', premium:true },
    { icon:'📆', title:'Календарь сна', sub:'Скачки, регрессы и переходы', premium:true },
    { icon:'🌙', title:'Ритуал засыпания', sub:'Таймер + белый шум', premium:false },
    { icon:'📱', title:'Отчёт для семьи', sub:'Сон, недосып и план на завтра', premium:true },
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

async function handleSubscribe(plan) {
  if (window.BabyAnalytics) BabyAnalytics.track('subscribe_clicked', { plan });

  const initData = _getTelegramInitData();
  const endpoint = window.BABY_CREATE_STARS_INVOICE_ENDPOINT;
  if (!initData || !endpoint) {
    showToast('Оформление Premium доступно внутри Telegram.');
    return;
  }

  try {
    showToast('Готовлю оплату через Telegram Stars...');
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan, initData })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.invoice_link) {
      showToast('Не удалось создать оплату. Попробуйте еще раз.');
      return;
    }

    const tg = window.Telegram && window.Telegram.WebApp;
    if (tg && typeof tg.openInvoice === 'function') {
      tg.openInvoice(data.invoice_link, async function(status) {
        if (status === 'paid') {
          await SUB.refreshPremiumStatus();
          renderPremiumPage();
          showToast('Premium активирован!');
          if (window.BabyAnalytics) BabyAnalytics.track('premium_paid', { plan });
        }
      });
    } else {
      window.open(data.invoice_link, '_blank', 'noopener');
    }
  } catch(e) {
    showToast('Оплата временно недоступна. Попробуйте позже.');
  }
}

// Legacy compat
function buyPremium() { handleSubscribe('month'); }

function _getTelegramInitData() {
  try {
    return window.Telegram && window.Telegram.WebApp
      ? window.Telegram.WebApp.initData || ''
      : '';
  } catch(e) {
    return '';
  }
}
