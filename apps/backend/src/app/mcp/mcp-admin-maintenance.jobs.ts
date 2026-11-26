import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, type OnModuleInit } from '@nestjs/common';
import { type Job, Queue } from 'bullmq';
import { buildBullMqJobId } from '../queues/bullmq-job-id';
import { AdminMcpCommandService } from './admin-operations/command-service';
import { McpAdminMaintenanceService } from './mcp-admin-maintenance.service';

export const MCP_ADMIN_MAINTENANCE_QUEUE = 'mcp-admin-maintenance';
const MAINTENANCE_JOB = 'recover-and-prune';

@Injectable()
export class McpAdminMaintenanceScheduler implements OnModuleInit {
  constructor(@InjectQueue(MCP_ADMIN_MAINTENANCE_QUEUE) private readonly queue: Queue) {}

  async onModuleInit(): Promise<void> {
    await this.queue.upsertJobScheduler(
      buildBullMqJobId('mcp', MAINTENANCE_JOB),
      { every: 60_000 },
      {
        name: MAINTENANCE_JOB,
        data: {},
        opts: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 10_000 },
          removeOnComplete: true,
          removeOnFail: 20,
        },
      },
    );
  }
}

@Processor(MCP_ADMIN_MAINTENANCE_QUEUE)
export class McpAdminMaintenanceProcessor extends WorkerHost {
  constructor(
    private readonly maintenance: McpAdminMaintenanceService,
    private readonly commands: AdminMcpCommandService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== MAINTENANCE_JOB) throw new Error('Unsupported MCP maintenance job.');
    await this.commands.recoverInterrupted();
    await this.maintenance.flush();
    await this.maintenance.prune();
  }
}
