(function(global) {
  'use strict';
  let installPrompt = null;

  function init() {
    if ('serviceWorker' in navigator && location.protocol === 'https:') {
      navigator.serviceWorker.register('./service-worker.js').catch(() => {});
    }
    global.addEventListener('beforeinstallprompt', event => {
      event.preventDefault();
      installPrompt = event;
      renderInstallRow(true);
    });
    global.addEventListener('appinstalled', () => {
      installPrompt = null;
      renderInstallRow(false);
      if (global.BabyAnalytics) global.BabyAnalytics.track('pwa_installed');
    });
    renderInstallRow(!isInstalled());
    handlePaymentReturn();
  }

  async function install() {
    if (isInstalled()) {
      if (typeof global.showToast === 'function') global.showToast('Приложение уже установлено');
      return;
    }
    if (installPrompt) {
      installPrompt.prompt();
      await installPrompt.userChoice;
      installPrompt = null;
      return;
    }
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent || '');
    const text = ios
      ? 'В Safari нажмите «Поделиться», затем «На экран Домой».'
      : 'Откройте меню браузера и выберите «Установить приложение» или «Добавить на главный экран».';
    if (typeof global.showToast === 'function') global.showToast(text, 6000);
  }

  function renderInstallRow(show) {
    const row = document.getElementById('profileInstallRow');
    if (row) row.style.display = show && !global.BabyAccount?.isMiniApp() ? 'grid' : 'none';
  }

  function isInstalled() {
    return global.matchMedia?.('(display-mode: standalone)').matches || global.navigator.standalone === true;
  }

  async function handlePaymentReturn() {
    const url = new URL(location.href);
    if (url.searchParams.get('payment') !== 'return') return;
    url.searchParams.delete('payment');
    history.replaceState({}, '', url.pathname + (url.search ? url.search : '') + url.hash);
    if (typeof global.showToast === 'function') global.showToast('Проверяем оплату...');
    for (let attempt = 0; attempt < 6; attempt += 1) {
      if (global.SUB && await global.SUB.refreshPremiumStatus()) {
        if (typeof global.showToast === 'function') global.showToast('Premium активирован');
        if (typeof global.goPage === 'function') global.goPage('premium', null);
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
    if (typeof global.showToast === 'function') global.showToast('Платёж обрабатывается. Статус обновится автоматически.', 5000);
  }

  global.BabyPWA = { init, install, isInstalled };
})(window);
