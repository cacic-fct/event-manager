import { buildBullMqJobId } from './bullmq-job-id';

describe('buildBullMqJobId', () => {
  it('encodes dynamic values so custom IDs never contain reserved separators', () => {
    const jobId = buildBullMqJobId('certificate-available', 'person:id', 123);

    expect(jobId).toBe('certificate-available-person%3Aid-123');
    expect(jobId).not.toContain(':');
  });
});
