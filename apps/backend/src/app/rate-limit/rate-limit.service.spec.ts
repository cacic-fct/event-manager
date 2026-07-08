import { createHash } from 'node:crypto';
import { Logger, ServiceUnavailableException } from '@nestjs/common';
import type { Response } from 'express';
import type Redis from 'ioredis';
import { RATE_LIMIT_POLICIES } from './rate-limit.policies';
import { RateLimitService } from './rate-limit.service';

describe('RateLimitService', () => {
  const policy = RATE_LIMIT_POLICIES.standaloneEventSubscription;

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('blocks production requests and sets rate limit headers', async () => {
    const redis = {
      eval: jest.fn().mockResolvedValue([0, 5, 0, 30, 120, 30]),
    };
    const response = responseMock();
    const service = new RateLimitService(redis as unknown as Redis, configService('production') as never);

    const decision = await service.consume({
      policy,
      request: {
        headers: {
          'cf-connecting-ip': '203.0.113.10',
        },
      } as never,
      response,
      authenticatedUser: { sub: 'user-1' } as never,
      resourceParts: ['event-1'],
    });

    expect(decision.allowed).toBe(false);
    expect(decision.retryAfterSeconds).toBe(30);
    expect(response.setHeader).toHaveBeenCalledWith('Retry-After', '30');
    expect(response.setHeader).toHaveBeenCalledWith('RateLimit-Limit', '4');
    expect(response.setHeader).toHaveBeenCalledWith('RateLimit-Remaining', '0');
  });

  it('allows development requests that would have been blocked', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const redis = {
      eval: jest.fn().mockResolvedValue([0, 5, 0, 30, 120, 30]),
    };
    const response = responseMock();
    const service = new RateLimitService(redis as unknown as Redis, configService('development') as never);

    const decision = await service.consume({
      policy,
      request: {
        headers: {},
      } as never,
      response,
      authenticatedUser: { sub: 'user-1' } as never,
      resourceParts: ['event-1'],
    });

    expect(decision.allowed).toBe(true);
    expect(decision.disabled).toBe(true);
    expect(decision.wouldBlock).toBe(true);
    expect(warn).toHaveBeenCalledWith(
      'Rate limit standalone-event-subscription would have blocked this request for 30s, but rate limiting is disabled outside production.',
    );
    expect(response.setHeader).toHaveBeenCalledWith('X-RateLimit-Disabled', 'true');
    expect(response.setHeader).toHaveBeenCalledWith('X-RateLimit-Would-Block', 'true');
  });

  it('allows production requests and sets non-blocking rate limit headers', async () => {
    const redis = {
      eval: jest.fn().mockResolvedValue([1, 2, 3, 0, 120, 0]),
    };
    const response = responseMock();
    const service = new RateLimitService(redis as unknown as Redis, configService('production') as never);

    const decision = await service.consume({
      policy,
      request: {
        headers: {},
      } as never,
      response,
      resourceParts: [' event-1 ', '', 'person-1'],
    });

    expect(decision).toEqual(
      expect.objectContaining({
        allowed: true,
        disabled: false,
        wouldBlock: false,
        attempts: 2,
        remaining: 3,
      }),
    );
    expect(response.setHeader).toHaveBeenCalledWith('X-RateLimit-Policy', policy.name);
    expect(response.setHeader).toHaveBeenCalledWith('X-RateLimit-Cooldown-Seconds', '0');
    expect(response.setHeader).not.toHaveBeenCalledWith('Retry-After', expect.any(String));
  });

  it('allows development requests without Redis state when evaluation fails', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const redis = {
      eval: jest.fn().mockRejectedValue('redis unavailable'),
    };
    const response = responseMock();
    const service = new RateLimitService(redis as unknown as Redis, configService('test') as never);

    const decision = await service.consume({
      policy,
      request: {
        headers: {},
      } as never,
      response,
    });

    expect(decision).toEqual(
      expect.objectContaining({
        allowed: true,
        disabled: true,
        wouldBlock: false,
        attempts: 0,
        remaining: policy.freeAttempts,
      }),
    );
    expect(response.setHeader).toHaveBeenCalledWith('X-RateLimit-Disabled', 'true');
    expect(warn).toHaveBeenCalledWith(
      'Rate limit standalone-event-subscription could not be evaluated in development: redis unavailable',
    );
  });

  it('formats Error objects when disabled environments cannot evaluate the limit', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const redis = {
      eval: jest.fn().mockRejectedValue(new Error('redis unavailable')),
    };
    const service = new RateLimitService(redis as unknown as Redis, configService('test') as never);

    await expect(
      service.consume({
        policy,
        request: {
          headers: {},
        } as never,
      }),
    ).resolves.toEqual(expect.objectContaining({ allowed: true, disabled: true }));
    expect(warn).toHaveBeenCalledWith(
      'Rate limit standalone-event-subscription could not be evaluated in development: redis unavailable',
    );
  });

  it('uses maxAttempts in disabled fallback decisions when available', async () => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const policyWithMaxAttempts = RATE_LIMIT_POLICIES.publicEvents;
    const redis = {
      eval: jest.fn().mockRejectedValue(new Error('redis unavailable')),
    };
    const service = new RateLimitService(redis as unknown as Redis, configService('test') as never);

    await expect(
      service.consume({
        policy: policyWithMaxAttempts,
        request: {
          headers: {},
        } as never,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        limit: policyWithMaxAttempts.maxAttempts,
        remaining: policyWithMaxAttempts.maxAttempts,
      }),
    );
  });

  it('rejects production requests when Redis cannot evaluate the limit', async () => {
    const redis = {
      eval: jest.fn().mockRejectedValue(new Error('redis unavailable')),
    };
    const service = new RateLimitService(redis as unknown as Redis, configService('production') as never);

    await expect(
      service.consume({
        policy,
        request: {
          headers: {},
        } as never,
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('rejects malformed Redis responses in production', async () => {
    const redis = {
      eval: jest.fn().mockResolvedValue([1, 2]),
    };
    const service = new RateLimitService(redis as unknown as Redis, configService('production') as never);

    await expect(
      service.consume({
        policy,
        request: {
          headers: {},
        } as never,
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('normalizes non-finite and fractional Redis response values', async () => {
    const redis = {
      eval: jest.fn().mockResolvedValue([1, '2.9', 'not-a-number', '-3', '4.2', '5.9']),
    };
    const service = new RateLimitService(redis as unknown as Redis, configService('production') as never);

    const decision = await service.consume({
      policy,
      request: {
        headers: {},
      } as never,
    });

    expect(decision).toEqual(
      expect.objectContaining({
        attempts: 2,
        remaining: 0,
        retryAfterSeconds: 0,
        resetSeconds: 4,
        cooldownSeconds: 5,
      }),
    );
  });

  it('uses maxAttempts as the policy limit when configured', async () => {
    const policyWithMaxAttempts = RATE_LIMIT_POLICIES.publicEvents;
    const redis = {
      eval: jest.fn().mockResolvedValue([1, 1, 59, 0, 60, 0]),
    };
    const service = new RateLimitService(redis as unknown as Redis, configService('production') as never);

    const decision = await service.consume({
      policy: policyWithMaxAttempts,
      request: {
        headers: {},
      } as never,
    });

    expect(decision.limit).toBe(policyWithMaxAttempts.maxAttempts);
    expect(redis.eval).toHaveBeenCalledWith(
      expect.any(String),
      1,
      expect.stringContaining(`cacic:rate-limit:${policyWithMaxAttempts.name}:`),
      expect.any(String),
      policyWithMaxAttempts.windowMs.toString(),
      policyWithMaxAttempts.freeAttempts.toString(),
      policyWithMaxAttempts.maxAttempts.toString(),
      policyWithMaxAttempts.baseCooldownMs.toString(),
      policyWithMaxAttempts.maxCooldownMs.toString(),
    );
  });

  it('throws HTTP exceptions from assertAllowed when requests are blocked', async () => {
    const redis = {
      eval: jest.fn().mockResolvedValue([0, 5, 0, 30, 120, 30]),
    };
    const service = new RateLimitService(redis as unknown as Redis, configService('production') as never);

    await expect(
      service.assertAllowed({
        policy,
        request: {
          headers: {},
        } as never,
      }),
    ).rejects.toMatchObject({
      status: 429,
      response: expect.objectContaining({
        message: 'Rate limit exceeded. Retry after 30 seconds.',
        retryAfterSeconds: 30,
        rateLimit: {
          limit: policy.freeAttempts,
          policy: policy.name,
          remaining: 0,
          resetSeconds: 120,
          retryAfterSeconds: 30,
        },
      }),
    });
  });

  it('allows assertAllowed calls when the limit decision allows the request', async () => {
    const redis = {
      eval: jest.fn().mockResolvedValue([1, 1, 3, 0, 120, 0]),
    };
    const service = new RateLimitService(redis as unknown as Redis, configService('production') as never);

    await expect(
      service.assertAllowed({
        policy,
        request: {
          headers: {},
        } as never,
      }),
    ).resolves.toBeUndefined();
  });

  it('creates GraphQL errors with rate-limit extensions', () => {
    const service = new RateLimitService({ eval: jest.fn() } as unknown as Redis, configService('production') as never);

    const error = service.toGraphQLError({
      allowed: false,
      disabled: false,
      wouldBlock: true,
      policyName: policy.name,
      limit: policy.freeAttempts,
      attempts: 5,
      remaining: 0,
      retryAfterSeconds: 30,
      resetSeconds: 120,
      cooldownSeconds: 30,
    });

    expect(error.message).toBe('Rate limit exceeded. Retry after 30 seconds.');
    expect(error.extensions).toEqual({
      code: 'RATE_LIMITED',
      http: {
        status: 429,
      },
      retryAfterSeconds: 30,
      rateLimit: {
        limit: policy.freeAttempts,
        policy: policy.name,
        remaining: 0,
        resetSeconds: 120,
        retryAfterSeconds: 30,
      },
    });
  });

  it('keys authenticated requests by user without IP headers', async () => {
    const redis = {
      eval: jest.fn().mockResolvedValue([1, 1, 3, 0, 120, 0]),
    };
    const service = new RateLimitService(redis as unknown as Redis, configService('production') as never);

    await service.consume({
      policy,
      request: {
        headers: {
          'cf-connecting-ipv6': '2001:db8::1',
          'cf-connecting-ip': '203.0.113.10',
          'cf-pseudo-ipv4': '192.0.2.44',
        },
      } as never,
      authenticatedUser: { sub: 'user-1' } as never,
      resourceParts: ['event-1'],
    });

    const expectedHash = createHash('sha256')
      .update(`${policy.name}|user:user-1|event-1`)
      .digest('hex');
    expect(redis.eval).toHaveBeenCalledWith(
      expect.any(String),
      1,
      `cacic:rate-limit:${policy.name}:${expectedHash}`,
      expect.any(String),
      policy.windowMs.toString(),
      policy.freeAttempts.toString(),
      '0',
      policy.baseCooldownMs.toString(),
      policy.maxCooldownMs.toString(),
    );
  });

  it('keys authenticated requests by email without IP headers when sub is unavailable', async () => {
    const redis = {
      eval: jest.fn().mockResolvedValue([1, 1, 3, 0, 120, 0]),
    };
    const service = new RateLimitService(redis as unknown as Redis, configService('production') as never);

    await service.consume({
      policy,
      request: {
        headers: {
          'cf-connecting-ip': '203.0.113.10',
        },
      } as never,
      authenticatedUser: { email: 'user@example.com' } as never,
      resourceParts: ['event-1'],
    });

    const expectedHash = createHash('sha256')
      .update(`${policy.name}|email:user@example.com|event-1`)
      .digest('hex');
    expect(redis.eval).toHaveBeenCalledWith(
      expect.any(String),
      1,
      `cacic:rate-limit:${policy.name}:${expectedHash}`,
      expect.any(String),
      policy.windowMs.toString(),
      policy.freeAttempts.toString(),
      '0',
      policy.baseCooldownMs.toString(),
      policy.maxCooldownMs.toString(),
    );
  });

  it('prefers the request user when no explicit authenticated user is provided', async () => {
    const redis = {
      eval: jest.fn().mockResolvedValue([1, 1, 3, 0, 120, 0]),
    };
    const service = new RateLimitService(redis as unknown as Redis, configService('production') as never);

    await service.consume({
      policy,
      request: {
        headers: {},
        user: { sub: 'request-user' },
      } as never,
      resourceParts: ['event-1'],
    });

    const expectedHash = createHash('sha256')
      .update(`${policy.name}|user:request-user|event-1`)
      .digest('hex');
    expect(redis.eval).toHaveBeenCalledWith(
      expect.any(String),
      1,
      `cacic:rate-limit:${policy.name}:${expectedHash}`,
      expect.any(String),
      policy.windowMs.toString(),
      policy.freeAttempts.toString(),
      '0',
      policy.baseCooldownMs.toString(),
      policy.maxCooldownMs.toString(),
    );
  });

  it('keys anonymous requests by preferred Cloudflare IP header', async () => {
    const redis = {
      eval: jest.fn().mockResolvedValue([1, 1, 3, 0, 120, 0]),
    };
    const service = new RateLimitService(redis as unknown as Redis, configService('production') as never);

    await service.consume({
      policy,
      request: {
        headers: {
          'cf-connecting-ipv6': '2001:db8::1',
          'cf-connecting-ip': '203.0.113.10',
          'cf-pseudo-ipv4': '192.0.2.44',
        },
      } as never,
      resourceParts: ['event-1'],
    });

    const expectedHash = createHash('sha256')
      .update(`${policy.name}|ip:2001:db8::1|event-1`)
      .digest('hex');
    expect(redis.eval).toHaveBeenCalledWith(
      expect.any(String),
      1,
      `cacic:rate-limit:${policy.name}:${expectedHash}`,
      expect.any(String),
      policy.windowMs.toString(),
      policy.freeAttempts.toString(),
      '0',
      policy.baseCooldownMs.toString(),
      policy.maxCooldownMs.toString(),
    );
  });

  it('keys anonymous requests by forwarded, real, socket, and unknown IP fallbacks', async () => {
    const redis = {
      eval: jest.fn().mockResolvedValue([1, 1, 3, 0, 120, 0]),
    };
    const service = new RateLimitService(redis as unknown as Redis, configService('production') as never);

    await service.consume({
      policy,
      request: {
        headers: {
          'x-forwarded-for': ' 198.51.100.10, 198.51.100.11 ',
        },
      } as never,
    });
    expect(redis.eval).toHaveBeenLastCalledWith(
      expect.any(String),
      1,
      expectedKey('ip:198.51.100.10', ''),
      expect.any(String),
      policy.windowMs.toString(),
      policy.freeAttempts.toString(),
      '0',
      policy.baseCooldownMs.toString(),
      policy.maxCooldownMs.toString(),
    );

    await service.consume({
      policy,
      request: {
        headers: {
          'cf-connecting-ipv6': [],
          'cf-connecting-ip': ['   '],
          'x-real-ip': [' 198.51.100.12 '],
        },
      } as never,
    });
    expect(redis.eval).toHaveBeenLastCalledWith(
      expect.any(String),
      1,
      expectedKey('ip:198.51.100.12', ''),
      expect.any(String),
      policy.windowMs.toString(),
      policy.freeAttempts.toString(),
      '0',
      policy.baseCooldownMs.toString(),
      policy.maxCooldownMs.toString(),
    );

    await service.consume({
      policy,
      request: {
        headers: {},
        ip: '198.51.100.14',
      } as never,
    });
    expect(redis.eval).toHaveBeenLastCalledWith(
      expect.any(String),
      1,
      expectedKey('ip:198.51.100.14', ''),
      expect.any(String),
      policy.windowMs.toString(),
      policy.freeAttempts.toString(),
      '0',
      policy.baseCooldownMs.toString(),
      policy.maxCooldownMs.toString(),
    );

    await service.consume({
      policy,
      request: {
        headers: {},
        socket: {
          remoteAddress: '198.51.100.13',
        },
      } as never,
    });
    expect(redis.eval).toHaveBeenLastCalledWith(
      expect.any(String),
      1,
      expectedKey('ip:198.51.100.13', ''),
      expect.any(String),
      policy.windowMs.toString(),
      policy.freeAttempts.toString(),
      '0',
      policy.baseCooldownMs.toString(),
      policy.maxCooldownMs.toString(),
    );

    await service.consume({
      policy,
    });
    expect(redis.eval).toHaveBeenLastCalledWith(
      expect.any(String),
      1,
      expectedKey('ip:unknown', ''),
      expect.any(String),
      policy.windowMs.toString(),
      policy.freeAttempts.toString(),
      '0',
      policy.baseCooldownMs.toString(),
      policy.maxCooldownMs.toString(),
    );
  });
});

function configService(nodeEnv: string) {
  return {
    get: jest.fn((key: string) => (key === 'NODE_ENV' ? nodeEnv : undefined)),
  };
}

function responseMock(): Response {
  return {
    setHeader: jest.fn(),
  } as unknown as Response;
}

function expectedKey(identity: string, resource: string): string {
  const expectedHash = createHash('sha256')
    .update(`${RATE_LIMIT_POLICIES.standaloneEventSubscription.name}|${identity}|${resource}`)
    .digest('hex');
  return `cacic:rate-limit:${RATE_LIMIT_POLICIES.standaloneEventSubscription.name}:${expectedHash}`;
}
