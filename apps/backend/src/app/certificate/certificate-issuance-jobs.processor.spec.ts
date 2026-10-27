import { CertificateIssuanceJobsProcessor } from './certificate-issuance-jobs.processor';
import {
  ISSUE_CERTIFICATES_JOB,
  RECOVER_CERTIFICATE_ISSUANCE_JOB,
  RECONCILE_CERTIFICATE_ELIGIBILITY_JOB,
} from './certificate-issuance-jobs.service';
const { jest } = import.meta;

describe('CertificateIssuanceJobsProcessor', () => {
  function fixture() {
    const jobs = { process: jest.fn(), recoverPending: jest.fn(), reconcileEligibility: jest.fn() };
    return { jobs, processor: new CertificateIssuanceJobsProcessor(jobs as never) };
  }

  it('routes recurring recovery and eligibility jobs independently', async () => {
    const { jobs, processor } = fixture();
    await processor.process({ name: RECOVER_CERTIFICATE_ISSUANCE_JOB, data: {} } as never);
    await processor.process({ name: RECONCILE_CERTIFICATE_ELIGIBILITY_JOB, data: {} } as never);
    expect(jobs.recoverPending).toHaveBeenCalledTimes(1);
    expect(jobs.reconcileEligibility).toHaveBeenCalledTimes(1);
  });

  it('identifies the final retry and rejects malformed job payloads', async () => {
    const { jobs, processor } = fixture();
    await processor.process({
      name: ISSUE_CERTIFICATES_JOB,
      data: { runId: 'run' },
      attemptsMade: 3,
      opts: { attempts: 5 },
    } as never);
    expect(jobs.process).toHaveBeenLastCalledWith('run', false);
    await processor.process({
      name: ISSUE_CERTIFICATES_JOB,
      data: { runId: 'run' },
      attemptsMade: 4,
      opts: { attempts: 5 },
    } as never);
    expect(jobs.process).toHaveBeenLastCalledWith('run', true);
    await expect(processor.process({ name: ISSUE_CERTIFICATES_JOB, data: { runId: ' ' } } as never)).rejects.toThrow(
      'Invalid certificate issuance',
    );
    await expect(processor.process({ name: 'unknown', data: {} } as never)).rejects.toThrow('Unsupported');
  });
});
