import { BadGatewayException, Logger, RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { SENTRY_TUNNEL_TARGETS } from './analytics.config';
import { AnalyticsService } from './analytics.service';

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let fetchMock: jest.MockedFunction<typeof fetch>;
  const originalFetch = global.fetch;

  beforeEach(() => {
    service = new AnalyticsService();
    fetchMock = jest.fn().mockResolvedValue(createFetchResponse(202));
    global.fetch = fetchMock as never;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalFetch === undefined) {
      delete (global as { fetch?: typeof fetch }).fetch;
    } else {
      global.fetch = originalFetch;
    }
  });

  it('rejects empty, malformed, oversized, and unknown envelopes', async () => {
    await expect(service.forwardEnvelope('admin', createRequest())).rejects.toThrow('required');
    await expect(service.forwardEnvelope('admin', createRequest(Buffer.alloc(0)))).rejects.toThrow('required');
    await expect(service.forwardEnvelope('admin', createRequest(Buffer.from('envelope')))).rejects.toThrow('Malformed');
    await expect(
      service.forwardEnvelope('unknown-project', createRequest(validEnvelope())),
    ).rejects.toThrow('Unknown monitoring project');
    await expect(
      service.forwardEnvelope('admin', createRequest(Buffer.alloc(1_024 * 1_024 + 1))),
    ).rejects.toThrow('too large');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('forwards the raw envelope to the configured GlitchTip target', async () => {
    const envelope = validEnvelope();

    await service.forwardEnvelope('admin', createRequest(envelope, ['text/plain', 'application/json']));

    expect(fetchMock).toHaveBeenCalledWith(SENTRY_TUNNEL_TARGETS.admin.envelopeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
      },
      body: new Uint8Array(envelope),
      signal: expect.any(AbortSignal),
    });
  });

  it('accepts the Buffer body produced by the route-specific raw parser', async () => {
    const envelope = validEnvelope();

    await service.forwardEnvelope('public', { body: envelope, headers: {} } as unknown as RawBodyRequest<Request>);

    expect(fetchMock).toHaveBeenCalledWith(
      SENTRY_TUNNEL_TARGETS.public.envelopeUrl,
      expect.objectContaining({ body: new Uint8Array(envelope) }),
    );
  });

  it('uses the Sentry envelope content type when the request omits one', async () => {
    const envelope = validEnvelope();

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
    fetchMock.mockResolvedValue(
      createFetchResponse(503, 'Service Unavailable', 'upstream unavailable'),
    );

    await expect(service.forwardEnvelope('admin', createRequest(validEnvelope()))).rejects.toBeInstanceOf(
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

    await expect(service.forwardEnvelope('public', createRequest(validEnvelope()))).rejects.toBeInstanceOf(
      BadGatewayException,
    );
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Status: 502 Bad Gateway. Body: '));
  });

  it('maps an upstream abort to a bounded gateway failure', async () => {
    fetchMock.mockRejectedValueOnce(Object.assign(new Error('aborted'), { name: 'AbortError' }));

    await expect(service.forwardEnvelope('public', createRequest(validEnvelope()))).rejects.toThrow(
      'Monitoring provider timed out',
    );
  });

  function createRequest(rawBody?: Buffer, contentType?: string | string[]): RawBodyRequest<Request> {
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

  function createFetchResponse(status: number, statusText = '', body = ''): Response {
    return {
      ok: status >= 200 && status < 300,
      status,
      statusText,
      text: jest.fn().mockResolvedValue(body),
    } as unknown as Response;
  }

  function validEnvelope(): Buffer {
    return Buffer.from('{"event_id":"event-1"}\n{"type":"event"}\n{"message":"boom"}');
  }
});
