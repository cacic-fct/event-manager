import {
  CallHandler,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NestInterceptor,
  ServiceUnavailableException,
} from '@nestjs/common';
import { SSE_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { createHash, randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import Redis from 'ioredis';
import { finalize, fromEvent, merge, Observable, takeUntil, timer } from 'rxjs';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';

const MIN_STREAM_LIFETIME_MS = 15 * 60_000;
const STREAM_LIFETIME_JITTER_MS = 5 * 60_000;
const LEASE_TTL_MS = MIN_STREAM_LIFETIME_MS + STREAM_LIFETIME_JITTER_MS + 60_000;

const ACQUIRE_SCRIPT = `
-- sse-lease-acquire
local time = redis.call('TIME')
local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
for i = 1, #KEYS do
  redis.call('ZREMRANGEBYSCORE', KEYS[i], '-inf', now)
end
for i = 1, #KEYS do
  if redis.call('ZCARD', KEYS[i]) >= tonumber(ARGV[i + 2]) then
    return 0
  end
end
for i = 1, #KEYS do
  redis.call('ZADD', KEYS[i], now + tonumber(ARGV[2]), ARGV[1])
  redis.call('PEXPIRE', KEYS[i], tonumber(ARGV[2]))
end
return 1
`;
const RELEASE_SCRIPT = `
-- sse-lease-release
for i = 1, #KEYS do
  redis.call('ZREM', KEYS[i], ARGV[1])
end
return 1
`;

/** Bounds every @Sse route across replicas, without treating authenticated users sharing an IP as one person. */
@Injectable()
export class SseConnectionInterceptor implements NestInterceptor {
  private readonly logger = new Logger(SseConnectionInterceptor.name);
  private readonly subjectLimit = this.limit('SSE_MAX_CONNECTIONS_PER_SUBJECT', 40);
  private readonly publicIpLimit = this.limit('SSE_MAX_PUBLIC_CONNECTIONS_PER_IP', 512);
  private readonly publicLimit = this.limit('SSE_MAX_PUBLIC_CONNECTIONS', 2048);
  private readonly authenticatedLimit = this.limit('SSE_MAX_AUTHENTICATED_CONNECTIONS', 4096);

  constructor(
    private readonly reflector: Reflector,
    private readonly redis: Redis,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    if (context.getType() !== 'http' || !this.reflector.get<boolean>(SSE_METADATA, context.getHandler())) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const response = context.switchToHttp().getResponse<Response>();
    const subject = request.user?.sub;
    const pool = subject ? 'authenticated' : 'public';
    // Only use Express's trusted-proxy interpretation; never trust forwarding headers directly.
    const identity = subject ?? request.ip ?? request.socket.remoteAddress ?? 'unknown';
    const digest = createHash('sha256').update(identity).digest('hex');
    const keys = [`sse:{leases}:v1:${pool}`, `sse:{leases}:v1:${pool}:${digest}`];
    const token = randomUUID();
    let acquired: unknown;
    try {
      acquired = await this.redis.eval(
        ACQUIRE_SCRIPT,
        keys.length,
        ...keys,
        token,
        LEASE_TTL_MS,
        subject ? this.authenticatedLimit : this.publicLimit,
        subject ? this.subjectLimit : this.publicIpLimit,
      );
    } catch {
      throw new ServiceUnavailableException('Serviço de atualização em tempo real temporariamente indisponível.');
    }
    if (acquired !== 1) {
      response.setHeader('Retry-After', '30');
      throw new HttpException(
        'Limite de conexões em tempo real atingido. Tente novamente em instantes.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    let released = false;
    const release = () => {
      if (released) {
        return;
      }
      released = true;
      response.removeListener('close', release);
      response.removeListener('finish', release);
      void this.redis.eval(RELEASE_SCRIPT, keys.length, ...keys, token).catch(() => {
        this.logger.warn('SSE lease release failed; the bounded lease will expire automatically.');
      });
    };
    response.once('close', release);
    response.once('finish', release);
    if (response.destroyed || response.writableEnded) {
      release();
      return new Observable((subscriber) => subscriber.complete());
    }
    // Jitter spreads normal EventSource reconnections; the lease outlives the maximum stream lifetime.
    const lifetimeMs = MIN_STREAM_LIFETIME_MS + Math.floor(Math.random() * STREAM_LIFETIME_JITTER_MS);
    try {
      return next.handle().pipe(
        takeUntil(merge(timer(lifetimeMs), fromEvent(response, 'close'))),
        finalize(release),
      );
    } catch (error: unknown) {
      release();
      throw error;
    }
  }

  private limit(name: string, fallback: number): number {
    const raw = process.env[name];
    if (raw === undefined) {
      return fallback;
    }
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new Error(`${name} must be a positive integer.`);
    }
    return value;
  }
}
