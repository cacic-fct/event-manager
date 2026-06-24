import { createHash } from 'node:crypto';
import { Response } from 'express';
import Redis from 'ioredis';
import { RATE_LIMIT_POLICIES } from './rate-limit.policies';
import { RateLimitService } from './rate-limit.service';

describe('RateLimitService', () => {
  const policy = RATE_LIMIT_POLICIES.standaloneEventSubscription;

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
    const redis = {
      eval: jest.fn().mockResolvedValue([0, 5, 0, 30, 120, 30]),
    };
    const service = new RateLimitService(redis as unknown as Redis, configService('development') as never);

    const decision = await service.consume({
      policy,
      request: {
        headers: {},
      } as never,
      authenticatedUser: { sub: 'user-1' } as never,
      resourceParts: ['event-1'],
    });

    expect(decision.allowed).toBe(true);
    expect(decision.disabled).toBe(true);
    expect(decision.wouldBlock).toBe(true);
  });

  it('keys authenticated requests by user and preferred Cloudflare IP header', async () => {
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
      .update(`${policy.name}|user:user-1|ip:2001:db8::1|event-1`)
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
