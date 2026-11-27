import { BadRequestException, ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import { generateVAPIDKeys } from 'web-push';
import { webPushRecipientToken } from './novu-notification-transport';
import { assertPushEndpoint, NovuWebPushService } from './novu-web-push.service';

const { jest } = import.meta;

describe('NovuWebPushService', () => {
  const keys = generateVAPIDKeys();
  const secret = 'synthetic-webhook-secret';
  const subscription = JSON.stringify({
    endpoint: 'https://fcm.googleapis.com/fcm/send/test-subscription',
    keys: { p256dh: generateVAPIDKeys().publicKey, auth: Buffer.alloc(16).toString('base64url') },
  });
  const message = {
    target: [webPushRecipientToken('user-1')],
    title: 'Aviso',
    content: 'Texto',
    messageId: 'message-1',
    payload: { subscriber: { subscriberId: 'user-1' }, redirectUrl: '/app/notifications' },
  };

  const deliveries = new Map<string, string>();
  const redis = {
    get: jest.fn(async (key: string) => deliveries.get(key) ?? null),
    set: jest.fn(async (key: string, value: string) => {
      deliveries.set(key, value);
      return 'OK';
    }),
    eval: jest.fn(async () => 1),
    zrangebyscore: jest.fn().mockResolvedValue([subscription]),
    zrem: jest.fn(),
  };
  const service = new NovuWebPushService(
    new ConfigService({
      NOVU_PUSH_WEBHOOK_SECRET: secret,
      NOVU_VAPID_PUBLIC_KEY: keys.publicKey,
      NOVU_VAPID_PRIVATE_KEY: keys.privateKey,
      NOVU_VAPID_SUBJECT: 'mailto:push@example.com',
    }),
    redis as never,
  );
  const sign = (body: Buffer) => createHmac('sha256', secret).update(body).digest('hex');

  const fetchMock = jest.fn<typeof fetch>();
  beforeEach(() => {
    fetchMock.mockReset();
    Object.defineProperty(globalThis, 'fetch', { configurable: true, writable: true, value: fetchMock });
  });
  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    deliveries.clear();
    redis.zrangebyscore.mockResolvedValue([subscription]);
  });

  it('rejects invalid signatures and recipient mismatches before looking up a subscription', async () => {
    const changed = { ...message, target: [webPushRecipientToken('someone-else')] };
    const raw = Buffer.from(JSON.stringify(changed));
    await expect(service.deliver(raw, '0'.repeat(64), changed)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.deliver(raw, sign(raw), changed)).rejects.toBeInstanceOf(BadRequestException);
    expect(redis.zrangebyscore).not.toHaveBeenCalled();
  });

  it('encrypts and sends Web Push and removes expired subscriptions', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 410 }));
    const raw = Buffer.from(JSON.stringify(message));
    await expect(service.deliver(raw, sign(raw), message)).resolves.toEqual({ id: 'message-1' });
    expect(fetchMock).toHaveBeenCalledWith(
      JSON.parse(subscription).endpoint,
      expect.objectContaining({
        method: 'POST',
        redirect: 'error',
        headers: expect.objectContaining({ 'Content-Encoding': 'aes128gcm' }),
        body: expect.any(Uint8Array),
      }),
    );
    expect(redis.zrem).toHaveBeenCalledWith(expect.any(String), subscription);
  });

  it.each([201, 410])(
    'retries a failed subscription after a %s on another device without resending successes',
    async (status) => {
      const second = JSON.stringify({
        ...JSON.parse(subscription),
        endpoint: 'https://fcm.googleapis.com/fcm/send/second',
      });
      redis.zrangebyscore.mockResolvedValue([subscription, second]);
      fetchMock
        .mockResolvedValueOnce(new Response(null, { status }))
        .mockResolvedValueOnce(new Response(null, { status: 503 }))
        .mockResolvedValue(new Response(null, { status: 201 }));
      const raw = Buffer.from(JSON.stringify(message));
      await expect(service.deliver(raw, sign(raw), message)).rejects.toBeInstanceOf(ServiceUnavailableException);
      if (status === 410) redis.zrangebyscore.mockResolvedValue([second]);
      await expect(service.deliver(raw, sign(raw), message)).resolves.toEqual({ id: 'message-1' });
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(fetchMock.mock.calls[2][0]).toBe(JSON.parse(second).endpoint);
    },
  );

  it('accepts WNS endpoints with a bounded hostname suffix', () => {
    expect(() => assertPushEndpoint('https://wns2-par02p.notify.windows.com/w/?token=example')).not.toThrow();
  });

  it.each([
    'https://localhost/private',
    'https://notify.windows.com.evil.example/push',
    'https://evilnotify.windows.com/push',
    'http://fcm.googleapis.com/fcm/send/test',
    'https://fcm.googleapis.com.evil.example/push',
    'https://fcm.googleapis.com:8443/fcm/send/test',
  ])('blocks delivery to an unsupported endpoint %s', (endpoint) => {
    expect(() => assertPushEndpoint(endpoint)).toThrow(BadRequestException);
  });
});
