// ─── Telegram Mini App SDK integration ──────────────────────────────────────
const TG = window.Telegram?.WebApp;

function tmaInit() {
  if (!TG) return; // Running outside Telegram — still works as web app
  TG.ready();
  TG.expand(); // Expand to full height
  TG.enableClosingConfirmation();

  // Apply Telegram color scheme to CSS vars
  applyTGTheme();

  // Listen for theme changes
  TG.onEvent('themeChanged', applyTGTheme);
}

function applyTGTheme() {
  if (!TG) return;
  const p = TG.themeParams;
  const root = document.documentElement;
  if (p.bg_color)           root.style.setProperty('--tg-bg', p.bg_color);
  if (p.secondary_bg_color) root.style.setProperty('--tg-sec', p.secondary_bg_color);
  if (p.text_color)         root.style.setProperty('--tg-text', p.text_color);
  if (p.hint_color)         root.style.setProperty('--tg-hint', p.hint_color);
  if (p.link_color)         root.style.setProperty('--tg-link', p.link_color);
  if (p.button_color)       root.style.setProperty('--tg-btn', p.button_color);
  if (p.button_text_color)  root.style.setProperty('--tg-btn-text', p.button_text_color);
}

// Haptic feedback wrappers
function hapticLight()    { TG?.HapticFeedback?.impactOccurred('light'); }
function hapticMedium()   { TG?.HapticFeedback?.impactOccurred('medium'); }
function hapticSuccess()  { TG?.HapticFeedback?.notificationOccurred('success'); }
function hapticError()    { TG?.HapticFeedback?.notificationOccurred('error'); }
function hapticWarning()  { TG?.HapticFeedback?.notificationOccurred('warning'); }
function hapticSel()      { TG?.HapticFeedback?.selectionChanged(); }

// Back button
function showBackBtn(cb) {
  if (!TG?.BackButton) return;
  TG.BackButton.show();
  TG.BackButton.onClick(cb);
}
function hideBackBtn() {
  if (!TG?.BackButton) return;
  TG.BackButton.hide();
  TG.BackButton.offClick();
}

// Main button
function setMainBtn(text, cb) {
  if (!TG?.MainButton) return;
  TG.MainButton.setText(text);
  TG.MainButton.show();
  TG.MainButton.onClick(cb);
}
function hideMainBtn() {
  TG?.MainButton?.hide();
}
