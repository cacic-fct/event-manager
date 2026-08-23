import { CertificateNotificationJobsProcessor } from './certificate-notification-jobs.processor';
import {
  CERTIFICATE_AVAILABLE_NOTIFICATION_JOB,
  CERTIFICATE_NOTIFICATION_RECONCILE_JOB,
} from './certificate-notification-jobs.service';

describe('CertificateNotificationJobsProcessor', () => {
  it('delivers certificate availability notifications', async () => {
    const deliver = jest.fn().mockResolvedValue(undefined);
    const processor = new CertificateNotificationJobsProcessor({ deliver } as never);
    const data = {
      certificateId: 'certificate-1',
      configId: 'config-1',
      certificateName: 'Config',
      targetName: 'Evento',
      issuedAt: '2026-05-23T15:30:00.000Z',
      recipient: { subscriberId: 'person-1' },
      outboxId: 'outbox-1',
    };

    await processor.process({ name: CERTIFICATE_AVAILABLE_NOTIFICATION_JOB, data } as never);

    expect(deliver).toHaveBeenCalledWith(data);
  });

  it('runs the bounded pending-outbox reconciliation job', async () => {
    const reconcilePending = jest.fn().mockResolvedValue(undefined);
    const processor = new CertificateNotificationJobsProcessor({ deliver: jest.fn(), reconcilePending } as never);

    await processor.process({ name: CERTIFICATE_NOTIFICATION_RECONCILE_JOB, data: {} } as never);

    expect(reconcilePending).toHaveBeenCalledTimes(1);
  });

  it('rejects unrelated queue jobs', async () => {
    const deliver = jest.fn();
    const processor = new CertificateNotificationJobsProcessor({ deliver } as never);

    await expect(processor.process({ name: 'unknown', data: {} } as never)).rejects.toThrow(
      'Unsupported certificate notification job',
    );
    expect(deliver).not.toHaveBeenCalled();
  });
});
