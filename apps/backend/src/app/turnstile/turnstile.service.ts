import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { Request } from 'express';
import { TURNSTILE_TEST_SECRET_KEY_ALWAYS_PASS, type TurnstileAction } from '@cacic-fct/shared-utils';

const TURNSTILE_SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const MAX_TURNSTILE_TOKEN_LENGTH = 2048;

interface TurnstileSiteverifyResponse {
  success: boolean;
  challenge_ts?: string;
  hostname?: string;
  action?: string;
  cdata?: string;
  'error-codes'?: string[];
}

@Injectable()
export class TurnstileService {
  constructor(private readonly config: ConfigService) {}

  async assertValidToken(
    token: string | null | undefined,
    request: Request | undefined,
    expectedAction: TurnstileAction,
  ): Promise<void> {
    if (this.isDisabled()) {
      return;
    }

    const normalizedToken = token?.trim();
    if (!normalizedToken) {
      throw new BadRequestException('Turnstile verification is required.');
    }

    if (normalizedToken.length > MAX_TURNSTILE_TOKEN_LENGTH) {
      throw new BadRequestException('Turnstile verification token is invalid.');
    }

    const secretKey = this.resolveSecretKey();
    if (!secretKey) {
      throw new ServiceUnavailableException('Turnstile verification is not configured.');
    }

    const result = await this.verifyToken(secretKey, normalizedToken, request);
    if (!result.success) {
      throw new BadRequestException('Turnstile verification failed.');
    }

    if (result.action !== expectedAction) {
      throw new BadRequestException('Turnstile verification action is invalid.');
    }

    const expectedHostnames = this.expectedHostnames();
    if (expectedHostnames.size > 0 && (!result.hostname || !expectedHostnames.has(result.hostname))) {
      throw new BadRequestException('Turnstile verification hostname is invalid.');
    }
  }

  private async verifyToken(
    secretKey: string,
    token: string,
    request: Request | undefined,
  ): Promise<TurnstileSiteverifyResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs());

    try {
      const payload: Record<string, string> = {
        secret: secretKey,
        response: token,
        idempotency_key: randomUUID(),
      };
      const remoteIp = this.remoteIp(request);
      if (remoteIp) {
        payload.remoteip = remoteIp;
      }

      const response = await fetch(this.siteverifyUrl(), {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new ServiceUnavailableException('Turnstile verification failed upstream.');
      }

      const body: unknown = await response.json();
      if (!this.isSiteverifyResponse(body)) {
        throw new ServiceUnavailableException('Turnstile verification returned an invalid response.');
      }

      return body;
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof ServiceUnavailableException) {
        throw error;
      }

      throw new ServiceUnavailableException('Turnstile verification is temporarily unavailable.');
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private resolveSecretKey(): string | null {
    const configured = this.config.get<string>('TURNSTILE_SECRET_KEY')?.trim();
    if (configured) {
      return configured;
    }

    return this.isProduction() ? null : TURNSTILE_TEST_SECRET_KEY_ALWAYS_PASS;
  }

  private siteverifyUrl(): string {
    return this.config.get<string>('TURNSTILE_SITEVERIFY_URL')?.trim() || TURNSTILE_SITEVERIFY_URL;
  }

  private timeoutMs(): number {
    const rawValue = Number(this.config.get<string>('TURNSTILE_SITEVERIFY_TIMEOUT_MS'));
    if (!Number.isFinite(rawValue) || rawValue <= 0) {
      return 3000;
    }

    return Math.min(rawValue, 10_000);
  }

  private expectedHostnames(): Set<string> {
    return new Set(
      (this.config.get<string>('TURNSTILE_EXPECTED_HOSTNAMES') ?? '')
        .split(',')
        .map((hostname) => hostname.trim())
        .filter(Boolean),
    );
  }

  private isDisabled(): boolean {
    if (this.isProduction()) {
      return false;
    }

    return this.config.get<string>('TURNSTILE_ENABLED')?.trim().toLowerCase() !== 'true';
  }

  private isProduction(): boolean {
    return this.config.get<string>('NODE_ENV') === 'production' || process.env.NODE_ENV === 'production';
  }

  private remoteIp(request: Request | undefined): string | undefined {
    if (!request) {
      return undefined;
    }

    const cloudflareIp = this.singleHeaderValue(request.headers['cf-connecting-ip']);
    if (cloudflareIp) {
      return cloudflareIp;
    }

    const forwardedIp = this.singleHeaderValue(request.headers['x-forwarded-for'])?.split(',')[0]?.trim();
    if (forwardedIp) {
      return forwardedIp;
    }

    return request.ip || request.socket.remoteAddress || undefined;
  }

  private singleHeaderValue(value: string | string[] | undefined): string | undefined {
    if (Array.isArray(value)) {
      return value[0]?.trim() || undefined;
    }

    return value?.trim() || undefined;
  }

  private isSiteverifyResponse(value: unknown): value is TurnstileSiteverifyResponse {
    return (
      typeof value === 'object' &&
      value !== null &&
      'success' in value &&
      typeof value.success === 'boolean' &&
      (!('action' in value) || typeof value.action === 'string') &&
      (!('hostname' in value) || typeof value.hostname === 'string')
    );
  }
}
