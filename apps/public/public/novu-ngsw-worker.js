const ACTIVE_SUBSCRIBER_CACHE = 'cacic-eventos:notification-session';
const ACTIVE_SUBSCRIBER_REQUEST = '/__cacic_notification_active_subscriber__';

self.addEventListener('push', (event) => {
  const payload = parsePayload(event.data);
  const subscriberId = findSubscriberId(payload);

  if (!subscriberId) {
    return;
  }

  event.stopImmediatePropagation();
  event.waitUntil(handleGuardedPush(payload, subscriberId));
});

self.addEventListener('notificationclick', (event) => {
  const url = event.notification.data?.url;
  if (!url) {
    return;
  }

  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      const matchingClient = clientList.find((client) => 'focus' in client && client.url.endsWith(url));
      if (matchingClient) {
        return matchingClient.focus();
      }

      return clients.openWindow(url);
    }),
  );
});

function parsePayload(data) {
  if (!data) {
    return {};
  }

  try {
    return data.json();
  } catch {
    return {};
  }
}

async function handleGuardedPush(payload, subscriberId) {
  const activeSubscriberId = await readActiveSubscriberId();
  if (activeSubscriberId !== subscriberId) {
    return;
  }

  const notification = payload.notification ?? payload.webPush?.notification ?? payload.data ?? {};
  const data = {
    ...(payload.data ?? {}),
    ...(notification.data ?? {}),
  };
  const title = notification.title ?? payload.title ?? data.title ?? 'Notificação';
  const body = notification.body ?? payload.body ?? data.body ?? '';

  await self.registration.showNotification(title, {
    body,
    icon: notification.icon ?? data.icon ?? '/app/icons/icon-192x192.png',
    badge: notification.badge ?? data.badge ?? '/app/icons/icon-192x192.png',
    image: notification.image ?? data.image,
    data: {
      url: data.url ?? data.redirectUrl ?? payload.redirectUrl ?? '/app/notifications',
    },
  });
}

async function readActiveSubscriberId() {
  const cache = await caches.open(ACTIVE_SUBSCRIBER_CACHE);
  const response = await cache.match(ACTIVE_SUBSCRIBER_REQUEST);
  if (!response) {
    return null;
  }

  try {
    return (await response.json()).subscriberId ?? null;
  } catch {
    return null;
  }
}

function findSubscriberId(payload) {
  return (
    payload.subscriberId ??
    payload.data?.subscriberId ??
    payload.webPush?.data?.subscriberId ??
    payload.fcm?.data?.subscriberId ??
    null
  );
}

importScripts('./ngsw-worker.js');
