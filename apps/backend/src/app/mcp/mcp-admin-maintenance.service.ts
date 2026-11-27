import { McpAdminFileArtifactService } from './admin-operations/artifact-files';
import { Injectable, Logger, Optional } from '@nestjs/common';
import { EventPostCommitEffectsService } from '../events/event-post-commit-effects.service';
import { PrismaService } from '../prisma/prisma.service';
import { SportsMutationEventsService } from '../sports/realtime/sports-mutation-events.service';
import { McpAdminAdvisoryLockService } from './mcp-admin-advisory-lock.service';

@Injectable()
export class McpAdminMaintenanceService {
  private readonly logger = new Logger(McpAdminMaintenanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly effects: EventPostCommitEffectsService,
    private readonly sportsEvents: SportsMutationEventsService,
    private readonly syncLock: McpAdminAdvisoryLockService,
    @Optional() private readonly artifacts?: McpAdminFileArtifactService,
  ) {}

  async flush(eventId?: string): Promise<void> {
    const pending = await this.prisma.mcpEventContentSync.findMany({
      where: { ...(eventId ? { eventId } : {}), OR: [{ leaseUntil: null }, { leaseUntil: { lte: new Date() } }] },
      orderBy: [{ leaseUntil: { sort: 'asc', nulls: 'first' } }, { createdAt: 'asc' }, { eventId: 'asc' }],
      take: eventId ? 1 : 20,
    });
    for (const entry of pending) {
      try {
        await this.syncLock.run(entry.eventId, async () => {
          const leaseUntil = new Date(Date.now() + 60_000);
          const claimed = await this.prisma.mcpEventContentSync.updateMany({
            where: {
              eventId: entry.eventId,
              revision: entry.revision,
              OR: [{ leaseUntil: null }, { leaseUntil: { lte: new Date() } }],
            },
            data: { leaseUntil },
          });
          if (claimed.count !== 1) return;
          // On failure, retain the lease as a retry delay. Untouched work sorts first.
          await this.effects.syncEventContent(entry.eventId);
          await this.sportsEvents.publishForBackingEvent(entry.eventId, { syncBackingResources: false });
          await this.prisma.mcpEventContentSync.deleteMany({
            where: { eventId: entry.eventId, revision: entry.revision, leaseUntil },
          });
          // A newer edit remains pending, and can run as soon as this session unlocks.
          await this.prisma.mcpEventContentSync.updateMany({
            where: { eventId: entry.eventId, leaseUntil },
            data: { leaseUntil: null },
          });
        });
      } catch {
        this.logger.warn('MCP event projection synchronization will be retried.');
      }
    }
  }

  async prune(): Promise<void> {
    await this.artifacts?.cleanup();
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60_000);
    const logs = await this.prisma.mcpAdminOperationLog.findMany({
      where: { createdAt: { lt: cutoff } },
      select: { id: true },
      take: 500,
    });
    await this.prisma.mcpAdminOperationLog.deleteMany({
      where: { id: { in: logs.map((entry) => entry.id) }, createdAt: { lt: cutoff } },
    });
    // Cascading deletion removes command payloads only after their consent has
    // expired for 90 days. This maintenance never executes or retries commands.
    const operationDelegations = await this.prisma.mcpAdminOperationDelegation.findMany({
      where: { expiresAt: { lt: cutoff } },
      select: { id: true },
      orderBy: [{ expiresAt: 'asc' }, { id: 'asc' }],
      take: 100,
    });
    await this.prisma.mcpAdminOperationDelegation.deleteMany({
      where: { id: { in: operationDelegations.map((entry) => entry.id) }, expiresAt: { lt: cutoff } },
    });
    const delegations = await this.prisma.mcpAdminDelegation.findMany({
      where: { expiresAt: { lt: cutoff } },
      select: { id: true },
      take: 100,
    });
    await this.prisma.mcpAdminDelegation.deleteMany({
      where: { id: { in: delegations.map((entry) => entry.id) }, expiresAt: { lt: cutoff } },
    });
  }
}
