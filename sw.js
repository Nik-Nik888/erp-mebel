const CACHE_NAME = 'k2-mebel-v4';
const URLS_TO_CACHE = [
  '/erp-mebel/',
  '/erp-mebel/index.html'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(URLS_TO_CACHE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const url = event.request.url;
  if (url.includes('supabase.co') || 
      url.includes('api.telegram.org') ||
      url.includes('cdnjs.cloudflare.com') ||
      url.includes('fonts.googleapis.com') ||
      url.includes('fonts.gstatic.com') ||
      url.includes('wss://') ||
      url.includes('ws://') ||
      event.request.method !== 'GET') {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request).then(cached => {
          return cached || new Response('Нет подключения', { 
            status: 503, 
            headers: { 'Content-Type': 'text/plain; charset=utf-8' } 
          });
        });
      })
  );
});

// Получение Push-уведомления от сервера
self.addEventListener('push', event => {
  let title = 'K2 Мебель';
  let body = 'Новое уведомление';
  
  if (event.data) {
    try {
      const data = event.data.json();
      title = data.title || title;
      body = data.body || body;
    } catch (e) {
      body = event.data.text() || body;
    }
  }
  
  event.waitUntil(
    self.registration.showNotification(title, {
      body: body,
      icon: 'icon-192.png',
      badge: 'icon-192.png',
      vibrate: [200, 100, 200],
      tag: 'k2-push-' + Date.now(),
      requireInteraction: false,
      actions: [{ action: 'open', title: 'Открыть' }]
    })
  );
});

// Клик по уведомлению — открыть приложение
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      for (const client of windowClients) {
        if (client.url.includes('/erp-mebel') && 'focus' in client) {
          return client.focus();
        }
      }
      return clients.openWindow('/erp-mebel/');
    })
  );
});
