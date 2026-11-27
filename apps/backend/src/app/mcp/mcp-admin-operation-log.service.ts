import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { McpOperationOutcome } from './shared/transport';

export interface McpOperationContext {
  userId?: string;
  clientId?: string;
  delegationId?: string;
  tool: string;
  eventId?: string;
  proposalId?: string;
}

@Injectable()
export class McpAdminOperationLogService {
  constructor(private readonly prisma: PrismaService) {}

  async start(context: McpOperationContext): Promise<string> {
    const entry = await this.prisma.mcpAdminOperationLog.create({ data: { ...context, outcome: 'STARTED' } });
    return entry.id;
  }

  async finish(id: string, outcome: McpOperationOutcome): Promise<void> {
    await this.prisma.mcpAdminOperationLog.update({ where: { id }, data: { outcome } });
  }

  async denied(context: McpOperationContext): Promise<void> {
    await this.prisma.mcpAdminOperationLog.create({ data: { ...context, outcome: 'DENIED' } });
  }
}
