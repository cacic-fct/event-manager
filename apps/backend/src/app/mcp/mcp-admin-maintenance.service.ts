import { Injectable, Logger } from '@nestjs/common';
import { EventPostCommitEffectsService } from '../events/event-post-commit-effects.service';
import { PrismaService } from '../prisma/prisma.service';
import { SportsMutationEventsService } from '../sports/realtime/sports-mutation-events.service';

@Injectable()
export class McpAdminMaintenanceService {
  private readonly logger = new Logger(McpAdminMaintenanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly effects: EventPostCommitEffectsService,
    private readonly sportsEvents: SportsMutationEventsService,
  ) {}

  async flush(): Promise<void> {
    const pending = await this.prisma.mcpEventContentSync.findMany({
      where: { OR: [{ leaseUntil: null }, { leaseUntil: { lte: new Date() } }] },
      orderBy: { createdAt: 'asc' },
      take: 20,
    });
    for (const entry of pending) {
      const leaseUntil = new Date(Date.now() + 60_000);
      const claimed = await this.prisma.mcpEventContentSync.updateMany({
        where: {
          eventId: entry.eventId,
          revision: entry.revision,
          OR: [{ leaseUntil: null }, { leaseUntil: { lte: new Date() } }],
        },
        data: { leaseUntil },
      });
      if (claimed.count !== 1) continue;
      try {
        await this.effects.syncEventContent(entry.eventId);
        await this.sportsEvents.publishForBackingEvent(entry.eventId);
        // A second approved edit may have arrived while synchronization ran.
        await this.prisma.mcpEventContentSync.deleteMany({
          where: { eventId: entry.eventId, revision: entry.revision, leaseUntil },
        });
      } catch {
        this.logger.warn('MCP event projection synchronization will be retried.');
      } finally {
        await this.prisma.mcpEventContentSync.updateMany({
          where: { eventId: entry.eventId, leaseUntil },
          data: { leaseUntil: null },
        });
      }
    }
  }

  async prune(): Promise<void> {
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60_000);
    const logs = await this.prisma.mcpAdminOperationLog.findMany({
      where: { createdAt: { lt: cutoff } },
      select: { id: true },
      take: 500,
    });
    await this.prisma.mcpAdminOperationLog.deleteMany({
      where: { id: { in: logs.map((entry) => entry.id) }, createdAt: { lt: cutoff } },
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
