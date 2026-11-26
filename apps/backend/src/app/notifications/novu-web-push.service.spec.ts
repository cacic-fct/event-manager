import { BadRequestException, ForbiddenException } from '@nestjs/common';
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

  const redis = {
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

  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it('rejects invalid signatures and recipient mismatches before looking up a subscription', async () => {
    const changed = { ...message, target: [webPushRecipientToken('someone-else')] };
    const raw = Buffer.from(JSON.stringify(changed));
    await expect(service.deliver(raw, '0'.repeat(64), changed)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.deliver(raw, sign(raw), changed)).rejects.toBeInstanceOf(BadRequestException);
    expect(redis.zrangebyscore).not.toHaveBeenCalled();
  });

  it('encrypts and sends Web Push and removes expired subscriptions', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 410 }));
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

  it.each([
    'https://localhost/private',
    'http://fcm.googleapis.com/fcm/send/test',
    'https://fcm.googleapis.com.evil.example/push',
    'https://fcm.googleapis.com:8443/fcm/send/test',
  ])('blocks delivery to an unsupported endpoint %s', (endpoint) => {
    expect(() => assertPushEndpoint(endpoint)).toThrow(BadRequestException);
  });
});
