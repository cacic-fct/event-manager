import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import type { DestroyRef } from '@angular/core';
import {
  RateLimitError,
  createRateLimitCooldown,
  formatCooldownDuration,
  graphqlError,
  rateLimitFromHttpError,
} from './rate-limit-error';

describe('rate limit errors', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('formats cooldown durations for user-facing messages', () => {
    expect(formatCooldownDuration(0)).toBe('1 segundo');
    expect(formatCooldownDuration(1)).toBe('1 segundo');
    expect(formatCooldownDuration(1.1)).toBe('2 segundos');
    expect(formatCooldownDuration(30)).toBe('30 segundos');
  });

  it('maps GraphQL RATE_LIMITED errors to RateLimitError', () => {
    const error = graphqlError([
      {
        message: 'Too many attempts',
        extensions: {
          code: 'RATE_LIMITED',
          rateLimit: {
            retryAfterSeconds: '7.1',
          },
        },
      },
    ]);

    expect(error).toBeInstanceOf(RateLimitError);
    expect((error as RateLimitError).retryAfterSeconds).toBe(8);
    expect(error.message).toBe('Muitas tentativas. Aguarde 8 segundos para tentar novamente.');
  });

  it('keeps non-rate-limited GraphQL errors readable', () => {
    expect(
      graphqlError([
        { message: 'Primeiro erro' },
        { message: 'Segundo erro' },
      ]).message,
    ).toBe('Primeiro erro\nSegundo erro');
  });

  it('maps HTTP 429 retry headers and body fallbacks', () => {
    expect(
      rateLimitFromHttpError(
        new HttpErrorResponse({
          status: 429,
          headers: new HttpHeaders({ 'Retry-After': '4.2' }),
          error: {
            rateLimit: {
              retryAfterSeconds: 10,
            },
          },
        }),
      )?.retryAfterSeconds,
    ).toBe(5);

    expect(
      rateLimitFromHttpError(
        new HttpErrorResponse({
          status: 429,
          error: {
            rateLimit: {
              retryAfterSeconds: '12',
            },
          },
        }),
      )?.retryAfterSeconds,
    ).toBe(12);

    expect(rateLimitFromHttpError(new HttpErrorResponse({ status: 500 }))).toBeNull();
  });

  it('counts down and clears cooldowns on destroy', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-26T12:00:00.000Z'));
    const destroyCallbacks: Array<() => void> = [];
    const destroyRef = {
      onDestroy: (callback: () => void) => {
        destroyCallbacks.push(callback);
      },
    } as DestroyRef;

    const cooldown = createRateLimitCooldown(destroyRef);

    cooldown.start(2.1);

    expect(cooldown.seconds()).toBe(3);

    vi.advanceTimersByTime(1000);

    expect(cooldown.seconds()).toBe(2);

    destroyCallbacks.forEach((callback) => callback());

    expect(cooldown.seconds()).toBe(0);
  });
});
