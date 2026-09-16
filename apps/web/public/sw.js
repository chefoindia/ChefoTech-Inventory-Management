/* PharmaOS service worker: web push display + click-through. No caching of app data. */
self.addEventListener('push', (event) => {
  let data = { title: 'PharmaOS', body: '', url: '/notifications', tag: 'pharmaos' };
  try {
    data = { ...data, ...event.data.json() };
  } catch {
    if (event.data) data.body = event.data.text();
  }
  event.waitUntil(
    self.registration.showNotification(data.title, { body: data.body, tag: data.tag, icon: '/favicon.ico', data: { url: data.url } }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/notifications';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
