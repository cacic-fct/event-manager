import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TURNSTILE_ACTIONS } from '@cacic-fct/shared-utils';
import { TurnstileService } from './turnstile.service';

describe('TurnstileService', () => {
  const originalFetch = global.fetch;
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.NODE_ENV = originalNodeEnv;
    jest.clearAllMocks();
  });

  it('skips validation by default outside production', async () => {
    const service = new TurnstileService(configService({}) as never);

    await expect(
      service.assertValidToken(undefined, undefined, TURNSTILE_ACTIONS.certificateValidation),
    ).resolves.toBeUndefined();
  });

  it('skips validation when explicitly disabled outside production', async () => {
    const service = new TurnstileService(configService({ TURNSTILE_ENABLED: 'false' }) as never);

    await expect(
      service.assertValidToken(undefined, undefined, TURNSTILE_ACTIONS.certificateValidation),
    ).resolves.toBeUndefined();
  });

  it('requires a token when enabled', async () => {
    const service = new TurnstileService(
      configService({ TURNSTILE_ENABLED: 'true', TURNSTILE_SECRET_KEY: 'secret' }) as never,
    );

    await expect(
      service.assertValidToken('', undefined, TURNSTILE_ACTIONS.certificateValidation),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('fails closed when production secret is missing', async () => {
    process.env.NODE_ENV = 'production';
    const service = new TurnstileService(configService({ NODE_ENV: 'production' }) as never);

    await expect(
      service.assertValidToken('token', undefined, TURNSTILE_ACTIONS.certificateValidation),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('validates the token with Cloudflare and checks action and hostname', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        success: true,
        action: TURNSTILE_ACTIONS.certificateValidation,
        hostname: 'eventos.example.com',
      }),
    });
    global.fetch = fetchMock as never;

    const service = new TurnstileService(
      configService({
        TURNSTILE_ENABLED: 'true',
        TURNSTILE_SECRET_KEY: 'secret',
        TURNSTILE_EXPECTED_HOSTNAMES: 'eventos.example.com',
      }) as never,
    );

    await expect(
      service.assertValidToken(
        'token',
        {
          headers: {
            'cf-connecting-ip': '203.0.113.10',
          },
        } as never,
        TURNSTILE_ACTIONS.certificateValidation,
      ),
    ).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledWith(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: expect.stringContaining('"remoteip":"203.0.113.10"'),
      }),
    );
  });

  it('rejects action mismatches', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        success: true,
        action: 'receipt_upload',
      }),
    }) as never;
    const service = new TurnstileService(
      configService({ TURNSTILE_ENABLED: 'true', TURNSTILE_SECRET_KEY: 'secret' }) as never,
    );

    await expect(
      service.assertValidToken('token', undefined, TURNSTILE_ACTIONS.certificateValidation),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

function configService(values: Record<string, string | undefined>) {
  return {
    get: jest.fn((key: string) => values[key]),
  } satisfies Pick<ConfigService, 'get'>;
}
