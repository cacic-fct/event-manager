import {
  CommitOfflineEventAttendancesInput,
  OfflineEventAttendanceCommitResult,
} from '@cacic-fct/shared-data-types';
import { BadRequestException, ConflictException, ForbiddenException, HttpException } from '@nestjs/common';
import { AttendanceCreationMethod } from '@prisma/client';
import { CurrentUserContextService } from '../context.service';
import { GraphqlContext } from '../selects';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { AttendanceCategoryService } from '../../events/attendance-category.service';
import { AuthorizationPolicyService } from '../../authorization/authorization-policy.service';
import { FrozenResourceService } from '../../common/frozen-resource.service';
import { DashboardInsightsService } from '../../dashboard/insights.service';
import { NovuNotificationsService } from '../../notifications/novu-notifications.service';
import { PrismaService } from '../../prisma/prisma.service';
import { recordAttendanceCreate } from './attendance-collection-audit';
import { ATTENDANCE_COLLECTION_PERMISSIONS } from './attendance-collection-events';
import {
  commitStatusForError,
  errorMessage,
  getActorId,
  getAuthenticatedUser,
  isRequiredLocationError,
  normalizeOptionalString,
} from './attendance-collection-context';
import { createAttendance, toEventAttendance } from './attendance-collection-records';
import { OfflineAttendanceSubmissions } from './attendance-collection-offline-submissions';

const MAX_OFFLINE_ATTENDANCE_COMMIT_BATCH_SIZE = 150;

type OfflineAttendanceCommitterDeps = {
  prisma: PrismaService;
  currentUserContext: CurrentUserContextService;
  attendanceCategories: AttendanceCategoryService;
  frozenResources: FrozenResourceService;
  authorizationPolicy: AuthorizationPolicyService;
  auditLog: AuditLogService;
  dashboardInsights: DashboardInsightsService;
  notifications: NovuNotificationsService;
};
type OfflineAttendanceItem = CommitOfflineEventAttendancesInput['attendances'][number];

export class OfflineAttendanceCommitter {
  private readonly submissions: OfflineAttendanceSubmissions;

  constructor(private readonly deps: OfflineAttendanceCommitterDeps) {
    this.submissions = new OfflineAttendanceSubmissions(
      deps.prisma,
      deps.currentUserContext,
      deps.auditLog,
      deps.dashboardInsights,
      deps.notifications,
    );
  }

  async commitBatch(
    input: CommitOfflineEventAttendancesInput,
    context: GraphqlContext,
  ): Promise<OfflineEventAttendanceCommitResult[]> {
    if (input.attendances.length > MAX_OFFLINE_ATTENDANCE_COMMIT_BATCH_SIZE) {
      throw new BadRequestException(
        `Envie no máximo ${MAX_OFFLINE_ATTENDANCE_COMMIT_BATCH_SIZE} presenças off-line por sincronização.`,
      );
    }

    const results: OfflineEventAttendanceCommitResult[] = [];
    for (const item of input.attendances) {
      results.push(await this.commit(item, context));
    }

    return results;
  }

