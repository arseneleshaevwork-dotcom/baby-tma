// ─── Subscription / Freemium Logic ─────────────────────────────────────────
// Manages trial period, premium status, and feature gates

const WEB_BILLING_GUEST_KEY_STORAGE = 'babymode_web_billing_guest_v1';

const SUB = (() => {
  const KEY_PREMIUM    = 'babymode_premium';
  const KEY_PREMIUM_UNTIL = 'babymode_premium_until';
  const KEY_TRIAL_DATE = 'babymode_trial_start';
  const TRIAL_DAYS     = 7;
  const PLAN_LIMITS = Object.freeze({
    freeAiDaily: 4,
    premiumAiDaily: 40,
    freeDiaryDays: 7,
    premiumDiaryContextDays: 14,
    freeArticles: 5,
  });

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
  let _source = null;
  let _plan = null;
  let _cancelAtPeriodEnd = false;
  let _nextBillingAt = null;
  let _paymentMethodType = null;
  let _trialUsed = false;

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

  async function startTrial() {
    if (localStorage.getItem(KEY_TRIAL_DATE)) return false;
    const initData = _getTelegramInitData();
    const endpoint = window.BABY_SUBSCRIPTION_STATUS_ENDPOINT;
    const canUseServer = window.BabyAccount ? BabyAccount.canUseServer() : Boolean(initData);
    if (!canUseServer || !endpoint) {
      if (window.BabyAccount && !BabyAccount.isMiniApp()) {
        BabyAccount.requestLogin('Войдите, чтобы активировать пробный Premium и использовать его на любом устройстве.');
      } else {
        showToast('Войдите через Telegram, чтобы активировать пробный период.');
      }
      return false;
    }
    try {
      const response = window.BabyAccount
        ? await BabyAccount.request(endpoint, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: { start_trial: true }
        })
        : await fetch(endpoint, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ initData, start_trial: true })
        });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.active || data.status !== 'trial') {
        showToast(data.error === 'trial_already_used' ? 'Пробный период уже был использован.' : 'Не удалось активировать пробный период.');
        return false;
      }
      localStorage.setItem(KEY_TRIAL_DATE, Date.now().toString());
      _applyServerPremium(data);
      _isPremium = false;
      _trialActive = true;
      _trialDaysLeft = Math.max(1, Math.ceil((new Date(data.current_period_end) - Date.now()) / 86400000));
      _renderHeaderBadge();
      _showConfetti();
      if (window.BabyAnalytics) BabyAnalytics.track('trial_started');
      showToast('🎉 7 дней Premium бесплатно активированы!');
      return true;
    } catch(e) {
      showToast('Не удалось активировать пробный период.');
      return false;
    }
  }

  function _applyServerPremium(subscription) {
    const active = Boolean(subscription && subscription.active && subscription.current_period_end);
    const isTrial = active && subscription.status === 'trial';
    _trialUsed = Boolean(subscription?.trial_used || isTrial || localStorage.getItem(KEY_TRIAL_DATE));
    _isPremium = active && !isTrial;
    _premiumUntil = active ? subscription.current_period_end : null;
    _source = active ? subscription.source || null : null;
    _plan = active ? subscription.plan || null : null;
    _cancelAtPeriodEnd = active ? Boolean(subscription.cancel_at_period_end) : false;
    _nextBillingAt = active ? subscription.next_billing_at || null : null;
    _paymentMethodType = active ? subscription.payment_method_type || null : null;
    localStorage.setItem(KEY_PREMIUM, active ? '1' : '0');
    if (_premiumUntil) localStorage.setItem(KEY_PREMIUM_UNTIL, _premiumUntil);
    else localStorage.removeItem(KEY_PREMIUM_UNTIL);
    _trialActive = isTrial;
    _trialDaysLeft = isTrial ? Math.max(1, Math.ceil((new Date(subscription.current_period_end) - Date.now()) / 86400000)) : 0;
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
  function getPlanLimits() { return { ...PLAN_LIMITS }; }
  function getSource() { return _source; }
  function getPlan() { return _plan; }
  function isCancelling() { return _cancelAtPeriodEnd; }
  function getNextBillingAt() { return _nextBillingAt; }
  function getPaymentMethodType() { return _paymentMethodType; }
  function hasUsedTrial() { return _trialUsed; }

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
      aiAnalysis:      '📊 Расширенный анализ дневника — в Premium',
      scheduleProfiles:'⚙️ Профили ситуаций — в Premium',
      shareCard:       '📱 Отчёт для семьи — в Premium',
      notifications:   '🔔 Напоминания — в Premium',
    };
    const msg = msgs[feature] || '⭐ Эта функция доступна в Premium';
    if (typeof showToast === 'function') showToast(msg);
    // Navigate to premium page after short delay
    setTimeout(() => {
      if (typeof goPage === 'function') goPage('premium', null);
      if (typeof renderPremiumPage === 'function') renderPremiumPage();
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
    const endpoint = window.BABY_SUBSCRIPTION_STATUS_ENDPOINT;
    const guestKey = window.BabyAccount && !BabyAccount.isMiniApp() && !BabyAccount.isAuthenticated()
      ? _getGuestBillingKey(false)
      : '';
    const canUseServer = window.BabyAccount ? BabyAccount.canUseServer() || Boolean(guestKey) : Boolean(_getTelegramInitData());
    if (!canUseServer || !endpoint) return false;
    try {
      const response = window.BabyAccount
        ? await BabyAccount.request(endpoint, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: guestKey ? { guest_key: guestKey } : {}
        })
        : await fetch(endpoint, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ initData: _getTelegramInitData() })
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

  return {
    init, startTrial, refreshPremiumStatus, can, getStatus, getDaysLeft, getPremiumUntil,
    isPremium, isTrialActive, getPlanLimits, getSource, getPlan, isCancelling, getNextBillingAt, getPaymentMethodType, hasUsedTrial, requirePremium
  };
})();
window.SUB = SUB;

