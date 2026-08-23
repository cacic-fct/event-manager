import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import {
  LGPD_STORAGE_CLEANUP_JOB,
  LGPD_STORAGE_CLEANUP_QUEUE,
  LgpdStorageCleanupJob,
  LgpdStorageCleanupService,
} from './lgpd-storage-cleanup.service';

@Processor(LGPD_STORAGE_CLEANUP_QUEUE)
export class LgpdStorageCleanupProcessor extends WorkerHost {
  constructor(private readonly cleanup: LgpdStorageCleanupService) {
    super();
  }

  override async process(job: Job<LgpdStorageCleanupJob>): Promise<void> {
    if (job.name === 'reconcile') {
      await this.cleanup.reconcile();
      return;
    }
    if (job.name !== LGPD_STORAGE_CLEANUP_JOB) {
      throw new Error(`Unsupported LGPD storage cleanup job: ${job.name}`);
    }
    if (!job.data || typeof job.data.outboxId !== 'string' || !job.data.outboxId.trim()) {
      throw new Error('Malformed LGPD storage cleanup job payload.');
    }
    await this.cleanup.process({ outboxId: job.data.outboxId.trim() });
  }
}
