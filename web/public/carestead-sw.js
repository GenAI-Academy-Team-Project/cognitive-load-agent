self.addEventListener('push', (event) => {
  let message = { title: 'Carestead', body: 'You have a care update.', url: '/' };
  try { message = { ...message, ...event.data.json() }; } catch { /* Show a generic notification for an empty payload. */ }
  event.waitUntil(self.registration.showNotification(message.title, { body: message.body, tag: message.tag, data: { url: message.url } }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/', self.location.origin);
  if (url.origin !== self.location.origin) return;
  event.waitUntil(self.clients.openWindow(url.href));
});