let _miniPaymentMode = _readSessionValue('babymode_payment_mode') === 'web' ? 'web' : 'stars';
let _webCheckoutOpening = false;
let _selectedPremiumPlan = '';

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
  if (typeof refreshIcons === 'function') requestAnimationFrame(refreshIcons);
}

function _renderPremiumActive() {
  const until = SUB.getPremiumUntil();
  const untilText = until ? `Доступ открыт до ${new Date(until).toLocaleDateString('ru-RU')}` : 'Все функции разблокированы';
  const isWeb = _isWebBillingMode();
  const source = SUB.getSource();
  const cancelling = SUB.isCancelling();
  const oneTime = isWeb && source === 'yookassa' && SUB.getPaymentMethodType() === 'one_time';
  const manage = isWeb && source === 'yookassa' && !oneTime ? `
    <div class="billing-manage">
      <p>${cancelling ? 'Автопродление отключено. Premium продолжит работать до указанной даты.' : 'Следующее списание произойдёт в конце оплаченного периода.'}</p>
      <button class="cta-outline-btn" onclick="${cancelling ? 'resumeWebSubscription' : 'cancelWebSubscription'}();hapticLight()">
        ${cancelling ? 'Возобновить автопродление' : 'Отключить автопродление'}
      </button>
    </div>` : '';
  const oneTimeNote = oneTime ? `
    <div class="billing-manage">
      <p>Это разовая покупка без автопродления. Premium продолжит работать до указанной даты.</p>
    </div>` : '';
  return `
    <div class="premium-active-card">
      <div class="premium-crown">👑</div>
      <div class="premium-active-title">Premium активен</div>
      <div class="premium-active-sub">${untilText}</div>
    </div>
    <div class="plan-comparison">${_featuresList(true)}</div>
    ${oneTimeNote}
    ${manage}
  `;
}

