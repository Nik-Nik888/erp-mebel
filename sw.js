const CACHE_NAME = 'k2-mebel-v2';
const URLS_TO_CACHE = [
  '/erp-mebel/',
  '/erp-mebel/index.html'
];

// Установка — кэшируем основные файлы
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(URLS_TO_CACHE))
  );
  self.skipWaiting();
});

// Активация — удаляем старые кэши
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Стратегия: сначала сеть, если нет — кэш
self.addEventListener('fetch', event => {
  if (event.request.url.includes('supabase.co') || 
      event.request.url.includes('api.telegram.org') ||
      event.request.url.includes('cdnjs.cloudflare.com')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response.ok && event.request.method === 'GET') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request).then(cached => {
          return cached || new Response('Нет подключения к интернету', { 
            status: 503, 
            headers: { 'Content-Type': 'text/plain; charset=utf-8' } 
          });
        });
      })
  );
});

// Push-уведомления
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      // Фокусируем существующее окно или открываем новое
      for (const client of windowClients) {
        if (client.url.includes('/erp-mebel') && 'focus' in client) {
          return client.focus();
        }
      }
      return clients.openWindow('/erp-mebel/');
    })
  );
});
