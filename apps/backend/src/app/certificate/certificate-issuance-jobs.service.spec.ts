import { ConflictException } from '@nestjs/common';
import { Prisma, type CertificateIssuanceRun } from '@prisma/client';
import { audienceContext } from '../audiences/audience-context';
import {
  CertificateIssuanceJobsService,
  certificateReconciliationInterval,
  ISSUE_CERTIFICATES_JOB,
} from './certificate-issuance-jobs.service';
const { jest } = import.meta;

function fixture() {
  const now = new Date();
  const config = {
    id: 'config',
    updatedAt: now,
    isActive: true,
    issuedTo: 'ATTENDEE',
    certificateTemplate: { isActive: true },
  };
  const run: CertificateIssuanceRun = {
    id: 'run',
    configId: config.id,
    status: 'PENDING',
    scheduledAt: now,
    reissue: false,
    notifyRecipients: true,
    automatic: false,
    requestedById: 'admin',
    configUpdatedAt: now,
    startedAt: null,
    completedAt: null,
    error: null,
    certificateCount: 0,
    createdAt: now,
    updatedAt: now,
  };
  const prisma = {
    certificateIssuanceRun: {
      create: jest.fn().mockResolvedValue(run),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockImplementation(async () => run),
      findUniqueOrThrow: jest.fn().mockResolvedValue(run),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn().mockResolvedValue(run),
    },
    user: { findUnique: jest.fn().mockResolvedValue({ name: 'Admin', email: null }) },
    certificate: { findMany: jest.fn().mockResolvedValue([{ id: 'certificate' }]) },
    certificateConfig: {
      findMany: jest.fn().mockResolvedValue([]),
      findUniqueOrThrow: jest.fn().mockResolvedValue(config),
    },
    $transaction: jest.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(prisma)),
  };
  const eligibility = { getConfigById: jest.fn().mockImplementation(async () => config) };
  const issuing = { issueMissedCertificates: jest.fn().mockResolvedValue([]) };
  const notifications = { createPendingOutbox: jest.fn().mockResolvedValue(undefined) };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const queue = {
    getJob: jest.fn().mockResolvedValue(undefined),
    add: jest.fn().mockResolvedValue({}),
    upsertJobScheduler: jest.fn().mockResolvedValue({}),
  };
  const service = new CertificateIssuanceJobsService(
    prisma as never,
    eligibility as never,
    issuing as never,
    notifications as never,
    queue as never,
    audit as never,
  );
  return { now, config, run, audit, prisma, eligibility, issuing, notifications, queue, service };
}

