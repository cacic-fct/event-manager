import { BadGatewayException, Injectable, Logger, RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { SENTRY_TUNNEL_TARGETS, type SentryTunnelProject } from './analytics.config';

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  async forwardEnvelope(project: SentryTunnelProject | string, req: RawBodyRequest<Request>): Promise<void> {
    const body = req.rawBody;

    if (!body || body.length === 0) {
      return;
    }

    const target = SENTRY_TUNNEL_TARGETS[project as SentryTunnelProject];

    if (!target) {
      return;
    }

    const contentTypeHeader = req.headers['content-type'];

    const contentType = Array.isArray(contentTypeHeader) ? contentTypeHeader[0] : contentTypeHeader;

    const response = await fetch(target.envelopeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': contentType ?? 'application/x-sentry-envelope',
      },
      body: new Uint8Array(body),
    });

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
}
