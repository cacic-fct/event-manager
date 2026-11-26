import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { resolve } from 'node:path';

type PushEvent = {
  data?: { json(): unknown };
  notification?: { data: Record<string, unknown>; close(): void };
  stopImmediatePropagation(): void;
  waitUntil(promise: Promise<unknown>): void;
};

function harness(activeSubscriber: string | null) {
  const listeners = new Map<string, (event: PushEvent) => void>();
  const showNotification = vi.fn();
  const openWindow = vi.fn();
  runInNewContext(readFileSync(resolve('apps/public/public/novu-push-handler.js'), 'utf8'), {
    self: {
      addEventListener: (type: string, listener: (event: PushEvent) => void) => listeners.set(type, listener),
      registration: { showNotification },
    },
    caches: { open: async () => ({ match: async () => ({ json: async () => ({ subscriberId: activeSubscriber }) }) }) },
    clients: { matchAll: async () => [], openWindow },
  });
  async function dispatch(type: string, payload: unknown) {
    let task: Promise<unknown> | undefined;
    const event: PushEvent = {
      data: { json: () => payload },
      stopImmediatePropagation: vi.fn(),
      waitUntil: (promise) => {
        task = promise;
      },
    };
    if (type === 'notificationclick') event.notification = { data: payload as Record<string, unknown>, close: vi.fn() };
    listeners.get(type)?.(event);
    await task;
  }
  return { dispatch, showNotification, openWindow };
}

describe('Web Push worker privacy and navigation', () => {
  it('shows a data-only message for the active subscriber with the public mount', async () => {
    const worker = harness('user-1');
    await worker.dispatch('push', {
      subscriberId: 'user-1',
      title: 'Aviso',
      body: 'Texto',
      redirectUrl: '/profile/forms/1',
    });
    expect(worker.showNotification).toHaveBeenCalledWith(
      'Aviso',
      expect.objectContaining({
        body: 'Texto',
        data: { cacicPush: true, subscriberId: 'user-1', url: '/app/profile/forms/1' },
      }),
    );
  });

  it.each([null, 'another-user'])('suppresses a previous user message when active subscriber is %s', async (active) => {
    const worker = harness(active);
    await worker.dispatch('push', { data: { subscriberId: 'user-1', title: 'Private' } });
    expect(worker.showNotification).not.toHaveBeenCalled();
    await worker.dispatch('notificationclick', {
      cacicPush: true,
      subscriberId: 'user-1',
      url: '/admin/content-reviews',
    });
    expect(worker.openWindow).not.toHaveBeenCalled();
  });

  it.each(['https://example.com', '//example.com', '/\\example.com'])(
    'rejects an external push redirect %s',
    async (url) => {
      const worker = harness('user-1');
      await worker.dispatch('push', { data: { subscriberId: 'user-1', title: 'Aviso', url } });
      expect(worker.showNotification).toHaveBeenCalledWith(
        'Aviso',
        expect.objectContaining({
          data: expect.objectContaining({ url: '/app/notifications' }),
        }),
      );
    },
  );

  it('opens an explicit admin route only while its subscriber is active', async () => {
    const worker = harness('user-1');
    await worker.dispatch('notificationclick', {
      cacicPush: true,
      subscriberId: 'user-1',
      url: '/admin/content-reviews',
    });
    expect(worker.openWindow).toHaveBeenCalledWith('/admin/content-reviews');
  });
});
