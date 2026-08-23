import { BadGatewayException, BadRequestException, Injectable, Logger, RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { SENTRY_TUNNEL_TARGETS, type SentryTunnelProject } from './analytics.config';

export const SENTRY_TUNNEL_MAX_BODY_BYTES = 1_024 * 1_024;
const SENTRY_TUNNEL_FORWARD_TIMEOUT_MS = 5_000;

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  async forwardEnvelope(project: SentryTunnelProject | string, req: RawBodyRequest<Request>): Promise<void> {
    const body = req.rawBody ?? (Buffer.isBuffer(req.body) ? req.body : undefined);

    if (!body || body.length === 0) {
      throw new BadRequestException('Monitoring envelope is required.');
    }
    if (body.length > SENTRY_TUNNEL_MAX_BODY_BYTES) {
      throw new BadRequestException('Monitoring envelope is too large.');
    }

    const target = SENTRY_TUNNEL_TARGETS[project as SentryTunnelProject];

    if (!target) {
      throw new BadRequestException('Unknown monitoring project.');
    }

    this.assertEnvelopeShape(body);

    const contentTypeHeader = req.headers['content-type'];

    const contentType = Array.isArray(contentTypeHeader) ? contentTypeHeader[0] : contentTypeHeader;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SENTRY_TUNNEL_FORWARD_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(target.envelopeUrl, {
        method: 'POST',
        headers: {
          'Content-Type': contentType ?? 'application/x-sentry-envelope',
        },
        body: new Uint8Array(body),
        signal: controller.signal,
      });
    } catch (error: unknown) {
      throw new BadGatewayException(
        error instanceof Error && error.name === 'AbortError'
          ? 'Monitoring provider timed out.'
          : 'Failed to forward monitoring envelope',
      );
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const responseText = await response.text().catch(() => '');

      this.logger.warn(
        `Failed to forward Sentry envelope to GlitchTip. Status: ${
          response.status
        } ${response.statusText}. Body: ${responseText.slice(0, 500)}`,
      );

      throw new BadGatewayException('Failed to forward monitoring envelope');
    }
  }

  private assertEnvelopeShape(body: Buffer): void {
    const firstNewline = body.indexOf(0x0a);
    if (firstNewline <= 0 || firstNewline > 16_384) {
      throw new BadRequestException('Malformed monitoring envelope.');
    }

    const secondNewline = body.indexOf(0x0a, firstNewline + 1);
    if (secondNewline <= firstNewline + 1 || secondNewline > firstNewline + 16_384) {
      throw new BadRequestException('Malformed monitoring envelope.');
    }

    try {
      const envelopeHeader: unknown = JSON.parse(body.subarray(0, firstNewline).toString('utf8'));
      const itemHeader: unknown = JSON.parse(body.subarray(firstNewline + 1, secondNewline).toString('utf8'));
      if (!this.isRecord(envelopeHeader) || !this.isRecord(itemHeader)) {
        throw new Error('not an object');
      }
    } catch {
      throw new BadRequestException('Malformed monitoring envelope.');
    }
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
  }
}
