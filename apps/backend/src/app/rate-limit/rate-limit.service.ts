import { HttpException, HttpStatus, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GraphQLError } from 'graphql';
import Redis from 'ioredis';
import { createHash } from 'node:crypto';
import { Request, Response } from 'express';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { RateLimitPolicy } from './rate-limit.policies';

type RequestWithUser = Request & {
  user?: AuthenticatedUser;
};

export interface RateLimitConsumeInput {
  readonly policy: RateLimitPolicy;
  readonly request?: RequestWithUser;
  readonly response?: Response;
  readonly resourceParts?: readonly string[];
  readonly authenticatedUser?: AuthenticatedUser;
}

export interface RateLimitDecision {
  readonly allowed: boolean;
  readonly disabled: boolean;
  readonly wouldBlock: boolean;
  readonly policyName: string;
  readonly limit: number;
  readonly attempts: number;
  readonly remaining: number;
  readonly retryAfterSeconds: number;
  readonly resetSeconds: number;
  readonly cooldownSeconds: number;
}

const RATE_LIMIT_SCRIPT = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local windowMs = tonumber(ARGV[2])
local freeAttempts = tonumber(ARGV[3])
local maxAttempts = tonumber(ARGV[4])
local baseCooldownMs = tonumber(ARGV[5])
local maxCooldownMs = tonumber(ARGV[6])

local state = redis.call('HMGET', key, 'attempts', 'windowResetMs', 'blockedUntilMs')
local attempts = tonumber(state[1]) or 0
local windowResetMs = tonumber(state[2]) or 0
local blockedUntilMs = tonumber(state[3]) or 0

if windowResetMs <= now then
  attempts = 0
  windowResetMs = now + windowMs
  blockedUntilMs = 0
end

local function remaining_attempts(currentAttempts)
  if maxAttempts > 0 then
    local remaining = maxAttempts - currentAttempts
    if remaining < 0 then
      return 0
    end
    return remaining
  end

  local remaining = freeAttempts - currentAttempts
  if remaining < 0 then
    return 0
  end
  return remaining
end

local resetSeconds = math.ceil((windowResetMs - now) / 1000)
if resetSeconds < 0 then
  resetSeconds = 0
end

if blockedUntilMs > now then
  local retryAfterSeconds = math.ceil((blockedUntilMs - now) / 1000)
  return {0, attempts, remaining_attempts(attempts), retryAfterSeconds, resetSeconds, retryAfterSeconds}
end

if maxAttempts > 0 and attempts >= maxAttempts then
  return {0, attempts, 0, resetSeconds, resetSeconds, 0}
end

attempts = attempts + 1

local cooldownMs = 0
if attempts > freeAttempts then
  cooldownMs = baseCooldownMs
  local exponent = attempts - freeAttempts - 1
  for _ = 1, exponent do
    cooldownMs = cooldownMs * 2
    if cooldownMs >= maxCooldownMs then
      cooldownMs = maxCooldownMs
      break
    end
  end
  if cooldownMs > maxCooldownMs then
    cooldownMs = maxCooldownMs
  end
  blockedUntilMs = now + cooldownMs
else
  blockedUntilMs = 0
end

redis.call('HSET', key, 'attempts', attempts, 'windowResetMs', windowResetMs, 'blockedUntilMs', blockedUntilMs)
redis.call('PEXPIRE', key, math.max(1, windowResetMs - now))

