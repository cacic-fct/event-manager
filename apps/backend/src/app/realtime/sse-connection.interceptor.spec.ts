import { HttpException, ServiceUnavailableException } from '@nestjs/common';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { EventEmitter } from 'node:events';
import { NEVER, of, throwError } from 'rxjs';
import { InMemoryRedisClient } from '../redis/in-memory-redis-client';
import { SseConnectionInterceptor } from './sse-connection.interceptor';

const LIMIT_NAMES = [
  'SSE_MAX_CONNECTIONS_PER_SUBJECT', 'SSE_MAX_PUBLIC_CONNECTIONS_PER_IP',
  'SSE_MAX_PUBLIC_CONNECTIONS', 'SSE_MAX_AUTHENTICATED_CONNECTIONS',
];

class TestResponse extends EventEmitter {
  destroyed = false;
  writableEnded = false;
  setHeader = jest.fn();
}

describe('SseConnectionInterceptor', () => {
  const originalLimits = LIMIT_NAMES.map((name) => process.env[name]);

  beforeEach(() => {
    jest.useFakeTimers();
    LIMIT_NAMES.forEach((name) => delete process.env[name]);
    jest.spyOn(Math, 'random').mockReturnValue(0);
  });

  afterEach(() => {
    LIMIT_NAMES.forEach((name, index) => {
      if (originalLimits[index] === undefined) delete process.env[name];
      else process.env[name] = originalLimits[index];
    });
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('allows many distinct authenticated accounts sharing an IP, with a separate public capacity pool', async () => {
    process.env.SSE_MAX_PUBLIC_CONNECTIONS = '1';
    const { interceptor } = setup();
    const publicStream = await open(interceptor);
    const streams = await Promise.all(Array.from({ length: 80 }, (_, index) => open(interceptor, `user-${index}`)));
    await expect(open(interceptor)).rejects.toBeInstanceOf(HttpException);
    publicStream.subscription.unsubscribe();
    streams.forEach(({ subscription }) => subscription.unsubscribe());
    expect(jest.getTimerCount()).toBe(0);
  });

  it('enforces subject limits atomically across instances and frees capacity on disconnect', async () => {
    process.env.SSE_MAX_CONNECTIONS_PER_SUBJECT = '2';
    const { interceptor, redis } = setup();
    const other = setup(redis).interceptor;
    const attempts = await Promise.allSettled([
      open(interceptor, 'same-user'), open(other, 'same-user'), open(other, 'same-user'),
    ]);
    const accepted = attempts.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);
    expect(accepted).toHaveLength(2);
    expect(attempts.filter((result) => result.status === 'rejected')).toHaveLength(1);
    accepted[0].response.emit('close');
    const replacement = await open(other, 'same-user');
    accepted.forEach(({ subscription }) => subscription.unsubscribe());
    replacement.subscription.unsubscribe();
  });

  it('bounds anonymous IPs and total capacity without reserving slots for rejected requests', async () => {
    process.env.SSE_MAX_PUBLIC_CONNECTIONS_PER_IP = '2';
    process.env.SSE_MAX_PUBLIC_CONNECTIONS = '3';
    const { interceptor } = setup();
    const first = await open(interceptor);
    const second = await open(interceptor);
    await expect(open(interceptor)).rejects.toBeInstanceOf(HttpException);
    const third = await open(interceptor, undefined, 'other-ip');
    await expect(open(interceptor, undefined, 'third-ip')).rejects.toBeInstanceOf(HttpException);
    first.subscription.unsubscribe();
    const replacement = await open(interceptor, undefined, 'third-ip');
    [second, third, replacement].forEach(({ subscription }) => subscription.unsubscribe());
  });

  it('keeps authenticated capacity tied to the subject when the network IP changes', async () => {
    process.env.SSE_MAX_CONNECTIONS_PER_SUBJECT = '2';
    const { interceptor } = setup();
    const original = await open(interceptor, 'mobile-user', 'wifi-ip');
    const reconnected = await open(interceptor, 'mobile-user', 'cellular-ip');

    await expect(open(interceptor, 'mobile-user', 'another-ip')).rejects.toBeInstanceOf(HttpException);
    original.response.emit('close');
    const replacement = await open(interceptor, 'mobile-user', 'cellular-ip');

    [original, reconnected, replacement].forEach(({ subscription }) => subscription.unsubscribe());
    expect(jest.getTimerCount()).toBe(0);
  });

  it('completes after the bounded lifetime and releases each lease exactly once', async () => {
    process.env.SSE_MAX_CONNECTIONS_PER_SUBJECT = '1';
    const { interceptor, redis } = setup();
    const evalSpy = jest.spyOn(redis, 'eval');
    const stream = await open(interceptor, 'user');
    await jest.advanceTimersByTimeAsync(15 * 60_000);
    expect(stream.subscription.closed).toBe(true);
    stream.response.emit('finish');
    stream.response.emit('close');
    expect(evalSpy.mock.calls.filter(([script]) => script.includes('-- sse-lease-release'))).toHaveLength(1);
    const replacement = await open(interceptor, 'user');
    replacement.subscription.unsubscribe();
  });

  it('reclaims abandoned leases after expiry even if a worker never subscribes or releases', async () => {
    process.env.SSE_MAX_CONNECTIONS_PER_SUBJECT = '1';
    const { interceptor } = setup();
    await interceptor.intercept(context('user').execution, { handle: () => NEVER });
    await expect(open(interceptor, 'user')).rejects.toBeInstanceOf(HttpException);
    await jest.advanceTimersByTimeAsync(21 * 60_000);
    const replacement = await open(interceptor, 'user');
    replacement.subscription.unsubscribe();
  });

  it('releases on handler errors, completion, and disconnect during acquisition', async () => {
    const { interceptor, redis } = setup();
    const evalSpy = jest.spyOn(redis, 'eval');
    const first = context('user');
    const failed = await interceptor.intercept(first.execution, { handle: () => throwError(() => new Error('denied')) });
    failed.subscribe({ error: () => undefined });
    const completed = await interceptor.intercept(context('user').execution, { handle: () => of('done') });
    completed.subscribe();
    const disconnected = context('user');
    disconnected.response.destroyed = true;
    const handler = { handle: jest.fn(() => NEVER) };
    const result = await interceptor.intercept(disconnected.execution, handler);
    result.subscribe();
    expect(handler.handle).not.toHaveBeenCalled();
    expect(evalSpy.mock.calls.filter(([script]) => script.includes('-- sse-lease-release'))).toHaveLength(3);
  });

  it('fails closed on Redis errors before invoking the handler and bypasses non-SSE requests', async () => {
    const { interceptor, redis, reflector } = setup();
    jest.spyOn(redis, 'eval').mockRejectedValue(new Error('unavailable'));
    const handler: CallHandler = { handle: jest.fn(() => NEVER) };
    await expect(interceptor.intercept(context('user').execution, handler)).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(handler.handle).not.toHaveBeenCalled();
    reflector.get.mockReturnValue(false);
    await expect(interceptor.intercept(context('user').execution, handler)).resolves.toBe(NEVER);
  });
});

function setup(redis = new InMemoryRedisClient()) {
  const reflector = { get: jest.fn(() => true) };
  return {
    interceptor: new SseConnectionInterceptor(reflector as unknown as Reflector, redis as never),
    redis,
    reflector,
  };
}

function context(subject?: string, ip = 'shared-ip') {
  const response = new TestResponse();
  const execution = {
    getType: () => 'http',
    getHandler: () => () => undefined,
    switchToHttp: () => ({
      getRequest: () => ({ ip, socket: { remoteAddress: ip }, user: subject ? { sub: subject } : undefined }),
      getResponse: () => response,
    }),
  } as unknown as ExecutionContext;
  return { execution, response };
}

async function open(interceptor: SseConnectionInterceptor, subject?: string, ip?: string) {
  const { execution, response } = context(subject, ip);
  const stream = await interceptor.intercept(execution, { handle: () => NEVER });
  return { subscription: stream.subscribe(), response };
}
