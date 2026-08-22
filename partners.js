(function(global) {
  'use strict';

  let portal = null;
  let loading = false;

  function normalizeCode(value) {
    const code = String(value || '').trim().toLowerCase().replace(/^partner[-_:]/, '');
    return /^[a-z0-9][a-z0-9_-]{2,31}$/.test(code) ? code : '';
  }

  function statusCopy(status) {
    return {
      pending: ['Заявка на проверке', 'Мы проверим площадку и включим ссылки вручную. Статус обновится здесь после решения.'],
      active: ['Партнёрство активно', 'Ссылки готовы — приглашённые закрепляются автоматически после первого перехода.'],
      paused: ['Партнёрство приостановлено', 'Новые закрепления временно не учитываются. Напишите в поддержку, чтобы уточнить причину.'],
      rejected: ['Заявка не одобрена', 'Проверьте название, контакт и код. Вы можете исправить данные и отправить заявку повторно.']
    }[status] || ['Партнёрская программа', 'Статус заявки пока неизвестен.'];
  }

  function open() {
    if (typeof global.goPage === 'function') global.goPage('partner', null);
    load();
  }

  async function load() {
    if (loading) return;
    if (!global.BabyAccount?.canUseServer()) {
      portal = null;
      renderGuest();
      return;
    }
    loading = true;
    renderLoading();
    try {
      const response = await global.BabyAccount.request(global.BABY_PARTNER_PORTAL_ENDPOINT, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: { action: 'status' }
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'partner_status_failed');
      portal = data.portal || null;
      render();
    } catch (_) {
      renderError('Не удалось загрузить кабинет. Проверьте интернет и попробуйте ещё раз.');
    } finally {
      loading = false;
    }
  }

  async function apply(event) {
    event.preventDefault();
    if (!global.BabyAccount?.canUseServer()) {
      global.BabyAccount?.requestLogin('Войдите через Telegram, чтобы отправить заявку и потом видеть свою статистику.');
      return;
    }
    const form = event.currentTarget;
    const name = form.elements.partnerName.value.trim();
    const code = normalizeCode(form.elements.partnerCode.value);
    const contact = form.elements.partnerContact.value.trim();
    const accepted = form.elements.partnerTerms.checked;
    setFieldError('partnerNameError', name.length >= 2 ? '' : 'Укажите имя или название площадки.');
    setFieldError('partnerCodeError', code ? '' : 'От 3 до 32 символов: латинские буквы, цифры, _ или -.');
    setFieldError('partnerTermsError', accepted ? '' : 'Подтвердите, что ознакомились с правилами.');
    if (name.length < 2 || !code || !accepted) return;
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    button.textContent = 'Отправляем…';
    try {
      const response = await global.BabyAccount.request(global.BABY_PARTNER_PORTAL_ENDPOINT, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: { action: 'apply', name, code, contact, terms_accepted: true }
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'partner_application_failed');
      portal = data.portal;
      if (global.BabyAnalytics) global.BabyAnalytics.track('partner_application_sent');
      render();
      if (typeof global.showToast === 'function') global.showToast('Заявка отправлена');
    } catch (error) {
      const message = error.message === 'partner_code_exists'
        ? 'Этот код уже занят. Выберите другой.'
        : 'Не удалось отправить заявку. Попробуйте ещё раз.';
      setFieldError('partnerFormError', message);
      button.disabled = false;
      button.textContent = 'Отправить заявку';
    }
  }

  async function copyLink(kind) {
    const link = portal?.links?.[kind];
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      if (typeof global.showToast === 'function') global.showToast('Ссылка скопирована');
    } catch (_) {
      const field = document.getElementById(`partner${kind === 'web' ? 'Web' : 'Bot'}Link`);
      field?.select();
    }
  }

  function render() {
    if (!portal) return renderApplication();
    const status = portal.partner?.status;
    if (status === 'active') return renderActive();
    if (status === 'rejected') return renderApplication(portal.partner);
    return renderStatus(status);
  }

  function renderGuest() {
    setContent(`
      <div class="partner-state-card">
        <div class="partner-state-icon" aria-hidden="true">↗</div>
        <h2>Станьте партнёром</h2>
        <p>Войдите через Telegram, отправьте короткую заявку и после одобрения получите две персональные ссылки.</p>
        <button class="save-log-btn" type="button" id="partnerLoginBtn">Войти через Telegram</button>
        <small>Вход нужен, чтобы никто другой не увидел и не изменил ваш кабинет.</small>
      </div>`);
    document.getElementById('partnerLoginBtn')?.addEventListener('click', () => {
      global.BabyAccount?.requestLogin('Войдите через Telegram, чтобы подать заявку на партнёрство.');
    });
  }

  function renderApplication(existing) {
    const rejected = existing?.status === 'rejected';
    setContent(`
      ${rejected ? statusBanner('rejected') : ''}
      <form class="partner-form card" id="partnerApplicationForm" novalidate>
        <div class="section-title">${rejected ? 'Исправить заявку' : 'Заявка на партнёрство'}</div>
        <div class="field"><label for="partnerNameInput">Имя или название площадки</label><input id="partnerNameInput" name="partnerName" maxlength="120" autocomplete="organization" value="${escapeHtml(existing?.name || '')}" placeholder="Например, Сон малыша"><small class="field-error" id="partnerNameError"></small></div>
        <div class="field"><label for="partnerCodeInput">Код для ссылки</label><input id="partnerCodeInput" name="partnerCode" maxlength="32" autocapitalize="none" autocomplete="off" spellcheck="false" value="${escapeHtml(existing?.code || '')}" placeholder="sleep_maria"><small>Только латинские буквы, цифры, _ или -.</small><small class="field-error" id="partnerCodeError"></small></div>
        <div class="field"><label for="partnerContactInput">Контакт для связи</label><input id="partnerContactInput" name="partnerContact" maxlength="160" autocomplete="username" value="${escapeHtml(existing?.contact || '')}" placeholder="@username или email"><small>Необязательно, если с вами можно связаться в Telegram.</small></div>
        <label class="partner-consent"><input type="checkbox" name="partnerTerms"><span>Я ознакомился с правилами ниже: 30% с первых двух подтверждённых оплат в рублях, холд 14 дней, ручные выплаты от 1 000 ₽.</span></label>
        <small class="field-error" id="partnerTermsError"></small>
        <small class="field-error" id="partnerFormError" role="alert"></small>
        <button class="save-log-btn" type="submit">${rejected ? 'Отправить повторно' : 'Отправить заявку'}</button>
      </form>`);
    document.getElementById('partnerApplicationForm')?.addEventListener('submit', apply);
    document.getElementById('partnerCodeInput')?.addEventListener('input', event => {
      event.target.value = event.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 32);
    });
  }

  function renderStatus(status) {
    setContent(statusBanner(status));
  }

  function renderActive() {
    const copy = statusCopy('active');
    const stats = portal.stats || {};
    setContent(`
      <div class="partner-status-banner is-active"><span>✓</span><div><strong>${copy[0]}</strong><small>${copy[1]}</small></div></div>
      <div class="partner-metrics" aria-label="Статистика партнёра">
        ${metric('Переходы', stats.referrals || 0)}
        ${metric('Покупки', stats.conversions || 0)}
        ${metric('К выплате', formatRubles(stats.available_rubles))}
        ${metric('Выплачено', formatRubles(stats.paid_rubles))}
      </div>
      <div class="card partner-links">
        <div class="section-title">Ссылки для приглашения</div>
        ${linkField('Web-ссылка', 'Web', portal.links.web)}
        ${linkField('Ссылка на Telegram-бота', 'Bot', portal.links.bot)}
        <p>Реферал ничего не вводит: он просто впервые открывает приложение или бота по вашей ссылке. Код закрепляется автоматически на 30 дней.</p>
      </div>
      <div class="card partner-balance-note"><strong>В холде: ${formatRubles(stats.pending_rubles)}</strong><span>Сумма становится доступной через 14 дней, если платёж не возвращён. Выплаты проводятся вручную раз в месяц от 1 000 ₽.</span></div>`);
    document.querySelectorAll('[data-copy-partner]').forEach(button => button.addEventListener('click', () => copyLink(button.dataset.copyPartner)));
  }

  function renderLoading() {
    setContent('<div class="partner-state-card"><div class="partner-loader" aria-hidden="true"></div><h2>Загружаем кабинет…</h2></div>');
  }

  function renderError(message) {
    setContent(`<div class="partner-state-card"><div class="partner-state-icon" aria-hidden="true">!</div><h2>Кабинет не загрузился</h2><p>${escapeHtml(message)}</p><button class="cta-outline-btn" id="partnerRetryBtn" type="button">Повторить</button></div>`);
    document.getElementById('partnerRetryBtn')?.addEventListener('click', load);
  }

  function statusBanner(status) {
    const copy = statusCopy(status);
    return `<div class="partner-status-banner is-${escapeHtml(status)}"><span>${status === 'pending' ? '⌛' : status === 'rejected' ? '!' : '‖'}</span><div><strong>${escapeHtml(copy[0])}</strong><small>${escapeHtml(copy[1])}</small></div></div>`;
  }

  function metric(label, value) {
    return `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
  }

  function linkField(label, id, value) {
    const kind = id.toLowerCase();
    return `<label class="partner-link-field"><span>${escapeHtml(label)}</span><div><input id="partner${id}Link" value="${escapeHtml(value)}" readonly><button type="button" data-copy-partner="${kind}">Копировать</button></div></label>`;
  }

  function formatRubles(value) {
    return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(Number(value || 0))} ₽`;
  }

  function setContent(html) {
    const root = document.getElementById('partnerPortalContent');
    if (root) root.innerHTML = html;
  }

  function setFieldError(id, message) {
    const element = document.getElementById(id);
    if (element) element.textContent = message || '';
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  }

  global.BabyPartners = { open, load, apply, copyLink, normalizeCode, statusCopy };
  global.addEventListener('baby-account-authenticated', () => {
    if (document.body.dataset.page === 'partner') load();
  });
  global.addEventListener('baby-account-logged-out', () => {
    if (document.body.dataset.page === 'partner') renderGuest();
  });
})(window);
