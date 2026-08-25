import {
  CertificateNotificationJobsService,
  CERTIFICATE_AVAILABLE_NOTIFICATION_JOB,
  CERTIFICATE_NOTIFICATION_RECONCILE_JOB,
} from './certificate-notification-jobs.service';

describe('CertificateNotificationJobsService', () => {
  const certificate = {
    id: 'certificate-1',
    configId: 'config-1',
    issuedAt: new Date('2026-05-23T15:30:00.000Z'),
    person: { id: 'person-1' },
    config: { name: 'Config', event: { name: 'Evento' } },
  };

  it('upserts the certificate notification reconciliation scheduler', async () => {
    const queue = { upsertJobScheduler: jest.fn().mockResolvedValue({ id: 'job-1' }) };
    const service = new CertificateNotificationJobsService(queue as never);

    await service.onModuleInit();

    expect(queue.upsertJobScheduler).toHaveBeenCalledWith(
      'certificate-notification-reconcile',
      { pattern: '* * * * *' },
      {
        name: CERTIFICATE_NOTIFICATION_RECONCILE_JOB,
        data: {},
        opts: { removeOnComplete: true, removeOnFail: 50 },
      },
    );
  });

  it('queues idempotent certificate notifications through the claimed outbox row', async () => {
    const queue = { add: jest.fn().mockResolvedValue(undefined) };
    const notifications = { mapPersonToRecipient: jest.fn().mockReturnValue({ subscriberId: 'person-1' }) };
    const prisma = {
      certificateNotificationOutbox: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({ id: 'outbox-1' })
          .mockResolvedValueOnce({ id: 'outbox-1', attempts: 1 }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const service = new CertificateNotificationJobsService(queue as never, notifications as never, prisma as never);

    await service.enqueue(certificate as never);

    expect(queue.add).toHaveBeenCalledWith(
      CERTIFICATE_AVAILABLE_NOTIFICATION_JOB,
      expect.objectContaining({
        certificateId: 'certificate-1',
        issuedAt: '2026-05-23T15:30:00.000Z',
        recipient: { subscriberId: 'person-1' },
        outboxId: 'outbox-1',
      }),
      {
        jobId: 'certificate-available-outbox-1-1',
        removeOnComplete: true,
        removeOnFail: 50,
      },
    );
  });

  it('delivers the queued notification with its original issue date', async () => {
    const notifications = { notifyCertificateAvailable: jest.fn().mockResolvedValue(true) };
    const service = new CertificateNotificationJobsService({ add: jest.fn() } as never, notifications as never);

    await service.deliver({
      certificateId: 'certificate-1',
      configId: 'config-1',
      certificateName: 'Config',
      targetName: 'Evento',
      issuedAt: '2026-05-23T15:30:00.000Z',
      recipient: { subscriberId: 'person-1' },
      outboxId: 'outbox-1',
    });

    expect(notifications.notifyCertificateAvailable).toHaveBeenCalledWith(
      expect.objectContaining({ issuedAt: new Date('2026-05-23T15:30:00.000Z') }),
    );
  });

  it('defers an unacknowledged delivery to the outbox retry date', async () => {
    const notifications = { notifyCertificateAvailable: jest.fn().mockResolvedValue(false) };
    const prisma = {
      certificateNotificationOutbox: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({ status: 'PROCESSING' })
          .mockResolvedValueOnce({ attempts: 1, status: 'PROCESSING' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const service = new CertificateNotificationJobsService(
      { add: jest.fn() } as never,
      notifications as never,
      prisma as never,
    );

    await expect(
      service.deliver({
        certificateId: 'certificate-1',
        configId: 'config-1',
        certificateName: 'Config',
        targetName: 'Evento',
        issuedAt: '2026-05-23T15:30:00.000Z',
        recipient: { subscriberId: 'person-1' },
        outboxId: 'outbox-1',
      }),
    ).resolves.toBeUndefined();
    expect(prisma.certificateNotificationOutbox.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'outbox-1', status: 'PROCESSING' },
        data: expect.objectContaining({
          status: 'PENDING',
          lastError: expect.stringContaining('was not acknowledged'),
        }),
      }),
    );
  });

  it('does not deliver notifications when Novu is unavailable', async () => {
    const service = new CertificateNotificationJobsService({ add: jest.fn() } as never, undefined);

    await expect(
      service.deliver({
        certificateId: 'certificate-1',
        configId: 'config-1',
        certificateName: 'Config',
        targetName: 'Evento',
        issuedAt: '2026-05-23T15:30:00.000Z',
        recipient: { subscriberId: 'person-1' },
        outboxId: 'outbox-1',
      }),
    ).resolves.toBeUndefined();
  });

  it('returns an outbox item to pending with persisted error when queue insertion fails', async () => {
    const queue = { add: jest.fn().mockRejectedValue(new Error('Redis down')) };
    const notifications = { mapPersonToRecipient: jest.fn().mockReturnValue({ subscriberId: 'person-1' }) };
    const prisma = {
      certificateNotificationOutbox: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({ id: 'outbox-1' })
          .mockResolvedValueOnce({ id: 'outbox-1', attempts: 2, status: 'PROCESSING' })
          .mockResolvedValueOnce({ id: 'outbox-1', attempts: 2, status: 'PROCESSING' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const service = new CertificateNotificationJobsService(queue as never, notifications as never, prisma as never);

    await expect(service.enqueue(certificate as never)).rejects.toThrow('Redis down');
    expect(prisma.certificateNotificationOutbox.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: 'outbox-1', status: 'PROCESSING' },
        data: expect.objectContaining({ status: 'PENDING', lastError: 'Redis down' }),
      }),
    );
  });

  it('supersedes older pending notifications when a certificate is reissued', async () => {
    const client = {
      certificateNotificationOutbox: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        upsert: jest.fn().mockResolvedValue({ id: 'outbox-new' }),
      },
    };
    const service = new CertificateNotificationJobsService(
      { add: jest.fn() } as never,
      { mapPersonToRecipient: jest.fn() } as never,
    );

    await service.createPendingOutbox(certificate as never, client as never);

    expect(client.certificateNotificationOutbox.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ certificateId: 'certificate-1', status: { in: ['PENDING', 'PROCESSING'] } }),
        data: expect.objectContaining({ status: 'SUPERSEDED' }),
      }),
    );
  });
});
