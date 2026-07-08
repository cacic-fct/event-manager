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

  it('rejects oversized tokens before contacting Cloudflare', async () => {
    global.fetch = jest.fn() as never;
    const service = new TurnstileService(
      configService({ TURNSTILE_ENABLED: 'true', TURNSTILE_SECRET_KEY: 'secret' }) as never,
    );

    await expect(
      service.assertValidToken('x'.repeat(2049), undefined, TURNSTILE_ACTIONS.certificateValidation),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(global.fetch).not.toHaveBeenCalled();
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

  it('uses the first forwarded IP and clamps the configured timeout', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        success: true,
        action: TURNSTILE_ACTIONS.certificateValidation,
      }),
    });
    global.fetch = fetchMock as never;

    const service = new TurnstileService(
      configService({
        TURNSTILE_ENABLED: 'true',
        TURNSTILE_SITEVERIFY_TIMEOUT_MS: '12000',
        TURNSTILE_SITEVERIFY_URL: 'https://turnstile.example.test/siteverify',
      }) as never,
    );

    await expect(
      service.assertValidToken(
        'token',
        {
          headers: {
            'x-forwarded-for': [' 198.51.100.11, 198.51.100.12 '],
          },
        } as never,
        TURNSTILE_ACTIONS.certificateValidation,
      ),
    ).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledWith(
      'https://turnstile.example.test/siteverify',
      expect.objectContaining({
        body: expect.stringContaining('"remoteip":"198.51.100.11"'),
      }),
    );
  });

  it('falls back to the request IP address when proxy headers are absent', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        success: true,
        action: TURNSTILE_ACTIONS.certificateValidation,
      }),
    });
    global.fetch = fetchMock as never;

    const service = new TurnstileService(
      configService({ TURNSTILE_ENABLED: 'true', TURNSTILE_SECRET_KEY: 'secret' }) as never,
    );

    await service.assertValidToken(
      'token',
      {
        headers: {},
        ip: '192.0.2.44',
        socket: {},
      } as never,
      TURNSTILE_ACTIONS.certificateValidation,
    );

    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: expect.stringContaining('"remoteip":"192.0.2.44"'),
      }),
    );
  });

  it('rejects failed Turnstile responses', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        success: false,
        action: TURNSTILE_ACTIONS.certificateValidation,
      }),
    }) as never;
    const service = new TurnstileService(
      configService({ TURNSTILE_ENABLED: 'true', TURNSTILE_SECRET_KEY: 'secret' }) as never,
    );

    await expect(
      service.assertValidToken('token', undefined, TURNSTILE_ACTIONS.certificateValidation),
    ).rejects.toBeInstanceOf(BadRequestException);
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

  it('rejects hostname mismatches when expected hostnames are configured', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        success: true,
        action: TURNSTILE_ACTIONS.certificateValidation,
        hostname: 'unexpected.example.com',
      }),
    }) as never;
    const service = new TurnstileService(
      configService({
        TURNSTILE_ENABLED: 'true',
        TURNSTILE_SECRET_KEY: 'secret',
        TURNSTILE_EXPECTED_HOSTNAMES: 'eventos.example.com',
      }) as never,
    );

    await expect(
      service.assertValidToken('token', undefined, TURNSTILE_ACTIONS.certificateValidation),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects upstream Turnstile failures', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
    }) as never;
    const service = new TurnstileService(
      configService({ TURNSTILE_ENABLED: 'true', TURNSTILE_SECRET_KEY: 'secret' }) as never,
    );

    await expect(
      service.assertValidToken('token', undefined, TURNSTILE_ACTIONS.certificateValidation),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('rejects invalid Turnstile response bodies', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        success: 'yes',
      }),
    }) as never;
    const service = new TurnstileService(
      configService({ TURNSTILE_ENABLED: 'true', TURNSTILE_SECRET_KEY: 'secret' }) as never,
    );

    await expect(
      service.assertValidToken('token', undefined, TURNSTILE_ACTIONS.certificateValidation),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('wraps transport failures as temporary Turnstile unavailability', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network unavailable')) as never;
    const service = new TurnstileService(
      configService({ TURNSTILE_ENABLED: 'true', TURNSTILE_SECRET_KEY: 'secret' }) as never,
    );

    await expect(
      service.assertValidToken('token', undefined, TURNSTILE_ACTIONS.certificateValidation),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});

function configService(values: Record<string, string | undefined>) {
  return {
    get: jest.fn((key: string) => values[key]),
  } satisfies Pick<ConfigService, 'get'>;
}
