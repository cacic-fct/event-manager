import { BadGatewayException, Logger, RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { SENTRY_TUNNEL_TARGETS } from './analytics.config';
import { AnalyticsService } from './analytics.service';

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let fetchMock: jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    service = new AnalyticsService();
    fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(new Response(undefined, { status: 202 }));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('does not forward empty envelopes or unknown projects', async () => {
    await expect(service.forwardEnvelope('admin', createRequest())).resolves.toBeUndefined();
    await expect(service.forwardEnvelope('admin', createRequest(Buffer.alloc(0)))).resolves.toBeUndefined();
    await expect(service.forwardEnvelope('unknown-project', createRequest(Buffer.from('envelope')))).resolves.toBeUndefined();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('forwards the raw envelope to the configured GlitchTip target', async () => {
    const envelope = Buffer.from('{"event_id":"event-1"}\n{"type":"event"}\n{"message":"boom"}');

    await service.forwardEnvelope('admin', createRequest(envelope, ['text/plain', 'application/json']));

    expect(fetchMock).toHaveBeenCalledWith(SENTRY_TUNNEL_TARGETS.admin.envelopeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
      },
      body: new Uint8Array(envelope),
    });
  });

  it('uses the Sentry envelope content type when the request omits one', async () => {
    const envelope = Buffer.from('envelope');

    await service.forwardEnvelope('public', createRequest(envelope));

    expect(fetchMock).toHaveBeenCalledWith(
      SENTRY_TUNNEL_TARGETS.public.envelopeUrl,
      expect.objectContaining({
        headers: {
          'Content-Type': 'application/x-sentry-envelope',
        },
      }),
    );
  });

  it('logs and rejects when GlitchTip rejects the envelope', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    fetchMock.mockResolvedValue(new Response('upstream unavailable', { status: 503, statusText: 'Service Unavailable' }));

    await expect(service.forwardEnvelope('admin', createRequest(Buffer.from('envelope')))).rejects.toBeInstanceOf(
      BadGatewayException,
    );
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('Failed to forward Sentry envelope to GlitchTip. Status: 503 Service Unavailable.'),
    );
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Body: upstream unavailable'));
  });

  it('handles unreadable upstream error bodies while preserving the gateway failure', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    fetchMock.mockResolvedValue({
      ok: false,
      status: 502,
      statusText: 'Bad Gateway',
      text: jest.fn().mockRejectedValue(new Error('unreadable')),
    } as unknown as Response);

    await expect(service.forwardEnvelope('public', createRequest(Buffer.from('envelope')))).rejects.toBeInstanceOf(
      BadGatewayException,
    );
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Status: 502 Bad Gateway. Body: '));
  });

  function createRequest(
    rawBody?: Buffer,
    contentType?: string | string[],
  ): RawBodyRequest<Request> {
    return {
      rawBody,
      headers:
        contentType === undefined
          ? {}
          : {
              'content-type': contentType,
            },
    } as unknown as RawBodyRequest<Request>;
  }
});
