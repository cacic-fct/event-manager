import { CommitOfflineEventAttendancesInput, OfflineEventAttendanceCommitResult } from '@cacic-fct/shared-data-types';
import { BadRequestException, ForbiddenException, HttpException } from '@nestjs/common';
import { AttendanceCreationMethod, Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { CurrentUserContextService } from '../context.service';
import { GraphqlContext } from '../selects';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { AttendanceCategoryService } from '../../events/attendance-category.service';
import { AuthorizationPolicyService } from '../../authorization/authorization-policy.service';
import { FrozenResourceService } from '../../common/frozen-resource.service';
import { DashboardInsightsService } from '../../dashboard/insights.service';
import { NovuNotificationsService } from '../../notifications/novu-notifications.service';
import { PrismaService } from '../../prisma/prisma.service';
import { classifyOfflineAttendanceError } from '../../events/attendances/offline-attendance-resolution';
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
import { OfflineAttendanceSubmissions, parseCommitReceiptMarker } from './attendance-collection-offline-submissions';
import { notifySportsMatchAttendanceMutation } from '../../sports/operations/sports-match-attendance';
import { SportsMutationEventsService } from '../../sports/realtime/sports-mutation-events.service';
import { verifyOfflineAttendanceCollectorCredential } from './offline-attendance-collector-credential';

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
  sportsMutationEvents?: SportsMutationEventsService;
};
type OfflineAttendanceItem = CommitOfflineEventAttendancesInput['attendances'][number];
type ExistingCommitReceipt = NonNullable<Awaited<ReturnType<OfflineAttendanceSubmissions['findCommitReceipt']>>>;

