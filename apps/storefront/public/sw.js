// KNEF Storefront — Push Notification Service Worker
// Handles: push, notificationclick, pushsubscriptionchange
// Does NOT intercept fetch or cache payment/checkout APIs

const ALLOWED_URL_PREFIXES = [
  '/',              // relative path (same origin)
];

function isSafeDestination(url) {
  try {
    const parsed = new URL(url, self.location.origin);
    // Only allow same-origin destinations
    if (parsed.origin !== self.location.origin) return false;
    const path = parsed.pathname;
    return ALLOWED_URL_PREFIXES.some(prefix => path.startsWith(prefix));
  } catch {
    return false;
  }
}

self.addEventListener('push', event => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'KNEF', body: event.data ? event.data.text() : '' };
  }

  const title = typeof data.title === 'string' ? data.title : 'KNEF Notification';
  const options = {
    body: typeof data.body === 'string' ? data.body : '',
    icon: typeof data.icon === 'string' ? data.icon : '/icon-192.png',
    badge: '/icon-192.png',
    tag: typeof data.tag === 'string' ? data.tag : 'knef-notification',
    data: {
      url: isSafeDestination(data.url) ? data.url : '/',
    },
    requireInteraction: false,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();

  const notificationData = event.notification.data ?? {};
  const destination = isSafeDestination(notificationData.url) ? notificationData.url : '/';
  const targetUrl = new URL(destination, self.location.origin).href;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url === targetUrl && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    }),
  );
});

self.addEventListener('pushsubscriptionchange', event => {
  // Re-subscribe when the browser rotates the push subscription
  event.waitUntil(
    self.registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: event.oldSubscription?.options?.applicationServerKey,
    }).then(newSubscription => {
      // Notify the app so it can sync the new subscription with the server
      return clients.matchAll({ type: 'window' }).then(clientList => {
        for (const client of clientList) {
          client.postMessage({
            type: 'PUSH_SUBSCRIPTION_CHANGED',
            subscription: newSubscription.toJSON(),
          });
        }
      });
    }).catch(() => {
      // If re-subscribe fails, the user will need to re-enable notifications
    }),
  );
});