describe('CertificateIssuanceJobsService', () => {
  it('defaults recovery sweeps to six hours and supports a bounded deployment override', () => {
    expect(certificateReconciliationInterval(undefined)).toBe(6 * 60 * 60_000);
    expect(certificateReconciliationInterval('24')).toBe(24 * 60 * 60_000);
    for (const value of ['0', '-1', 'invalid', '169', '0.5']) {
      expect(certificateReconciliationInterval(value)).toBe(6 * 60 * 60_000);
    }
  });

  it('avoids audit writes for an automatic sweep that changes no certificates', async () => {
    const { service, run, prisma, audit } = fixture();
    run.automatic = true;
    prisma.certificate.findMany.mockResolvedValueOnce([]);
    await service.requestIssuance({ configId: 'config' }, undefined, true);
    await service.process('run', true);
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('prioritizes explicit admin requests over automatic recovery runs', async () => {
    const { service, run, queue } = fixture();
    await service.requestIssuance({ configId: 'config' });
    expect(queue.add).toHaveBeenLastCalledWith(
      ISSUE_CERTIFICATES_JOB,
      { runId: run.id },
      expect.objectContaining({ priority: 1 }),
    );
    run.automatic = true;
    await service.requestIssuance({ configId: 'config' }, undefined, true);
    expect(queue.add).toHaveBeenLastCalledWith(
      ISSUE_CERTIFICATES_JOB,
      { runId: run.id },
      expect.objectContaining({ priority: 10 }),
    );
  });

  it('persists an immediate request before enqueueing and carries the notification choice', async () => {
    const { service, prisma, queue } = fixture();
    await service.requestIssuance({ configId: 'config', notifyRecipients: false }, 'admin');
    expect(prisma.certificateIssuanceRun.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        configId: 'config',
        notifyRecipients: false,
        reissue: false,
        requestedById: 'admin',
        configUpdatedAt: expect.any(Date),
      }),
    });
    expect(queue.add).toHaveBeenCalledWith(
      ISSUE_CERTIFICATES_JOB,
      { runId: 'run' },
      expect.objectContaining({ attempts: 5, delay: 0 }),
    );
  });

  it('schedules manual configurations and rejects past or invalid dates', async () => {
    const { service, config, run, queue } = fixture();
    config.issuedTo = 'OTHER';
    run.scheduledAt = new Date(Date.now() + 60_000);
    await service.requestIssuance({ configId: 'config', scheduledAt: run.scheduledAt });
    expect(queue.add).toHaveBeenCalledWith(
      ISSUE_CERTIFICATES_JOB,
      { runId: 'run' },
      expect.objectContaining({ delay: expect.any(Number) }),
    );
    expect(queue.add.mock.calls[0][2].delay).toBeGreaterThan(0);
    await expect(
      service.requestIssuance({ configId: 'config', scheduledAt: new Date(Date.now() - 1_000) }),
    ).rejects.toThrow('futuras');
    await expect(service.requestIssuance({ configId: 'config', scheduledAt: new Date('invalid') })).rejects.toThrow(
      'futuras',
    );
  });

  it('keeps the saved request recoverable when Redis is unavailable', async () => {
    const { service, queue } = fixture();
    queue.add.mockRejectedValue(new Error('redis unavailable'));
    await expect(service.requestIssuance({ configId: 'config' })).resolves.toEqual(
      expect.objectContaining({ id: 'run' }),
    );
  });

  it('returns a useful conflict when two requests target the same configuration', async () => {
    const { service, prisma } = fixture();
    prisma.certificateIssuanceRun.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: 'test' }),
    );
    await expect(service.requestIssuance({ configId: 'config' })).rejects.toBeInstanceOf(ConflictException);
  });

  it.each(['CANCELLED', 'COMPLETED', 'FAILED'])('does not execute a %s run', async (status) => {
    const { service, run, issuing } = fixture();
    run.status = status as CertificateIssuanceRun['status'];
    await service.process(run.id, true);
    expect(issuing.issueMissedCertificates).not.toHaveBeenCalled();
  });

  it('does not issue a future schedule early or run after losing the cancellation race', async () => {
    const { service, run, prisma, issuing } = fixture();
    run.scheduledAt = new Date(Date.now() + 60_000);
    await service.process(run.id, true);
    expect(prisma.certificateIssuanceRun.updateMany).not.toHaveBeenCalled();
    run.scheduledAt = new Date(Date.now() - 1_000);
    prisma.certificateIssuanceRun.updateMany.mockResolvedValueOnce({ count: 0 });
    await service.process(run.id, true);
    expect(issuing.issueMissedCertificates).not.toHaveBeenCalled();
  });

  it('records request, start, completion, and cancellation in the audit log', async () => {
    const { service, audit, run } = fixture();
    await service.requestIssuance({ configId: 'config' }, 'admin');
    await service.process('run', true);
    run.status = 'CANCELLED';
    await service.cancel('config', 'run', 'cancelling-admin');
    expect(audit.record.mock.calls.map(([entry]) => entry.metadata.status)).toEqual([
      'PENDING',
      'PROCESSING',
      'COMPLETED',
      'CANCELLED',
    ]);
    expect(audit.record.mock.calls[3][0].actor.id).toBe('cancelling-admin');
  });

  it('creates scoped notifications in the completion transaction only after the entire batch succeeds', async () => {
    const { service, prisma, notifications, issuing } = fixture();
    issuing.issueMissedCertificates.mockImplementationOnce(async () => {
      expect(notifications.createPendingOutbox).not.toHaveBeenCalled();
      expect(audienceContext.getStore()?.bypass).toBe(true);
    });
    await service.process('run', true);
    expect(issuing.issueMissedCertificates).toHaveBeenCalledWith('config', 'admin', {
      notify: false,
      createNotifications: false,
      force: false,
      batchSize: 1,
    });
    expect(notifications.createPendingOutbox).toHaveBeenCalledWith({ id: 'certificate' }, prisma);
    expect(prisma.certificateIssuanceRun.update).toHaveBeenCalledWith({
      where: { id: 'run' },
      data: expect.objectContaining({ status: 'COMPLETED', certificateCount: 1 }),
    });
  });

  it('never creates an outbox for a muted reissuance', async () => {
    const { service, run, issuing, notifications } = fixture();
    run.notifyRecipients = false;
    run.reissue = true;
    await service.process('run', true);
    expect(issuing.issueMissedCertificates).toHaveBeenCalledWith(
      'config',
      'admin',
      expect.objectContaining({ force: true, createNotifications: false }),
    );
    expect(notifications.createPendingOutbox).not.toHaveBeenCalled();
  });

  it('retries partial failures without notifying and reports terminal failures', async () => {
    const { service, issuing, notifications, prisma, run } = fixture();
    const failure = new Error('batch failed');
    issuing.issueMissedCertificates.mockRejectedValue(failure);
    run.startedAt = new Date(Date.now() - 30_000);
    await expect(service.process('run', false)).rejects.toBe(failure);
    expect(prisma.certificateIssuanceRun.update).toHaveBeenLastCalledWith({
      where: { id: 'run' },
      data: expect.objectContaining({ status: 'PENDING' }),
    });
    await expect(service.process('run', true)).rejects.toBe(failure);
    expect(prisma.certificateIssuanceRun.update).toHaveBeenLastCalledWith({
      where: { id: 'run' },
      data: expect.objectContaining({ status: 'FAILED', completedAt: expect.any(Date) }),
    });
    expect(notifications.createPendingOutbox).not.toHaveBeenCalled();
  });

  it('fails a queued request if its configuration changed rather than executing under a different scope', async () => {
    const { service, config, issuing, prisma } = fixture();
    config.updatedAt = new Date(Date.now() + 1_000);
    await expect(service.process('run', false)).rejects.toThrow('alterada');
    expect(issuing.issueMissedCertificates).not.toHaveBeenCalled();
    expect(prisma.certificateIssuanceRun.update).toHaveBeenLastCalledWith({
      where: { id: 'run' },
      data: expect.objectContaining({ status: 'FAILED' }),
    });
  });

  it('reconciles previously published manual and automatic configurations while preserving the last notification choice', async () => {
    const { service, prisma } = fixture();
    prisma.certificateConfig.findMany.mockResolvedValueOnce([
      { id: 'automatic', issuanceRuns: [{ notifyRecipients: false }] },
      { id: 'manual', issuanceRuns: [] },
    ]);
    const request = jest.spyOn(service, 'requestIssuance').mockResolvedValue({} as never);
    await service.reconcileEligibility();
    const where = prisma.certificateConfig.findMany.mock.calls[0][0].where;
    expect(where).toEqual(
      expect.objectContaining({
        isActive: true,
        deletedAt: null,
        issuanceRuns: { none: { status: { in: ['PENDING', 'PROCESSING'] } } },
        OR: [{ certificates: { some: {} } }, { issuanceRuns: { some: { status: 'COMPLETED' } } }],
      }),
    );
    expect(where).not.toHaveProperty('issuedTo');
    expect(request).toHaveBeenCalledWith({ configId: 'automatic', notifyRecipients: false }, undefined, true);
    expect(request).toHaveBeenCalledWith({ configId: 'manual', notifyRecipients: true }, undefined, true);
  });

  it('recovers private-scope pending jobs and closes stalled jobs that BullMQ has permanently failed', async () => {
    const { service, queue, prisma, run } = fixture();
    prisma.certificateIssuanceRun.findMany.mockImplementationOnce(async () => {
      expect(audienceContext.getStore()?.bypass).toBe(true);
      return [run];
    });
    queue.getJob.mockResolvedValueOnce({ getState: async () => 'failed' } as never);
    await service.recoverPending();
    expect(prisma.certificateIssuanceRun.update).toHaveBeenCalledWith({
      where: { id: run.id },
      data: expect.objectContaining({ status: 'FAILED' }),
    });
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('cancels only pending requests belonging to the authorized configuration', async () => {
    const { service, prisma } = fixture();
    await service.cancel('config', 'run');
    expect(prisma.certificateIssuanceRun.updateMany).toHaveBeenCalledWith({
      where: { id: 'run', configId: 'config', status: 'PENDING' },
      data: expect.objectContaining({ status: 'CANCELLED' }),
    });
    prisma.certificateIssuanceRun.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(service.cancel('config', 'run')).rejects.toBeInstanceOf(ConflictException);
  });
});