  private async commit(
    item: OfflineAttendanceItem,
    context: GraphqlContext,
  ): Promise<OfflineEventAttendanceCommitResult> {
    const sender = await this.deps.currentUserContext.requireCurrentPerson(context);
    const submittedById = getActorId(context) ?? sender.userId;
    if (!submittedById) {
      throw new BadRequestException('Usuário autenticado sem identificador de conta.');
    }
    const createdById = submittedById;
    const canCommitWithPermission = await this.canCommitWithPermission(item.eventId, context);

    try {
      if (!canCommitWithPermission) {
        await this.deps.authorizationPolicy.assertAttendanceCollectorForEvent(item.eventId, sender.id, {
          enforceCollectionWindow: true,
          user: getAuthenticatedUser(this.deps.currentUserContext, context),
        });
      }
      const authenticatedUser = getAuthenticatedUser(this.deps.currentUserContext, context);
      await this.deps.frozenResources.assertEventMutable(item.eventId, authenticatedUser, 'edit');

      const person = await this.submissions.resolvePerson(item);
      const attendance = await createAttendance({
        prisma: this.deps.prisma,
        attendanceCategories: this.deps.attendanceCategories,
        input: {
          eventId: item.eventId,
          personId: person.id,
          createdByMethod: item.createdByMethod as AttendanceCreationMethod,
          createdById,
          committedById: submittedById,
          attendedAt: item.collectedAt,
          location: item.location,
        },
        afterCreate: (attendance, tx) =>
          recordAttendanceCreate({
            auditLog: this.deps.auditLog,
            currentUserContext: this.deps.currentUserContext,
            context,
            attendance,
            summary: 'Presença coletada off-line e sincronizada depois.',
            prisma: tx,
            metadata: {
              offlineClientId: item.clientId,
              offlineAttendanceAuthor: {
                userId: submittedById,
                name: normalizeOptionalString(item.authorName) ?? null,
                email: normalizeOptionalString(item.authorEmail) ?? null,
              },
              submittedById,
              committedById: submittedById,
            },
          }),
      });

      return {
        clientId: item.clientId,
        eventId: item.eventId,
        status: 'CREATED',
        attendance: toEventAttendance(attendance),
      };
    } catch (error: unknown) {
      if (
        !canCommitWithPermission &&
        await this.shouldStage(item.eventId, sender.id, error, context)
      ) {
        try {
          const stagedSubmission = await this.submissions.stage(item, context, {
            createdById,
            submittedById,
            stagedReason: errorMessage(error),
          });

          return {
            clientId: item.clientId,
            eventId: item.eventId,
            status: 'STAGED',
            message: 'Presença off-line enviada para revisão administrativa.',
            stagedSubmission,
          };
        } catch (stageError: unknown) {
          if (isRequiredLocationError(stageError)) {
            return {
              clientId: item.clientId,
              eventId: item.eventId,
              status: commitStatusForError(stageError),
              message: errorMessage(stageError),
            };
          }

          throw stageError;
        }
      }

      return {
        clientId: item.clientId,
        eventId: item.eventId,
        status: commitStatusForError(error),
        message: errorMessage(error),
      };
    }
  }

  private async canCommitWithPermission(eventId: string, context: GraphqlContext): Promise<boolean> {
    const user = getAuthenticatedUser(this.deps.currentUserContext, context);
    if (!user) {
      return false;
    }

    try {
      for (const permission of ATTENDANCE_COLLECTION_PERMISSIONS) {
        try {
          await this.deps.authorizationPolicy.assertPermissions(user, [permission], {
            eventId,
          });
          return true;
        } catch (error: unknown) {
          if (!(error instanceof ForbiddenException)) {
            throw error;
          }
        }
      }
      return false;
    } catch (error: unknown) {
      if (error instanceof ForbiddenException) {
        return false;
      }

      throw error;
    }
  }

  private async shouldStage(
    eventId: string,
    senderPersonId: string,
    error: unknown,
    context: GraphqlContext,
  ): Promise<boolean> {
    if (!(error instanceof HttpException)) {
      return false;
    }

    if (error instanceof ConflictException && errorMessage(error).includes('Presença já registrada')) {
      return false;
    }

    if (![400, 403, 404].includes(error.getStatus())) {
      return false;
    }

    const event = await this.deps.prisma.event.findFirst({
      where: {
        id: eventId,
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });
    if (!event) {
      return false;
    }

    try {
      await this.deps.authorizationPolicy.assertAttendanceCollectorForEvent(eventId, senderPersonId, {
        enforceCollectionWindow: false,
        user: getAuthenticatedUser(this.deps.currentUserContext, context),
      });
      return true;
    } catch {
      return false;
    }
  }
}
