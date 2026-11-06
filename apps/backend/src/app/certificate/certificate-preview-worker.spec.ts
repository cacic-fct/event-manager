import { jest } from '@jest/globals';
import { setImmediate } from 'node:timers/promises';
import type { PrismaService } from '../prisma/prisma.service';
import type { CertificateDownloadService } from './certificate-download.service';
import type { CertificatePreviewCache } from './certificate-preview-cache';

const redis = { set: jest.fn<(...args: unknown[]) => Promise<string>>().mockResolvedValue('OK') };
let processJob: (job: {
  name: string;
  data: { certificateId: string; revision: string };
  timestamp: number;
}) => Promise<void>;
const queue = {
  client: Promise.resolve(redis),
  toKey: (suffix: string) => `preview:${suffix}`,
  on: jest.fn(),
  close: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  setGlobalConcurrency: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  upsertJobScheduler: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
};
const worker = {
  on: jest.fn(),
  close: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  waitUntilReady: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  isRunning: () => true,
};
jest.unstable_mockModule('bullmq', () => ({
  Queue: jest.fn(function () {
    return queue;
  }),
  Worker: jest.fn(function (_name, processor: typeof processJob) {
    processJob = processor;
    return worker;
  }),
}));
const headroom = jest.fn<() => boolean>().mockReturnValue(true);
jest.unstable_mockModule('./certificate-preview-process', () => ({
  hasCertificatePreviewHeadroom: headroom,
  renderCertificatePreviewInChild: jest.fn(),
  CertificatePreviewResourceError: class extends Error {},
}));
const { CertificatePreviewWorker } = await import('./certificate-preview-worker');

it('uses BullMQ adapter expiration options for worker health and memory cooldown', async () => {
  const previous = process.env.CERTIFICATE_PREVIEW_ENABLED;
  process.env.CERTIFICATE_PREVIEW_ENABLED = 'true';
  const cache = { enabled: true, assertBoundedStorage: async () => undefined };
  const service = new CertificatePreviewWorker(
    {} as PrismaService,
    cache as unknown as CertificatePreviewCache,
    {} as CertificateDownloadService,
  );
  try {
    service.onApplicationBootstrap();
    for (let attempt = 0; attempt < 200 && !redis.set.mock.calls.length; attempt++) {
      await setImmediate();
    }
    expect(redis.set).toHaveBeenCalledWith('preview:health', '1', { PX: 8000 });
    headroom.mockReturnValue(false);
    await expect(
      processJob({
        name: 'render',
        data: { certificateId: 'certificate-1', revision: 'a'.repeat(64) },
        timestamp: Date.now(),
      }),
    ).rejects.toThrow('Insufficient memory');
    expect(redis.set).toHaveBeenCalledWith('preview:cooldown', '1', { PX: 30_000 });
  } finally {
    await service.onModuleDestroy();
    if (previous === undefined) {
      delete process.env.CERTIFICATE_PREVIEW_ENABLED;
    } else {
      process.env.CERTIFICATE_PREVIEW_ENABLED = previous;
    }
  }
});
