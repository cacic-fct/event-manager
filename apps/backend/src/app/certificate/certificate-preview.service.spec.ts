import { RESERVE_CERTIFICATE_PREVIEW } from './certificate-preview-admission';
import { CertificatePreviewService } from './certificate-preview.service';
import type { CertificatePreviewCache } from './certificate-preview-cache';
import type { PrismaService } from '../prisma/prisma.service';

const { jest } = import.meta;

describe('CertificatePreviewService', () => {
  function createService() {
    const prisma = { certificate: { findFirst: jest.fn() } };
    const cache = { enabled: true, read: jest.fn(), has: jest.fn() };
    return {
      prisma,
      cache,
      service: new CertificatePreviewService(
        prisma as unknown as PrismaService,
        cache as unknown as CertificatePreviewCache,
      ),
    };
  }

  beforeEach(() => {
    jest.replaceProperty(process, 'env', {
      ...process.env,
      CERTIFICATE_PREVIEW_ENABLED: 'true',
      CERTIFICATE_PREVIEW_SIGNING_KEY: 'test-preview-signing-key',
    });
  });

  afterEach(() => jest.restoreAllMocks());

  it('rejects tokens for another certificate and expired tokens before accessing Prisma or S3', async () => {
    const { service, prisma, cache } = createService();
    const now = Date.now();
    const clock = jest.spyOn(Date, 'now').mockReturnValue(now);
    const token = service.createToken({ id: 'certificate-1', issuedAt: new Date(now) }) ?? '';

    expect(token).not.toBe('');
    await expect(service.request('certificate-2', token)).resolves.toBeNull();
    clock.mockReturnValue(now + 11 * 60_000);
    await expect(service.read('certificate-1', token)).resolves.toBeNull();
    expect(prisma.certificate.findFirst).not.toHaveBeenCalled();
    expect(cache.read).not.toHaveBeenCalled();
  });

  function createQueuedService() {
    const fixture = createService();
    const issuedAt = new Date(Date.now() - 1000);
    fixture.prisma.certificate.findFirst.mockResolvedValue({
      issuedAt,
      updatedAt: issuedAt,
      config: { updatedAt: issuedAt },
      certificateTemplate: { id: 'template', updatedAt: issuedAt, contentChecksum: 'checksum' },
    });
    fixture.cache.has.mockResolvedValue(false);
    const redis = {
      defineCommand: jest.fn(),
      runCommand: jest
        .fn()
        .mockImplementation(async (name: string, args: string[]) =>
          name === 'reservePublicCertificatePreview' ? 1 : args[1] === 'acquire' ? 'OK' : 1,
        ),
      get: jest.fn().mockResolvedValue(null),
    };
    const queue = {
      getJob: jest.fn().mockResolvedValue(undefined),
      toKey: (suffix: string) => `preview:${suffix}`,
      client: Promise.resolve(redis),
      add: jest.fn().mockResolvedValue(undefined),
    };
    Reflect.set(fixture.service, 'queue', queue);
    const token = fixture.service.createToken({ id: 'certificate-1', issuedAt }) ?? '';
    return { ...fixture, redis, queue, token };
  }

  it('reserves with the BullMQ adapter command API and enqueues only admitted revisions', async () => {
    const { service, redis, queue, token } = createQueuedService();
    await expect(service.request('certificate-1', token)).resolves.toEqual({ imagePath: null });
    expect(redis.defineCommand).toHaveBeenCalledWith('reservePublicCertificatePreview', {
      lua: RESERVE_CERTIFICATE_PREVIEW,
      numberOfKeys: 8,
    });
    expect(redis.runCommand).toHaveBeenCalledWith('reservePublicCertificatePreview', [
      'preview:health',
      'preview:cooldown',
      'preview:budget',
      'preview:reservations',
      'preview:wait',
      'preview:active',
      'preview:paused',
      expect.stringMatching(/^preview:reservation-owner:[a-f0-9]{64}$/),
      expect.stringMatching(/^[a-f0-9]{64}$/),
      'preview:',
      expect.any(String),
    ]);
    expect(queue.add).toHaveBeenCalledTimes(1);
    redis.runCommand.mockResolvedValue(0);
    await expect(service.request('certificate-1', token)).resolves.toBeNull();
    expect(queue.add).toHaveBeenCalledTimes(1);
  });

  it.each([false, true])('releases only its own reservation after enqueue (failure: %s)', async (fails) => {
    const { service, redis, queue, token } = createQueuedService();
    if (fails) {
      queue.add.mockRejectedValueOnce(new Error('Redis unavailable during enqueue'));
    }

    await expect(service.request('certificate-1', token)).resolves.toEqual(fails ? null : { imagePath: null });
    const reserveArgs = redis.runCommand.mock.calls[0][1];
    expect(redis.runCommand).toHaveBeenNthCalledWith(2, 'releasePublicCertificatePreview', [
      reserveArgs[3],
      reserveArgs[7],
      reserveArgs[8],
      reserveArgs[10],
    ]);
    expect(queue.add.mock.invocationCallOrder[0]).toBeLessThan(redis.runCommand.mock.invocationCallOrder[1]);
    await expect(service.request('certificate-1', token)).resolves.toEqual({ imagePath: null });
    expect(queue.add).toHaveBeenCalledTimes(2);
  });

  it('removes retained failures before reserving another attempt', async () => {
    const { service, redis, queue, token } = createQueuedService();
    const failed = { getState: jest.fn().mockResolvedValue('failed'), remove: jest.fn().mockResolvedValue(undefined) };
    queue.getJob.mockResolvedValue(failed);
    await expect(service.request('certificate-1', token)).resolves.toEqual({ imagePath: null });
    expect(failed.remove).toHaveBeenCalledTimes(1);
    const calls = redis.runCommand.mock.calls;
    const operations = calls.map(([name, args]) => {
      switch (name) {
        case 'reservePublicCertificatePreview':
          return 'reserve';
        case 'releasePublicCertificatePreview':
          return 'release reservation';
        default:
          return args[1];
      }
    });
    expect(operations).toEqual(['acquire', 'reserve', 'release reservation', 'release']);
    expect(failed.remove.mock.invocationCallOrder[0]).toBeLessThan(redis.runCommand.mock.invocationCallOrder[1]);
    expect(redis.runCommand.mock.invocationCallOrder[1]).toBeLessThan(queue.add.mock.invocationCallOrder[0]);
  });

  it.each(['active', 'waiting'])('keeps an existing %s job without reserving or replacing it', async (state) => {
    const { service, redis, queue, token } = createQueuedService();
    queue.getJob.mockResolvedValue({ getState: jest.fn().mockResolvedValue(state) });
    await expect(service.request('certificate-1', token)).resolves.toEqual({ imagePath: null });
    expect(redis.runCommand).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('does not remove a replacement job or enqueue while another caller recovers a failure', async () => {
    const { service, redis, queue, token } = createQueuedService();
    const failed = { getState: jest.fn().mockResolvedValue('failed'), remove: jest.fn() };
    queue.getJob.mockResolvedValue(failed);
    redis.runCommand.mockResolvedValueOnce(null);
    await expect(service.request('certificate-1', token)).resolves.toEqual({ imagePath: null });
    expect(failed.remove).not.toHaveBeenCalled();
    expect(redis.runCommand).toHaveBeenCalledTimes(1);
    queue.getJob
      .mockResolvedValueOnce(failed)
      .mockResolvedValueOnce({ getState: jest.fn().mockResolvedValue('waiting') });
    await expect(service.request('certificate-1', token)).resolves.toEqual({ imagePath: null });
    expect(failed.remove).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('checks visibility and issuance before serving even an already cached image', async () => {
    const { service, prisma, cache } = createService();
    const issuedAt = new Date(Date.now() - 1000);
    const id = 'certificate-1';
    const token = service.createToken({ id, issuedAt }) ?? '';
    const source = {
      issuedAt,
      updatedAt: issuedAt,
      config: { updatedAt: issuedAt },
      certificateTemplate: { id: 'template', updatedAt: issuedAt, contentChecksum: 'checksum' },
    };
    prisma.certificate.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ ...source, issuedAt: new Date() })
      .mockResolvedValueOnce(source);
    const image = Buffer.from('image');
    cache.read.mockResolvedValue(image);

    await expect(service.read(id, token)).resolves.toBeNull();
    await expect(service.read(id, token)).resolves.toBeNull();
    await expect(service.read(id, token)).resolves.toBe(image);
    expect(cache.read).toHaveBeenCalledTimes(1);
    expect(prisma.certificate.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id, revokedAt: null, deletedAt: null, lgpdDeletionRequestId: null }),
      }),
    );
  });
});
