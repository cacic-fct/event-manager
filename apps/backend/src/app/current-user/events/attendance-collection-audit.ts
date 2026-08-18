import { Permission } from '@cacic-fct/shared-permissions';
import { AuditLogEntityType, AuditLogOperation, EventAttendanceStatus, Prisma } from '@prisma/client';
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
  await params.auditLog.record(
    {
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
    },
    params.prisma,
  );
}

export async function recordAttendanceSet(params: {
  auditLog: AuditLogService;
  currentUserContext: CurrentUserContextService;
  context: GraphqlContext;
  attendance: {
    personId: string;
    eventId: string;
    status: EventAttendanceStatus;
  };
  before: Record<string, unknown> | null;
  prisma: PrismaService | Prisma.TransactionClient;
  summary?: string;
  createOperation?: 'CREATE' | 'USER_CREATE';
}): Promise<void> {
  await params.auditLog.record(
    {
      entityType: AuditLogEntityType.EVENT_ATTENDANCE,
      entityId: params.auditLog.buildCompositeEntityId([params.attendance.personId, params.attendance.eventId]),
      entityLabel: params.attendance.personId,
      operation: params.before ? AuditLogOperation.UPDATE : (params.createOperation ?? AuditLogOperation.USER_CREATE),
      actor: getAuthenticatedUser(params.currentUserContext, params.context),
      before: params.before,
      after: params.attendance,
      scope: {
        permission: Permission.EventAttendance.Collect,
        eventId: params.attendance.eventId,
      },
      summary:
        params.summary ??
        (params.attendance.status === 'ABSENT'
          ? 'Ausência explícita registrada pelo coletor via chamada oral.'
          : 'Presença registrada pelo coletor via chamada oral.'),
    },
    params.prisma,
  );
}
