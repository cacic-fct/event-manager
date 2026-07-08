import { once } from 'node:events';
import { FactoryProvider } from '@nestjs/common';
import Redis from 'ioredis';
import { RateLimitService } from '../rate-limit/rate-limit.service';
import type { RateLimitPolicy } from '../rate-limit/rate-limit.policies';
import { getRedisConnectionOptions } from '../weather/redis-connection';
import { ManagedRedisClient, redisProvider } from './redis.provider';

const mockRedisConstructor = jest.fn();
const mockRedisDisconnect = jest.fn();

jest.mock('ioredis', () => {
  return class MockRedis {
    constructor(options: unknown) {
      mockRedisConstructor(options);
    }

    disconnect(): void {
      mockRedisDisconnect();
    }
  };
});

interface RedisTestClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ...args: unknown[]): Promise<'OK' | null>;
  del(...keys: string[]): Promise<number>;
  exists(key: string): Promise<number>;
  eval(script: string, keyCount: number, ...args: unknown[]): Promise<unknown>;
  scanStream(options?: { match?: string }): NodeJS.ReadableStream;
  disconnect(): void;
  onModuleDestroy(): void;
}

describe('redisProvider e2e in-memory infrastructure', () => {
  const originalFlag = process.env.BACKEND_E2E_IN_MEMORY_INFRA;
  const originalRedisUrl = process.env.REDIS_URL;

  afterEach(() => {
    jest.restoreAllMocks();
    mockRedisConstructor.mockClear();
    mockRedisDisconnect.mockClear();

    if (originalFlag === undefined) {
      delete process.env.BACKEND_E2E_IN_MEMORY_INFRA;
    } else {
      process.env.BACKEND_E2E_IN_MEMORY_INFRA = originalFlag;
    }

    if (originalRedisUrl === undefined) {
      delete process.env.REDIS_URL;
    } else {
      process.env.REDIS_URL = originalRedisUrl;
    }
  });

  it('stores, reads, expires, deletes, and scans keys in memory', async () => {
    const redis = createInMemoryRedis();

    await expect(redis.set('auth:session:1', 'session')).resolves.toBe('OK');
    await expect(redis.get('auth:session:1')).resolves.toBe('session');
    await expect(redis.exists('auth:session:1')).resolves.toBe(1);
    await expect(redis.set('auth:session:1', 'other', 'NX')).resolves.toBeNull();

    const stream = redis.scanStream();
    const data = once(stream, 'data') as Promise<[string[]]>;
    const end = once(stream, 'end');
    const [keys] = await data;
    expect(keys).toEqual(['auth:session:1']);
    await end;

    await expect(redis.del('auth:session:1')).resolves.toBe(1);
    await expect(redis.del('auth:session:1')).resolves.toBe(0);
    await expect(redis.exists('auth:session:1')).resolves.toBe(0);
  });

  it('scans only keys matching the requested pattern', async () => {
    const redis = createInMemoryRedis();

    await redis.set('auth:session:1', 'session');
    await redis.set('dashboard:workspace:global', 'insights');
    await redis.set('dashboard:workspace:event-manager', 'insights');

    const stream = redis.scanStream({ match: 'dashboard:workspace:*' });
    const data = once(stream, 'data') as Promise<[string[]]>;
    const [keys] = await data;

    expect(keys).toEqual(['dashboard:workspace:global', 'dashboard:workspace:event-manager']);
  });

  it('expires keys using EX and PX durations', async () => {
    const redis = createInMemoryRedis();
    const now = jest.spyOn(Date, 'now').mockReturnValue(1_000);

    await redis.set('short:px', 'value', 'PX', 5);
    await expect(redis.get('short:px')).resolves.toBe('value');
    now.mockReturnValue(1_006);
    await expect(redis.get('short:px')).resolves.toBeNull();

    now.mockReturnValue(2_000);
    await redis.set('short:ex', 'value', 'EX', 1);
    now.mockReturnValue(2_999);
    await expect(redis.exists('short:ex')).resolves.toBe(1);
    now.mockReturnValue(3_001);
    await expect(redis.exists('short:ex')).resolves.toBe(0);
  });

  it('keeps keys without a valid expiration duration', async () => {
    const redis = createInMemoryRedis();
    const now = jest.spyOn(Date, 'now').mockReturnValue(1_000);

    await redis.set('invalid:ttl', 'value', 'EX', 'not-a-number');
    now.mockReturnValue(999_999);

    await expect(redis.get('invalid:ttl')).resolves.toBe('value');
  });

  it('supports the auth state pop script shape', async () => {
    const redis = createInMemoryRedis();
    await redis.set('auth:oauth-state:state-1', '{"returnTo":"/admin"}');

    await expect(
      redis.eval(
        'local value = redis.call("get", KEYS[1]) redis.call("del", KEYS[1]) return value',
        1,
        'auth:oauth-state:state-1',
      ),
    ).resolves.toBe('{"returnTo":"/admin"}');
    await expect(redis.get('auth:oauth-state:state-1')).resolves.toBeNull();
  });

  it('returns null for missing state pop and rejects unsupported script shapes', async () => {
    const redis = createInMemoryRedis();

    await expect(
      redis.eval(
        'local value = redis.call("get", KEYS[1]) redis.call("del", KEYS[1]) return value',
        1,
        'auth:oauth-state:missing',
      ),
    ).resolves.toBeNull();
    await expect(redis.eval('return redis.call("ttl", KEYS[1])', 1, 'auth:oauth-state:missing')).rejects.toThrow(
      'Unsupported in-memory Redis eval script.',
    );
  });

  it('supports the refresh lock release script shape', async () => {
    const redis = createInMemoryRedis();
    await redis.set('auth:session-refresh-lock:session-1', 'owner-1');

    await expect(
      redis.eval(
        'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) end return 0',
        1,
        'auth:session-refresh-lock:session-1',
        'other-owner',
      ),
    ).resolves.toBe(0);
    await expect(redis.exists('auth:session-refresh-lock:session-1')).resolves.toBe(1);

    await expect(
      redis.eval(
        'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) end return 0',
        1,
        'auth:session-refresh-lock:session-1',
        'owner-1',
      ),
    ).resolves.toBe(1);
    await expect(redis.exists('auth:session-refresh-lock:session-1')).resolves.toBe(0);
  });

  it('supports the rate-limit service script shape', async () => {
    const redis = createInMemoryRedis();
    const now = jest.spyOn(Date, 'now').mockReturnValue(10_000);
    const service = new RateLimitService(
      redis as unknown as Redis,
      { get: jest.fn(() => 'production') } as never,
    );
    const policy = {
      name: 'test-policy',
      windowMs: 60_000,
      freeAttempts: 1,
      baseCooldownMs: 2_000,
      maxCooldownMs: 10_000,
    } satisfies RateLimitPolicy;
    const input = {
      policy,
      request: { headers: {}, ip: '127.0.0.1' } as never,
    };

    await expect(service.consume(input)).resolves.toMatchObject({
      allowed: true,
      attempts: 1,
      remaining: 0,
      cooldownSeconds: 0,
    });
    await expect(service.consume(input)).resolves.toMatchObject({
      allowed: true,
      attempts: 2,
      remaining: 0,
      cooldownSeconds: 2,
      wouldBlock: false,
    });
    await expect(service.consume(input)).resolves.toMatchObject({
      allowed: false,
      attempts: 2,
      retryAfterSeconds: 2,
      wouldBlock: true,
    });

    now.mockReturnValue(12_001);
    await expect(service.consume(input)).resolves.toMatchObject({
      allowed: true,
      attempts: 3,
      cooldownSeconds: 4,
    });
  });

  it('clears in-memory keys on disconnect and module destroy', async () => {
    const redis = createInMemoryRedis();

    await redis.set('auth:session:1', 'session');
    redis.disconnect();
    await expect(redis.get('auth:session:1')).resolves.toBeNull();

    await redis.set('auth:session:2', 'session');
    redis.onModuleDestroy();
    await expect(redis.get('auth:session:2')).resolves.toBeNull();
  });

  it('uses the managed Redis client outside the in-memory test mode', () => {
    delete process.env.BACKEND_E2E_IN_MEMORY_INFRA;
    delete process.env.REDIS_URL;

    const factory = (redisProvider as FactoryProvider<Redis>).useFactory;
    const client = factory?.();

    expect(client).toBeInstanceOf(ManagedRedisClient);
    expect(mockRedisConstructor).toHaveBeenCalledWith({
      db: 0,
      host: 'localhost',
      maxRetriesPerRequest: null,
      password: undefined,
      port: 6379,
      tls: undefined,
      username: undefined,
    });

    (client as ManagedRedisClient).onModuleDestroy();
    expect(mockRedisDisconnect).toHaveBeenCalledTimes(1);
  });

  it('parses Redis connection URLs for managed infrastructure', () => {
    delete process.env.REDIS_URL;
    expect(getRedisConnectionOptions()).toEqual({
      db: 0,
      host: 'localhost',
      maxRetriesPerRequest: null,
      password: undefined,
      port: 6379,
      tls: undefined,
      username: undefined,
    });

    process.env.REDIS_URL = 'redis://cache.example.test:6380';
    expect(getRedisConnectionOptions()).toEqual({
      db: 0,
      host: 'cache.example.test',
      maxRetriesPerRequest: null,
      password: undefined,
      port: 6380,
      tls: undefined,
      username: undefined,
    });

    process.env.REDIS_URL = 'rediss://user:secret@cache.example.test/2';
    expect(getRedisConnectionOptions()).toEqual({
      db: 2,
      host: 'cache.example.test',
      maxRetriesPerRequest: null,
      password: 'secret',
      port: 6379,
      tls: {},
      username: 'user',
    });
  });

  function createInMemoryRedis(): RedisTestClient {
    process.env.BACKEND_E2E_IN_MEMORY_INFRA = 'true';
    const factory = (redisProvider as FactoryProvider<Redis>).useFactory;
    const client = factory?.();
    if (!client) {
      throw new Error('Expected Redis provider to expose a factory.');
    }
    return client as unknown as RedisTestClient;
  }
});
