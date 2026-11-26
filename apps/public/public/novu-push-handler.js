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
  if (!event.notification.data?.cacicPush) return;
  event.stopImmediatePropagation();
  const url = event.notification.data?.url;
  if (!url) {
    return;
  }

  event.notification.close();
  event.waitUntil(
    readActiveSubscriberId().then(async (subscriberId) => {
      if (subscriberId !== event.notification.data.subscriberId) return;
      const clientList = await clients.matchAll({ type: 'window', includeUncontrolled: true });
      const matchingClient = clientList.find((client) => 'focus' in client && client.url.endsWith(url));
      if (matchingClient) {
        return matchingClient.focus();
      }

      return clients.openWindow(trustedAppPath(url));
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
    icon: notification.icon ?? data.icon ?? '/app/icons/192.webp',
    badge: notification.badge ?? data.badge ?? '/app/icons/192.webp',
    image: notification.image ?? data.image,
    data: {
      cacicPush: true,
      subscriberId,
      url: trustedAppPath(data.url ?? data.redirectUrl ?? payload.redirectUrl),
    },
  });
}

function trustedAppPath(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
    return '/app/notifications';
  }
  if (/^\/(app|admin)(\/|\?|#|$)/.test(value)) return value;
  return `/app${value}`;
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
  return payload.subscriberId ?? payload.data?.subscriberId ?? payload.webPush?.data?.subscriberId ?? null;
}