class ExistingOfflineCommitResult extends Error {
  constructor(readonly result: OfflineEventAttendanceCommitResult) {
    super('Offline attendance command was already processed.');
  }
}

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
    const payloadHash = this.payloadHash(item);
    const existingReceipt = await this.submissions.findCommitReceipt(item.clientId);
    if (existingReceipt && existingReceipt.status !== 'PENDING') {
      return this.resultForExistingReceipt(item, payloadHash, existingReceipt);
    }
    if (item.authorUserId !== submittedById) {
      try {
        const credential = item.collectorCredential
          ? verifyOfflineAttendanceCollectorCredential(item.collectorCredential, item.collectedAt)
          : null;
        if (!credential || credential.eventId !== item.eventId || credential.collectorUserId !== item.authorUserId) {
          return {
            clientId: item.clientId,
            eventId: item.eventId,
            status: 'FORBIDDEN',
            message: 'A credencial assinada do coletor off-line não corresponde a esta presença.',
          };
        }
      } catch {
        return {
          clientId: item.clientId,
          eventId: item.eventId,
          status: 'FORBIDDEN',
          message: 'A credencial assinada do coletor off-line é inválida ou expirou.',
        };
      }
    }
    const createdById = item.authorUserId;
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
        idempotencyKey: item.clientId,
        afterIdempotencyLock: async (tx) => {
          const receipt = await tx.offlineEventAttendanceSubmission.findUnique({
            where: { clientId: item.clientId },
            include: { event: true, person: true },
          });
          if (receipt?.status === 'PENDING' && !this.submissions.matchesPendingReceipt(item, receipt)) {
            throw new ExistingOfflineCommitResult(await this.resultForExistingReceipt(item, payloadHash, receipt, tx));
          }
          if (receipt && receipt.status !== 'PENDING') {
            throw new ExistingOfflineCommitResult(await this.resultForExistingReceipt(item, payloadHash, receipt, tx));
          }
        },
        input: {
          eventId: item.eventId,
          personId: person.id,
          createdByMethod: item.createdByMethod as AttendanceCreationMethod,
          createdById,
          committedById: submittedById,
          attendedAt: item.collectedAt,
          location: item.location,
        },
        afterCreate: async (attendance, tx) => {
          await recordAttendanceCreate({
            auditLog: this.deps.auditLog,
            currentUserContext: this.deps.currentUserContext,
            context,
            attendance,
            summary: 'Presença coletada off-line e sincronizada depois.',
            prisma: tx,
            metadata: {
              offlineClientId: item.clientId,
              offlineAttendanceAuthor: {
                userId: item.authorUserId,
                name: normalizeOptionalString(item.authorName) ?? null,
                email: normalizeOptionalString(item.authorEmail) ?? null,
              },
              submittedById,
              committedById: submittedById,
            },
          });
          await this.submissions.recordCommitReceipt(
            item,
            submittedById,
            submittedById,
            person.id,
            'CREATED',
            payloadHash,
            tx,
          );
        },
        afterCheckInStarted: (attendance) =>
          notifySportsMatchAttendanceMutation(this.deps.sportsMutationEvents, attendance),
      });
      return {
        clientId: item.clientId,
        eventId: item.eventId,
        status: 'CREATED',
        attendance: toEventAttendance(attendance),
      };
    } catch (error: unknown) {
      if (error instanceof ExistingOfflineCommitResult) {
        return error.result;
      }
      if (await this.shouldStage(item.eventId, sender.id, error, context, canCommitWithPermission)) {
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

      if (commitStatusForError(error) === 'DUPLICATE') {
        const person = await this.submissions.resolvePerson(item);
        try {
          await this.submissions.recordCommitReceipt(
            item,
            submittedById,
            submittedById,
            person.id,
            'DUPLICATE',
            payloadHash,
          );
        } catch {
          // The duplicate result is still authoritative even if the receipt
          // repair itself is temporarily unavailable.
        }
        const attendance = await this.deps.prisma.eventAttendance.findUnique({
          where: { personId_eventId: { personId: person.id, eventId: item.eventId } },
        });
        return {
          clientId: item.clientId,
          eventId: item.eventId,
          status: 'DUPLICATE',
          attendance: attendance ? toEventAttendance(attendance) : undefined,
          message: errorMessage(error),
        };
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

  private payloadHash(item: OfflineAttendanceItem): string {
    return createHash('sha256')
      .update(
        JSON.stringify({
          clientId: item.clientId,
          eventId: item.eventId,
          createdByMethod: item.createdByMethod,
          code: item.code ?? null,
          value: item.value ?? null,
          location: item.location,
          collectedAt: item.collectedAt.toISOString(),
          authorUserId: item.authorUserId,
          authorName: item.authorName ?? null,
          authorEmail: item.authorEmail ?? null,
        }),
      )
      .digest('hex');
  }

  private async resultForExistingReceipt(
    item: OfflineAttendanceItem,
    payloadHash: string,
    receipt: ExistingCommitReceipt,
    prisma: Prisma.TransactionClient | PrismaService = this.deps.prisma,
  ): Promise<OfflineEventAttendanceCommitResult> {
    const marker = parseCommitReceiptMarker(receipt.rejectionReason);
    if (receipt.status === 'COMMITTED' && !marker) {
      return {
        clientId: item.clientId,
        eventId: item.eventId,
        status: 'STAGED',
        message: 'Presença off-line enviada para revisão administrativa.',
        stagedSubmission: this.submissions.toResponse(receipt),
      };
    }
    if (receipt.status !== 'COMMITTED' || !marker || marker.payloadHash !== payloadHash) {
      return {
        clientId: item.clientId,
        eventId: item.eventId,
        status: 'CONFLICT',
        message: 'O mesmo identificador off-line foi reutilizado para outra presença.',
      };
    }

    const attendance = receipt.personId
      ? await prisma.eventAttendance.findUnique({
          where: {
            personId_eventId: {
              personId: receipt.personId,
              eventId: receipt.eventId,
            },
          },
        })
      : null;
    return {
      clientId: item.clientId,
      eventId: item.eventId,
      status: marker.status,
      attendance: attendance ? toEventAttendance(attendance) : undefined,
    };
  }

  private async shouldStage(
    eventId: string,
    senderPersonId: string,
    error: unknown,
    context: GraphqlContext,
    canCommitWithPermission: boolean,
  ): Promise<boolean> {
    if (!(error instanceof HttpException)) {
      return false;
    }

    const resolution = classifyOfflineAttendanceError(error);
    if (!resolution.stageable || resolution.issue === 'DUPLICATE_ATTENDANCE') {
      return false;
    }

    if (![400, 403, 404, 409].includes(error.getStatus())) {
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

    if (canCommitWithPermission) {
      return true;
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
