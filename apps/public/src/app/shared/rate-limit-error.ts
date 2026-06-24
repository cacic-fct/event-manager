import { DestroyRef, Signal, computed, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';

type GraphqlErrorLike = {
  message: string;
  extensions?: unknown;
};

type RateLimitBody = {
  retryAfterSeconds?: unknown;
  rateLimit?: {
    retryAfterSeconds?: unknown;
  };
};

export class RateLimitError extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super(`Muitas tentativas. Aguarde ${formatCooldownDuration(retryAfterSeconds)} para tentar novamente.`);
  }
}

export function graphqlError(errors: readonly GraphqlErrorLike[]): Error {
  const rateLimit = errors.map(rateLimitFromGraphqlError).find((error): error is RateLimitError => Boolean(error));
  if (rateLimit) {
    return rateLimit;
  }

  return new Error(errors.map((error) => error.message).join('\n'));
}

export function rateLimitFromHttpError(error: unknown): RateLimitError | null {
  if (!(error instanceof HttpErrorResponse) || error.status !== 429) {
    return null;
  }

  const retryAfter = numberFromUnknown(error.headers.get('Retry-After')) ?? retryAfterFromBody(error.error) ?? 60;
  return new RateLimitError(retryAfter);
}

export function createRateLimitCooldown(destroyRef: DestroyRef): {
  readonly seconds: Signal<number>;
  start(seconds: number): void;
  clear(): void;
} {
  const deadline = signal(0);
  const now = signal(Date.now());
  let intervalId: ReturnType<typeof setInterval> | null = null;

  const seconds = computed(() => Math.max(0, Math.ceil((deadline() - now()) / 1000)));

  const clear = () => {
    deadline.set(0);
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  };

  const tick = () => {
    now.set(Date.now());
    if (seconds() <= 0) {
      clear();
    }
  };

  const start = (durationSeconds: number) => {
    deadline.set(Date.now() + Math.max(1, Math.ceil(durationSeconds)) * 1000);
    tick();
    if (!intervalId) {
      intervalId = setInterval(tick, 1000);
    }
  };

  destroyRef.onDestroy(clear);

  return {
    seconds,
    start,
    clear,
  };
}

export function formatCooldownDuration(seconds: number): string {
  const normalized = Math.max(1, Math.ceil(seconds));
  if (normalized === 1) {
    return '1 segundo';
  }

  return `${normalized} segundos`;
}

function rateLimitFromGraphqlError(error: GraphqlErrorLike): RateLimitError | null {
  const extensions = recordFromUnknown(error.extensions);
  if (!extensions) {
    return null;
  }

  const code = typeof extensions['code'] === 'string' ? extensions['code'] : '';
  if (code !== 'RATE_LIMITED') {
    return null;
  }

  return new RateLimitError(retryAfterFromBody(extensions) ?? 60);
}

function retryAfterFromBody(value: unknown): number | null {
  const body = recordFromUnknown(value) as RateLimitBody | null;
  if (!body) {
    return null;
  }

  return numberFromUnknown(body.retryAfterSeconds) ?? numberFromUnknown(body.rateLimit?.retryAfterSeconds);
}

function recordFromUnknown(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function numberFromUnknown(value: unknown): number | null {
  const numberValue = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  if (!Number.isFinite(numberValue) || numberValue <= 0) {
    return null;
  }

  return Math.ceil(numberValue);
}
