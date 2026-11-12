import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { BadRequestException, Injectable, type OnModuleInit } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { buildBullMqJobId } from '../queues/bullmq-job-id';
import { TypesenseSearchService } from '../search/typesense-search.service';
import { getAuditLogRetentionCutoff } from './audit-log.retention';

export const AUDIT_LOG_RETENTION_QUEUE = 'audit-log-retention';
const DELETE_EXPIRED_AUDIT_LOGS_JOB = 'delete-expired-audit-logs';
const BATCH_SIZE = 1000;

@Injectable()
export class AuditLogRetentionScheduler implements OnModuleInit {
  constructor(@InjectQueue(AUDIT_LOG_RETENTION_QUEUE) private readonly queue: Queue) {}

  async onModuleInit(): Promise<void> {
    await this.queue.upsertJobScheduler(
      buildBullMqJobId('audit-log', DELETE_EXPIRED_AUDIT_LOGS_JOB),
      { pattern: '0 4 * * *', tz: 'America/Sao_Paulo' },
      {
        name: DELETE_EXPIRED_AUDIT_LOGS_JOB,
        data: {},
        opts: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 60_000 },
          removeOnComplete: true,
          removeOnFail: 50,
        },
      },
    );
  }
}

@Processor(AUDIT_LOG_RETENTION_QUEUE)
export class AuditLogRetentionProcessor extends WorkerHost {
  constructor(
    private readonly prisma: PrismaService,
    private readonly search: TypesenseSearchService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== DELETE_EXPIRED_AUDIT_LOGS_JOB) {
      throw new BadRequestException(`Unsupported audit log retention job: ${job.name}.`);
    }

    const cutoff = getAuditLogRetentionCutoff(new Date());
    const expired = { lastRecordedAt: { lt: cutoff } };
    for (;;) {
      const entries = await this.prisma.auditLogEntry.findMany({
        where: expired,
        select: { id: true },
        orderBy: { lastRecordedAt: 'asc' },
        take: BATCH_SIZE,
      });
      if (entries.length === 0) {
        break;
      }

      await this.prisma.auditLogEntry.deleteMany({
        where: { ...expired, id: { in: entries.map(({ id }) => id) } },
      });
    }

    await this.search.deleteExpiredAuditLogEntries(cutoff);
  }
}
