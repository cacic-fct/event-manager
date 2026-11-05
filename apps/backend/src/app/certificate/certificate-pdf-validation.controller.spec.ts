import { BadRequestException, type INestApplication } from '@nestjs/common';
import { jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { setImmediate } from 'node:timers/promises';
import { PUBLIC_CERTIFICATE_PDF_MAX_BYTES } from '@cacic-fct/event-manager-public-contracts';
import { RateLimitGuard } from '../rate-limit/rate-limit.guard';
import { TurnstileService } from '../turnstile/turnstile.service';
import { PublicCertificateVerificationService } from './public-certificate-verification.service';

const extractId = jest.fn<(pdf: Buffer) => Promise<string | null>>();
jest.unstable_mockModule('./extract-certificate-pdf-id', () => ({ extractCertificatePdfId: extractId }));
const { CertificatePdfValidationController } = await import('./certificate-pdf-validation.controller');

describe('certificate PDF verification over HTTP', () => {
  const id = '019cb4fe-76e3-7000-8000-8a75e6b8f1cb';
  const pdf = Buffer.from('%PDF-1.7\n');
  const result = { certificate: null, revokedAt: null, previewToken: null };
  const turnstile = { assertValidToken: jest.fn<() => Promise<void>>() };
  const verification = { verify: jest.fn<() => Promise<typeof result>>() };
  let app: INestApplication;
  let url: string;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [CertificatePdfValidationController],
      providers: [
        { provide: TurnstileService, useValue: turnstile },
        { provide: PublicCertificateVerificationService, useValue: verification },
      ],
    })
      .overrideGuard(RateLimitGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = module.createNestApplication();
    await app.listen(0, '127.0.0.1');
    url = `${await app.getUrl()}/certificates/validate/pdf`;
  });

  afterAll(async () => app.close());

  beforeEach(() => {
    turnstile.assertValidToken.mockReset().mockResolvedValue(undefined);
    verification.verify.mockReset().mockResolvedValue(result);
    extractId.mockReset().mockResolvedValue(id);
  });

  function upload(body: BodyInit = pdf, headers?: Record<string, string>) {
    return fetch(url, {
      method: 'POST',
      body,
      headers: { 'Content-Type': 'application/pdf', 'X-Turnstile-Token': 'token', ...headers },
    });
  }

  it('verifies the extracted ID after checking Turnstile', async () => {
    const response = await upload();
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toContain('no-store');
    expect(await response.json()).toEqual({ certificateId: id, ...result });
    expect(turnstile.assertValidToken).toHaveBeenCalledWith('token', expect.anything(), 'certificate_validation');
    expect(extractId).toHaveBeenCalledWith(pdf);
    expect(verification.verify).toHaveBeenCalledWith(id);
  });

  it('rejects invalid tokens and files without calling the parser', async () => {
    turnstile.assertValidToken.mockRejectedValueOnce(new BadRequestException('Invalid token'));
    expect((await upload()).status).toBe(400);
    expect((await upload('not a PDF')).status).toBe(400);
    expect(extractId).not.toHaveBeenCalled();
  });

  it('rejects a PDF without a unique code before looking up a certificate', async () => {
    extractId.mockResolvedValueOnce(null);
    expect((await upload()).status).toBe(422);
    expect(verification.verify).not.toHaveBeenCalled();
  });

  it('rejects multipart, compressed transport, and oversized bodies before Turnstile', async () => {
    const form = new FormData();
    form.append('file', new Blob([pdf], { type: 'application/pdf' }), 'first.pdf');
    form.append('file', new Blob([pdf], { type: 'application/pdf' }), 'second.pdf');
    expect((await fetch(url, { method: 'POST', body: form })).status).toBe(415);
    expect((await upload(pdf, { 'Content-Encoding': 'gzip' })).status).toBe(415);
    expect((await upload(Buffer.alloc(PUBLIC_CERTIFICATE_PDF_MAX_BYTES + 1))).status).toBe(413);
    expect(turnstile.assertValidToken).not.toHaveBeenCalled();
    expect(extractId).not.toHaveBeenCalled();
  });

  it('enforces the same byte limit for a chunked body without a length header', async () => {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/pdf', 'X-Turnstile-Token': 'token' },
      duplex: 'half',
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(Buffer.alloc(PUBLIC_CERTIFICATE_PDF_MAX_BYTES + 1));
          controller.close();
        },
      }),
    } as RequestInit & { duplex: 'half' });
    expect(response.status).toBe(413);
    expect(extractId).not.toHaveBeenCalled();
  });

  it('bounds concurrent work and recovers the slots after parser errors', async () => {
    let fail!: (error: Error) => void;
    const pending = new Promise<string | null>((_resolve, reject) => {
      fail = reject;
    });
    extractId.mockReturnValueOnce(pending).mockReturnValueOnce(pending);
    const admitted = [upload(), upload()];
    try {
      for (let attempt = 0; attempt < 200 && extractId.mock.calls.length < 2; attempt++) {
        await setImmediate();
      }
      expect(extractId).toHaveBeenCalledTimes(2);
      expect((await upload()).status).toBe(503);
      expect(turnstile.assertValidToken).toHaveBeenCalledTimes(2);
    } finally {
      fail(new Error('Parser limit exceeded'));
    }
    expect((await Promise.all(admitted)).map((response) => response.status)).toEqual([400, 400]);
    expect((await upload()).status).toBe(200);
  });
});
