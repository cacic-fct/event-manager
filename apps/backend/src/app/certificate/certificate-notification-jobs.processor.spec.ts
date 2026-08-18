import { CertificateNotificationJobsProcessor } from './certificate-notification-jobs.processor';
import { CERTIFICATE_AVAILABLE_NOTIFICATION_JOB } from './certificate-notification-jobs.service';

describe('CertificateNotificationJobsProcessor', () => {
  it('delivers certificate availability notifications', async () => {
    const deliver = jest.fn().mockResolvedValue(undefined);
    const processor = new CertificateNotificationJobsProcessor({ deliver } as never);
    const data = { certificateId: 'certificate-1', personId: 'person-1' };

    await processor.process({ name: CERTIFICATE_AVAILABLE_NOTIFICATION_JOB, data } as never);

    expect(deliver).toHaveBeenCalledWith(data);
  });

  it('ignores unrelated queue jobs', async () => {
    const deliver = jest.fn();
    const processor = new CertificateNotificationJobsProcessor({ deliver } as never);

    await expect(processor.process({ name: 'unknown', data: {} } as never)).resolves.toBeUndefined();
    expect(deliver).not.toHaveBeenCalled();
  });
});
