import { Permission } from '@cacic-fct/shared-permissions';
import { AuditLogEntityType, AuditLogOperation, Prisma } from '@prisma/client';
import { CurrentUserContextService } from '../context.service';
import { GraphqlContext } from '../selects';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { PrismaService } from '../../prisma/prisma.service';
import { getAuthenticatedUser } from './attendance-collection-context';

export async function recordAttendanceCreate(params: {
  auditLog: AuditLogService;
  currentUserContext: CurrentUserContextService;
  context: GraphqlContext;
  attendance: {
    personId: string;
    eventId: string;
  };
  summary: string;
  prisma?: PrismaService | Prisma.TransactionClient;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await params.auditLog.record({
    entityType: AuditLogEntityType.EVENT_ATTENDANCE,
    entityId: params.auditLog.buildCompositeEntityId([params.attendance.personId, params.attendance.eventId]),
    entityLabel: params.attendance.personId,
    operation: AuditLogOperation.USER_CREATE,
    actor: getAuthenticatedUser(params.currentUserContext, params.context),
    after: params.attendance,
    scope: {
      permission: Permission.EventAttendance.Collect,
      eventId: params.attendance.eventId,
    },
    summary: params.summary,
    metadata: params.metadata,
  }, params.prisma);
}
