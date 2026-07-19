import {
  CertificateNotificationJobsService,
  CERTIFICATE_AVAILABLE_NOTIFICATION_JOB,
} from './certificate-notification-jobs.service';

describe('CertificateNotificationJobsService', () => {
  const certificate = {
    id: 'certificate-1',
    configId: 'config-1',
    issuedAt: new Date('2026-05-23T15:30:00.000Z'),
    person: { id: 'person-1' },
    config: { name: 'Config', event: { name: 'Evento' } },
  };

  it('queues idempotent certificate notifications with retries', async () => {
    const queue = { add: jest.fn().mockResolvedValue(undefined) };
    const notifications = { mapPersonToRecipient: jest.fn().mockReturnValue({ subscriberId: 'person-1' }) };
    const service = new CertificateNotificationJobsService(queue as never, notifications as never);

    await service.enqueue(certificate as never);

    expect(queue.add).toHaveBeenCalledWith(
      CERTIFICATE_AVAILABLE_NOTIFICATION_JOB,
      expect.objectContaining({
        certificateId: 'certificate-1',
        issuedAt: '2026-05-23T15:30:00.000Z',
        recipient: { subscriberId: 'person-1' },
      }),
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1_000 },
        jobId: 'certificate-available:certificate-1:2026-05-23T15:30:00.000Z',
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
    });

    expect(notifications.notifyCertificateAvailable).toHaveBeenCalledWith(
      expect.objectContaining({ issuedAt: new Date('2026-05-23T15:30:00.000Z') }),
    );
  });

  it('throws when Novu does not acknowledge delivery so BullMQ retries the job', async () => {
    const notifications = { notifyCertificateAvailable: jest.fn().mockResolvedValue(false) };
    const service = new CertificateNotificationJobsService({ add: jest.fn() } as never, notifications as never);

    await expect(
      service.deliver({
        certificateId: 'certificate-1',
        configId: 'config-1',
        certificateName: 'Config',
        targetName: 'Evento',
        issuedAt: '2026-05-23T15:30:00.000Z',
        recipient: { subscriberId: 'person-1' },
      }),
    ).rejects.toThrow('was not acknowledged');
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
      }),
    ).resolves.toBeUndefined();
  });
});
