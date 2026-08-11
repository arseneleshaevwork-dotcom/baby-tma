const CACHE_NAME = 'baby-mode-v20260811-2';
const APP_SHELL = [
  './', './index.html', './style.css', './analytics-config.js', './analytics.js', './tma.js',
  './web-account.js', './cloud-sync.js', './pwa.js', './chat.js', './sleep-intelligence.js',
  './daily-coach.js', './baby-milestones.js', './tracker.js', './articles.js', './subscription.js',
  './onboarding.js', './reminder-planner.js', './notifications.js', './app.js', './premium.js',
  './manifest.webmanifest', './privacy.html', './terms.html'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then(response => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put('./index.html', copy));
      return response;
    }).catch(() => caches.match('./index.html')));
    return;
  }
  event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(response => {
    if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()));
    return response;
  })));
});
