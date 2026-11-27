import { ConfigService } from '@nestjs/config';
import { NovuNotificationTransport, webPushRecipientToken } from './novu-notification-transport';

const { jest } = import.meta;

describe('Novu Web Push registration', () => {
  const originalFetch = global.fetch;
  const configuration: Record<string, string> = {
    NOVU_SECURE_MODE_ENABLED: 'true',
    NOVU_SECRET_KEY: 'synthetic-secret',
    NOVU_PUSH_INTEGRATION_IDENTIFIER: 'push-webhook-test',
    NOVU_API_URL: 'https://novu.example.com',
  };
  const logger = { warn: jest.fn() };
  const transport = () =>
    new NovuNotificationTransport(
      {
        get: (key: string, fallback?: string) => configuration[key] ?? fallback,
      } as ConfigService,
      logger,
    );
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ acknowledged: true }) });
    global.fetch = fetchMock;
    logger.warn.mockClear();
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('upserts the authenticated subscriber and appends a device without replacing other devices', async () => {
    await expect(transport().registerWebPushRecipient({ subscriberId: 'person/1' })).resolves.toBe(true);
    expect(fetchMock.mock.calls.map(([url, options]) => [url, options.method])).toEqual([
      ['https://novu.example.com/v1/subscribers', 'POST'],
      ['https://novu.example.com/v1/subscribers/person%2F1/credentials', 'PATCH'],
    ]);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
      providerId: 'push-webhook',
      integrationIdentifier: 'push-webhook-test',
      credentials: { deviceTokens: [webPushRecipientToken('person/1')] },
    });
  });

  it('fails without exposing credentials when subscriber creation or registration fails', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 503 });
    await expect(transport().registerWebPushRecipient({ subscriberId: 'user-1' })).resolves.toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock.mockRejectedValueOnce(new Error('private-token'));
    await expect(transport().registerWebPushRecipient({ subscriberId: 'user-1' })).resolves.toBe(false);
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain('private-token');
  });

  it('passes batch and single recipient transaction IDs through unchanged', async () => {
    const body = {
      name: 'content-review-queued',
      to: [{ subscriberId: 'one' }, { subscriberId: 'two' }],
      transactionId: 'review:1',
      payload: { title: 'Revisar' },
    };
    await expect(transport().trigger('synthetic-secret', body)).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual(body);
  });
});