function _renderTrialActive(days) {
  const web = _isWebBillingMode();
  const rubles = web || _isMiniWebCheckoutMode();
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
    ${!web ? _renderPaymentMethodSwitch() : ''}
    ${_renderPlanCards(rubles)}
    ${_renderCheckoutActions(web)}
    <div class="plan-comparison">${_featuresList(true)}</div>
  `;
}

function _renderFreePage() {
  const trialStarted = SUB.hasUsedTrial();
  const web = _isWebBillingMode();
  const rubles = web || _isMiniWebCheckoutMode();
  return `
    <div class="sub-hero">
      <span class="sub-hero-emoji">✨</span>
      <h2>Режим Малыша Premium</h2>
      <p>Базовый режим остаётся бесплатным. Premium добавляет глубокий анализ и автоматизацию.</p>
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

    ${!web ? _renderPaymentMethodSwitch() : ''}

    ${_renderPlanCards(rubles)}

    ${_renderCheckoutActions(web)}

    <div class="plan-comparison">${_featuresList(false)}</div>
  `;
}

function _renderPlanCards(rubles) {
  const selected = _getSelectedPremiumPlan();
  return `
    <div class="plans-row" role="group" aria-label="Выберите тариф">
      <button type="button" class="plan-card ${selected === 'month' ? 'selected' : ''}" aria-pressed="${selected === 'month'}" onclick="selectPremiumPlan('month');hapticLight()">
        <span class="plan-selected-icon"><i data-lucide="check"></i></span>
        <span class="plan-price">${rubles ? '349<span> ₽</span>' : '299<span> Stars</span>'}</span>
        <span class="plan-label">на 1 месяц</span>
      </button>
      <button type="button" class="plan-card recommended ${selected === 'quarter' ? 'selected' : ''}" aria-pressed="${selected === 'quarter'}" onclick="selectPremiumPlan('quarter');hapticLight()">
        <span class="plan-badge">Выгоднее</span>
        <span class="plan-selected-icon"><i data-lucide="check"></i></span>
        <span class="plan-price">${rubles ? '899<span> ₽</span>' : '769<span> Stars</span>'}</span>
        <span class="plan-label">на 3 месяца</span>
        <span class="plan-save">Экономия 14%</span>
      </button>
    </div>`;
}

function _renderCheckoutActions(web) {
  const miniWeb = !web && _isMiniWebCheckoutMode();
  const recurring = window.BABY_YOOKASSA_RECURRING_ENABLED === true;
  const plan = _getSelectedPremiumPlan();
  const quarter = plan === 'quarter';
  const price = quarter ? 899 : 349;
  const stars = quarter ? 769 : 299;
  const period = quarter ? '3 месяца' : '1 месяц';
  const receiptEmail = _receiptEmailValue();
  const consent = web ? `
    <label class="web-receipt-field">
      <span>Email для электронного чека</span>
      <input id="webReceiptEmail" type="email" inputmode="email" autocomplete="email" maxlength="254"
        placeholder="name@example.ru" value="${_escapeAttribute(receiptEmail)}" oninput="handleReceiptEmailInput(this.value)">
      <small>Передадим ЮKassa только для отправки чека.</small>
    </label>
    <label class="web-billing-consent">
      <input id="webBillingConsent" type="checkbox" onchange="handleBillingConsentChange()" ${_webBillingConsentChecked() ? 'checked' : ''}>
      <span>Соглашаюсь с <a href="terms.html" target="_blank" rel="noopener" onclick="event.stopPropagation()">условиями подписки</a> и ${recurring
        ? `автоматическим списанием ${price} ₽ ${quarter ? 'каждые 3 месяца' : 'ежемесячно'} до отмены`
        : `разовой оплатой ${price} ₽ за ${period} без автопродления`}.</span>
    </label>` : '';
  const disabled = web && (!_webBillingConsentChecked() || !_isValidReceiptEmail(receiptEmail)) ? 'disabled' : '';
  return `
    <div id="premiumCheckout" class="premium-checkout">
      ${consent}
      <div class="checkout-plan-summary">
        <span>Выбран тариф</span>
        <strong>${period} · ${web || miniWeb ? `${price} ₽` : `${stars} Stars`}</strong>
      </div>
      <div style="padding:0 0 8px">
        <button id="premiumCheckoutButton" class="cta-sub-btn" ${disabled} onclick="handleSubscribe('${plan}');hapticMedium()">
          ${web ? `Перейти к оплате · ${price} ₽` : miniWeb ? `Открыть веб-оплату · ${price} ₽` : `Оплатить ${stars} Stars`}
        </button>
      </div>
      <p style="text-align:center;font-size:.72rem;color:var(--text-hint);margin-top:8px;font-weight:500;">
        ${web
          ? recurring
            ? 'Вход в Telegram не нужен · автопродлением можно управлять в Premium'
            : 'Разовая оплата · Premium сохранится в этом браузере · продление вручную'
          : miniWeb
            ? 'Откроется веб-версия приложения · повторно входить в Telegram не нужно'
            : quarter
              ? 'Оплата один раз за 3 месяца · продление оформляется вручную'
              : 'Подписка продлевается автоматически · управлять ей можно в Telegram'}
      </p>
      <div class="billing-provider-note"><i data-lucide="shield-check"></i><span>${web || miniWeb ? 'Безопасная оплата через ЮKassa' : 'Оплата внутри Telegram Stars'}</span></div>
    </div>
  `;
}

function _getSelectedPremiumPlan() {
  if (['month', 'quarter'].includes(_selectedPremiumPlan)) return _selectedPremiumPlan;
  const checkoutPlan = window.BabyAccount?.getCheckoutPlan?.();
  if (['month', 'quarter'].includes(checkoutPlan)) return checkoutPlan;
  const storedPlan = _readSessionValue('babymode_selected_plan');
  return ['month', 'quarter'].includes(storedPlan) ? storedPlan : 'quarter';
}

function selectPremiumPlan(plan, shouldScroll = true) {
  if (!['month', 'quarter'].includes(plan)) return;
  rememberWebBillingConsent();
  rememberReceiptEmail();
  _selectedPremiumPlan = plan;
  _writeSessionValue('babymode_selected_plan', plan);
  renderPremiumPage();
  if (window.BabyAnalytics) BabyAnalytics.track('subscription_plan_selected', { plan });
  if (!shouldScroll) return;
  const schedule = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : setTimeout;
  schedule(() => {
    const checkout = document.getElementById('premiumCheckout');
    if (!checkout || typeof checkout.getBoundingClientRect !== 'function') return;
    const rect = checkout.getBoundingClientRect();
    if (rect.bottom > window.innerHeight - 12 || rect.top < 12) {
      const behavior = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
      checkout.scrollIntoView({ behavior, block: 'nearest' });
    }
  });
}

function handleBillingConsentChange() {
  rememberWebBillingConsent();
  const button = document.getElementById('premiumCheckoutButton');
  if (button) button.disabled = !_webBillingConsentChecked() || !_isValidReceiptEmail(_receiptEmailValue());
}

function handleReceiptEmailInput(value) {
  _writeSessionValue('babymode_receipt_email', String(value || '').trim());
  const button = document.getElementById('premiumCheckoutButton');
  if (button) button.disabled = !_webBillingConsentChecked() || !_isValidReceiptEmail(value);
}

function rememberReceiptEmail() {
  const input = document.getElementById('webReceiptEmail');
  if (input) _writeSessionValue('babymode_receipt_email', String(input.value || '').trim());
}

function _receiptEmailValue() {
  const input = document.getElementById('webReceiptEmail');
  return String(input?.value || _readSessionValue('babymode_receipt_email') || '').trim();
}

function _isValidReceiptEmail(value) {
  const email = String(value || '').trim();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

function _escapeAttribute(value) {
  return String(value || '').replace(/[&"<>]/g, char => ({ '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;' })[char]);
}

function _renderPaymentMethodSwitch() {
  const webSelected = _isMiniWebCheckoutMode();
  return `
    <div class="payment-method-block">
      <div class="payment-method-label">Как удобнее оплатить</div>
      <div class="payment-method-switch" role="group" aria-label="Способ оплаты">
        <button type="button" class="${webSelected ? '' : 'active'}" aria-pressed="${webSelected ? 'false' : 'true'}" onclick="setPremiumPaymentMode('stars');hapticLight()">
          <i data-lucide="star"></i><span>Stars</span>
        </button>
        <button type="button" class="${webSelected ? 'active' : ''}" aria-pressed="${webSelected ? 'true' : 'false'}" onclick="setPremiumPaymentMode('web');hapticLight()">
          <i data-lucide="credit-card"></i><span>Карта / СБП</span>
        </button>
      </div>
    </div>`;
}

function setPremiumPaymentMode(mode) {
  _miniPaymentMode = mode === 'web' ? 'web' : 'stars';
  _writeSessionValue('babymode_payment_mode', _miniPaymentMode);
  renderPremiumPage();
  if (window.BabyAnalytics) BabyAnalytics.track('payment_method_selected', { provider: _miniPaymentMode === 'web' ? 'yookassa' : 'telegram_stars' });
}

function _isMiniWebCheckoutMode() {
  return !_isWebBillingMode() && _miniPaymentMode === 'web';
}

function _isWebBillingMode() {
  return Boolean(window.BabyAccount && !window.BabyAccount.isMiniApp());
}

function _webBillingConsentChecked() {
  const checkbox = document.getElementById('webBillingConsent');
  return checkbox ? checkbox.checked : _readSessionValue('babymode_billing_consent') === '1';
}

function rememberWebBillingConsent() {
  const checkbox = document.getElementById('webBillingConsent');
  _writeSessionValue('babymode_billing_consent', checkbox?.checked ? '1' : '0');
}

function _readSessionValue(key) {
  try { return window.sessionStorage?.getItem(key) || ''; }
  catch (_) { return ''; }
}

function _writeSessionValue(key, value) {
  try { window.sessionStorage?.setItem(key, value); }
  catch (_) {}
}

function _getGuestBillingKey(createIfMissing) {
  try {
    const saved = localStorage.getItem(WEB_BILLING_GUEST_KEY_STORAGE) || '';
    if (/^[A-Za-z0-9_-]{43}$/.test(saved)) return saved;
    if (!createIfMissing || !window.crypto?.getRandomValues) return '';
    const bytes = new Uint8Array(32);
    window.crypto.getRandomValues(bytes);
    const binary = Array.from(bytes, byte => String.fromCharCode(byte)).join('');
    const key = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
    if (!/^[A-Za-z0-9_-]{43}$/.test(key)) return '';
    localStorage.setItem(WEB_BILLING_GUEST_KEY_STORAGE, key);
    return key;
  } catch (_) {
    return '';
  }
}

function _featuresList(unlocked) {
  const limits = SUB.getPlanLimits();
  const freeFeatures = [
    { icon:'📅', title:'Режим дня', sub:'Генератор и ориентиры сна 0–3 года' },
    { icon:'💬', title:`${limits.freeAiDaily} ИИ-ответа в день`, sub:'Общие вопросы по сну, кормлению и уходу' },
    { icon:'📓', title:`Дневник за ${limits.freeDiaryDays} дней`, sub:'Запись сна, пробуждений и событий' },
    { icon:'📚', title:`${limits.freeArticles} статей`, sub:'Базовые главы базы знаний' },
    { icon:'🌙', title:'Ритуал засыпания', sub:'Таймер и спокойные звуки' },
  ];
  const premiumFeatures = [
    { icon:'✨', title:'ИИ разбирает ваш дневник', sub:`${limits.premiumAiDaily} ИИ-ответов в день и анализ дневника за ${limits.premiumDiaryContextDays} дней` },
    { icon:'📊', title:'Понимать причины плохих ночей', sub:'Тренды, недосып, недельный итог и следующий шаг' },
    { icon:'📅', title:'План восстановления и переходов', sub:'Режим на завтра и подсказки при смене дневных снов' },
    { icon:'📚', title:'Учиться по возрасту малыша', sub:'Все главы по сну, развитию и кормлению' },
    { icon:'📄', title:'Отчёты для семьи и специалиста', sub:'PDF за 7, 14 или 30 дней и краткий план на завтра' },
    { icon:'🔔', title:'Не держать режим в голове', sub:'Умные напоминания в Telegram по событиям малыша' },
  ];
  const renderRows = (items, marker) => `<div class="features-list">${items.map(item => `
    <div class="feat-row">
      <div class="fi">${item.icon}</div>
      <div class="ft">${item.title}<span>${item.sub}</span></div>
      <div class="flock">${marker}</div>
    </div>`).join('')}</div>`;

  if (unlocked) {
    return `<section class="plan-feature-group premium-plan-features">
      <div class="plan-feature-heading"><strong>Premium</strong><span>Всё бесплатное и расширенные возможности</span></div>
      ${renderRows([...freeFeatures, ...premiumFeatures], '✓')}
    </section>`;
  }
  return `
    <section class="plan-feature-group free-plan-features">
      <div class="plan-feature-heading"><strong>Бесплатно</strong><span>Без ограничения по времени</span></div>
      ${renderRows(freeFeatures, '✓')}
    </section>
    <section class="plan-feature-group premium-plan-features">
      <div class="plan-feature-heading"><strong>Premium</strong><span>Для глубокого анализа и автоматизации</span></div>
      ${renderRows(premiumFeatures, '★')}
    </section>`;
}

function _declDays(n) {
  if (n === 1) return 'день';
  if (n >= 2 && n <= 4) return 'дня';
  return 'дней';
}

// ─── Handlers ───────────────────────────────────────────────────────────────
async function handleStartTrial() {
  await SUB.startTrial();
  renderPremiumPage();
}

async function handleSubscribe(plan) {
  if (window.BabyAnalytics) BabyAnalytics.track('subscribe_clicked', { plan });

  if (_isWebBillingMode()) {
    rememberWebBillingConsent();
    rememberReceiptEmail();
    if (!_webBillingConsentChecked()) {
      showToast('Подтвердите условия оплаты.');
      return;
    }
    const receiptEmail = _receiptEmailValue();
    if (!_isValidReceiptEmail(receiptEmail)) {
      showToast('Укажите корректный email для электронного чека.');
      return;
    }
    const guestKey = window.BabyAccount?.isAuthenticated() ? '' : _getGuestBillingKey(true);
    if (!window.BabyAccount?.isAuthenticated() && !guestKey) {
      showToast('Не удалось подготовить защищённую оплату. Обновите страницу и попробуйте ещё раз.');
      return;
    }
    const endpoint = window.BABY_CREATE_YOOKASSA_PAYMENT_ENDPOINT;
    if (!endpoint) { showToast('Веб-оплата пока не настроена.'); return; }
    if (_webCheckoutOpening) return;
    _webCheckoutOpening = true;
    _setCheckoutButtonsLoading(true);
    try {
      showToast('Открываем безопасную оплату...');
      const response = await BabyAccount.request(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: {
          plan,
          terms_accepted: true,
          recurring_accepted: window.BABY_YOOKASSA_RECURRING_ENABLED === true,
          receipt_email: receiptEmail,
          ...(guestKey ? { guest_key: guestKey } : {})
        }
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !/^https:\/\//.test(String(data.confirmation_url || ''))) {
        const message = data.error === 'payments_not_configured'
          ? 'Оплата скоро будет доступна.'
          : data.error === 'payment_already_in_progress'
            ? 'Сначала завершите уже открытую оплату или попробуйте через 30 минут.'
            : 'Не удалось открыть оплату. Попробуйте ещё раз.';
        showToast(message);
        return;
      }
      if (window.BabyAnalytics) BabyAnalytics.track('checkout_opened', { plan, provider: 'yookassa' });
      window.location.assign(data.confirmation_url);
    } catch (_) {
      showToast('Оплата временно недоступна. Попробуйте позже.');
    } finally {
      _webCheckoutOpening = false;
      _setCheckoutButtonsLoading(false);
    }
    return;
  }

  if (_isMiniWebCheckoutMode()) {
    await openWebCheckoutFromMiniApp(plan);
    return;
  }

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

async function openWebCheckoutFromMiniApp(plan) {
  if (_webCheckoutOpening) return;
  const endpoint = window.BABY_WEB_AUTH_ENDPOINT;
  const initData = _getTelegramInitData();
  if (!endpoint || !initData) {
    showToast('Не удалось подготовить веб-оплату. Откройте приложение заново.');
    return;
  }
  _webCheckoutOpening = true;
  _setCheckoutButtonsLoading(true);
  try {
    showToast('Открываем веб-версию для оплаты...');
    const response = window.BabyAccount
      ? await window.BabyAccount.request(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: { action: 'handoff_create', plan }
      })
      : await fetch(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'handoff_create', plan, initData })
      });
    const data = await response.json().catch(() => ({}));
    const target = new URL(String(data.web_url || ''));
    const expected = new URL(window.BABY_WEB_APP_URL || location.origin + location.pathname);
    if (!response.ok || target.protocol !== 'https:' || target.origin !== expected.origin || !target.pathname.startsWith(expected.pathname)) {
      throw new Error(data.error || 'handoff_failed');
    }
    if (window.BabyAnalytics) BabyAnalytics.track('checkout_handoff_opened', { plan, provider: 'yookassa' });
    const tg = window.Telegram?.WebApp;
    if (tg && typeof tg.openLink === 'function') tg.openLink(target.toString());
    else window.open(target.toString(), '_blank', 'noopener');
  } catch (_) {
    showToast('Не удалось открыть веб-оплату. Попробуйте ещё раз.');
  } finally {
    _webCheckoutOpening = false;
    _setCheckoutButtonsLoading(false);
  }
}

function _setCheckoutButtonsLoading(loading) {
  if (typeof document.querySelectorAll !== 'function') return;
  document.querySelectorAll('#page-premium .cta-sub-btn, #page-premium .cta-outline-btn').forEach(button => {
    button.disabled = Boolean(loading);
    button.setAttribute('aria-busy', loading ? 'true' : 'false');
  });
}

function resumePendingWebCheckout() {
  const plan = _readSessionValue('babymode_pending_web_checkout');
  if (!['month', 'quarter'].includes(plan) || !_isWebBillingMode() || !window.BabyAccount?.isAuthenticated()) return false;
  _writeSessionValue('babymode_pending_web_checkout', '');
  handleSubscribe(plan);
  return true;
}

async function cancelWebSubscription() {
  await _manageWebSubscription('cancel');
}

async function resumeWebSubscription() {
  await _manageWebSubscription('resume');
}

async function _manageWebSubscription(action) {
  if (!_isWebBillingMode()) return;
  const guestKey = BabyAccount.isAuthenticated() ? '' : _getGuestBillingKey(false);
  if (!BabyAccount.isAuthenticated() && !guestKey) {
    showToast('Войдите через Telegram или откройте сайт на устройстве, где оформляли подписку.');
    return;
  }
  try {
    const response = await BabyAccount.request(window.BABY_BILLING_SUBSCRIPTION_ENDPOINT, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: { action, ...(guestKey ? { guest_key: guestKey } : {}) }
    });
    if (!response.ok) throw new Error('billing_manage_failed');
    await SUB.refreshPremiumStatus();
    renderPremiumPage();
    showToast(action === 'cancel' ? 'Автопродление отключено' : 'Автопродление включено');
    if (window.BabyAnalytics) BabyAnalytics.track(action === 'cancel' ? 'subscription_cancelled' : 'subscription_resumed', { provider: 'yookassa' });
  } catch (_) {
    showToast('Не удалось изменить подписку. Напишите в поддержку.');
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