return {1, attempts, remaining_attempts(attempts), 0, resetSeconds, math.ceil(cooldownMs / 1000)}
`;

@Injectable()
export class RateLimitService {
  private readonly logger = new Logger(RateLimitService.name);

  constructor(
    private readonly redis: Redis,
    private readonly config: ConfigService,
  ) {}

  async consume(input: RateLimitConsumeInput): Promise<RateLimitDecision> {
    const disabled = this.isDisabled();

    try {
      const rawResult = await this.consumeRedis(input);
      const wouldBlock = !rawResult.allowed;
      if (disabled && wouldBlock) {
        this.logger.warn(
          `Rate limit ${input.policy.name} would have blocked this request for ${rawResult.retryAfterSeconds}s, but rate limiting is disabled outside production.`,
        );
      }

      const decision = {
        ...rawResult,
        allowed: disabled || rawResult.allowed,
        disabled,
        wouldBlock,
      };
      this.setHeaders(input.response, decision);
      return decision;
    } catch (error) {
      if (disabled) {
        this.logger.warn(
          `Rate limit ${input.policy.name} could not be evaluated in development: ${this.formatError(error)}`,
        );
        const decision = this.allowWithoutState(input.policy, true);
        this.setHeaders(input.response, decision);
        return decision;
      }

      throw new ServiceUnavailableException('Rate limiting is temporarily unavailable.');
    }
  }

  async assertAllowed(input: RateLimitConsumeInput): Promise<void> {
    const decision = await this.consume(input);
    if (!decision.allowed) {
      throw this.toHttpException(decision);
    }
  }

  toGraphQLError(decision: RateLimitDecision): GraphQLError {
    return new GraphQLError(this.message(decision), {
      extensions: {
        code: 'RATE_LIMITED',
        http: {
          status: HttpStatus.TOO_MANY_REQUESTS,
        },
        retryAfterSeconds: decision.retryAfterSeconds,
        rateLimit: this.extensionPayload(decision),
      },
    });
  }

  toHttpException(decision: RateLimitDecision): HttpException {
    return new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message: this.message(decision),
        retryAfterSeconds: decision.retryAfterSeconds,
        rateLimit: this.extensionPayload(decision),
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  private async consumeRedis(input: RateLimitConsumeInput): Promise<Omit<RateLimitDecision, 'disabled' | 'wouldBlock'>> {
    const now = Date.now();
    const policy = input.policy;
    const key = this.key(input);
    const result = await this.redis.eval(
      RATE_LIMIT_SCRIPT,
      1,
      key,
      now.toString(),
      policy.windowMs.toString(),
      policy.freeAttempts.toString(),
      (policy.maxAttempts ?? 0).toString(),
      policy.baseCooldownMs.toString(),
      policy.maxCooldownMs.toString(),
    );

    if (!Array.isArray(result) || result.length < 6) {
      throw new Error('Unexpected Redis rate-limit response.');
    }

    const allowed = this.numberAt(result, 0) === 1;
    return {
      allowed,
      policyName: policy.name,
      limit: policy.maxAttempts ?? policy.freeAttempts,
      attempts: this.numberAt(result, 1),
      remaining: this.numberAt(result, 2),
      retryAfterSeconds: this.numberAt(result, 3),
      resetSeconds: this.numberAt(result, 4),
      cooldownSeconds: this.numberAt(result, 5),
    };
  }

  private key(input: RateLimitConsumeInput): string {
    const identity = this.identity(input.request, input.authenticatedUser);
    const resource = (input.resourceParts ?? [])
      .map((part) => part.trim())
      .filter(Boolean)
      .join('|');
    const material = `${input.policy.name}|${identity}|${resource}`;
    const hash = createHash('sha256').update(material).digest('hex');
    return `cacic:rate-limit:${input.policy.name}:${hash}`;
  }

  private identity(request: RequestWithUser | undefined, authenticatedUser: AuthenticatedUser | undefined): string {
    const user = authenticatedUser ?? request?.user;
    if (user?.sub) {
      return `user:${user.sub}`;
    }

    if (user?.email) {
      return `email:${user.email}`;
    }

    const ip = this.clientIp(request) ?? 'unknown';
    return `ip:${ip}`;
  }

  private clientIp(request: RequestWithUser | undefined): string | null {
    if (!request) {
      return null;
    }

    return (
      this.singleHeaderValue(request.headers['cf-connecting-ipv6']) ??
      this.singleHeaderValue(request.headers['cf-connecting-ip']) ??
      this.singleHeaderValue(request.headers['cf-pseudo-ipv4']) ??
      this.singleHeaderValue(request.headers['x-forwarded-for'])?.split(',')[0]?.trim() ??
      this.singleHeaderValue(request.headers['x-real-ip']) ??
      request.ip ??
      request.socket?.remoteAddress ??
      null
    );
  }

  private singleHeaderValue(value: string | string[] | undefined): string | undefined {
    if (Array.isArray(value)) {
      return value[0]?.trim() || undefined;
    }

    return value?.trim() || undefined;
  }

  private setHeaders(response: Response | undefined, decision: RateLimitDecision): void {
    if (!response) {
      return;
    }

    response.setHeader('RateLimit-Limit', decision.limit.toString());
    response.setHeader('RateLimit-Remaining', decision.remaining.toString());
    response.setHeader('RateLimit-Reset', decision.resetSeconds.toString());
    response.setHeader('X-RateLimit-Limit', decision.limit.toString());
    response.setHeader('X-RateLimit-Remaining', decision.remaining.toString());
    response.setHeader('X-RateLimit-Reset', decision.resetSeconds.toString());
    response.setHeader('X-RateLimit-Policy', decision.policyName);
    response.setHeader('X-RateLimit-Cooldown-Seconds', decision.cooldownSeconds.toString());

    if (decision.disabled) {
      response.setHeader('X-RateLimit-Disabled', 'true');
    }

    if (decision.wouldBlock) {
      response.setHeader('X-RateLimit-Would-Block', 'true');
    }

    if (!decision.allowed) {
      response.setHeader('Retry-After', decision.retryAfterSeconds.toString());
    }
  }

  private allowWithoutState(policy: RateLimitPolicy, disabled: boolean): RateLimitDecision {
    return {
      allowed: true,
      disabled,
      wouldBlock: false,
      policyName: policy.name,
      limit: policy.maxAttempts ?? policy.freeAttempts,
      attempts: 0,
      remaining: policy.maxAttempts ?? policy.freeAttempts,
      retryAfterSeconds: 0,
      resetSeconds: Math.ceil(policy.windowMs / 1000),
      cooldownSeconds: 0,
    };
  }

  private extensionPayload(decision: RateLimitDecision) {
    return {
      policy: decision.policyName,
      limit: decision.limit,
      remaining: decision.remaining,
      retryAfterSeconds: decision.retryAfterSeconds,
      resetSeconds: decision.resetSeconds,
    };
  }

  private message(decision: RateLimitDecision): string {
    return `Rate limit exceeded. Retry after ${decision.retryAfterSeconds} seconds.`;
  }

  private isDisabled(): boolean {
    return this.config.get<string>('NODE_ENV') !== 'production' && process.env.NODE_ENV !== 'production';
  }

  private numberAt(values: unknown[], index: number): number {
    const value = Number(values[index]);
    if (!Number.isFinite(value)) {
      return 0;
    }

    return Math.max(0, Math.floor(value));
  }

  private formatError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
