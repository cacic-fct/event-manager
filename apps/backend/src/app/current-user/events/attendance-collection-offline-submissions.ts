import {
  CommitOfflineEventAttendancesInput,
  EventAttendance,
  OfflineEventAttendanceSubmission,
} from '@cacic-fct/shared-data-types';
import { Permission } from '@cacic-fct/shared-permissions';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { AttendanceCreationMethod, AuditLogEntityType, AuditLogOperation, Prisma } from '@prisma/client';
import { CurrentUserContextService } from '../context.service';
import { GraphqlContext } from '../selects';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { DashboardInsightsService } from '../../dashboard/insights.service';
import { NovuNotificationsService } from '../../notifications/novu-notifications.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  errorMessage,
  getAuthenticatedUser,
  normalizeOptionalString,
  parseUserAztecCode,
  scannerUserIdForStorage,
} from './attendance-collection-context';
import { classifyOfflineAttendanceMessage } from '../../events/attendances/offline-attendance-resolution';
import { findSinglePersonForManualInput, getRequiredAttendanceLocationData } from './attendance-collection-records';
import { notifyOfflineAttendanceReviewQueued } from './attendance-collection-offline-notifications';

type OfflineAttendanceItem = CommitOfflineEventAttendancesInput['attendances'][number];
type OfflineAttendanceSubmissionMetadata = {
  createdById: string;
  submittedById: string;
  stagedReason: string;
};
type ResolvedOfflineAttendancePerson = {
  personId: string | null;
  errorMessage?: string;
};
type AttendanceLocationData = {
  collectedLatitude: number;
  collectedLongitude: number;
  collectedAccuracyMeters: number;
};

export class OfflineAttendanceSubmissions {
  constructor(
    private readonly prisma: PrismaService,
    private readonly currentUserContext: CurrentUserContextService,
    private readonly auditLog: AuditLogService,
    private readonly dashboardInsights: DashboardInsightsService,
    private readonly notifications: NovuNotificationsService,
  ) {}

  async stage(
    item: OfflineAttendanceItem,
    context: GraphqlContext,
    metadata: OfflineAttendanceSubmissionMetadata,
  ): Promise<OfflineEventAttendanceSubmission> {
    const resolvedPerson = await this.tryResolvePerson(item);
    const locationData = getRequiredAttendanceLocationData(item.location);
    const submissionWrite = await this.write(item, metadata, resolvedPerson, locationData);
    const submission = submissionWrite.submission;

    if (!submissionWrite.changed) {
      return this.toOfflineSubmission(submission);
    }

    await this.auditLog.record({
      entityType: AuditLogEntityType.EVENT_ATTENDANCE,
      entityId: submission.personId
        ? this.auditLog.buildCompositeEntityId([submission.personId, submission.eventId])
        : `offline:${submission.id}`,
      entityLabel: submission.id,
      operation: AuditLogOperation.CREATE,
      actor: getAuthenticatedUser(this.currentUserContext, context),
      after: {
        id: submission.id,
        clientId: submission.clientId,
        eventId: submission.eventId,
        personId: submission.personId,
        authorUserId: submission.authorUserId,
        submittedById: submission.submittedById,
        stagedReason: submission.stagedReason,
        resolutionError: submission.resolutionError,
      },
      scope: {
        permission: Permission.EventAttendance.Collect,
        eventId: submission.eventId,
      },
      summary: 'Presença off-line enviada para revisão administrativa.',
    });
    await this.dashboardInsights.invalidateCachedInsights();
    if (submissionWrite.queuedForReview) {
      await notifyOfflineAttendanceReviewQueued({
        prisma: this.prisma,
        notifications: this.notifications,
        submission,
      });
    }

    return this.toOfflineSubmission(submission);
  }

  async resolvePerson(item: OfflineAttendanceItem): Promise<{ id: string }> {
    switch (item.createdByMethod) {
      case AttendanceCreationMethod.SCANNER: {
        const userId = item.code ? parseUserAztecCode(item.code) : null;
        if (!userId) {
          throw new BadRequestException('Código Aztec incompatível.');
        }

        const person = await this.prisma.people.findFirst({
          where: {
            userId,
            deletedAt: null,
            mergedIntoId: null,
          },
          select: {
            id: true,
          },
        });
        if (!person) {
          throw new NotFoundException(`Person for user ${userId} was not found.`);
        }

        return person;
      }
      case AttendanceCreationMethod.MANUAL_INPUT:
        return findSinglePersonForManualInput(this.prisma, item.value ?? '');
      default:
        throw new BadRequestException('Origem da presença off-line incompatível.');
    }
  }

  private async tryResolvePerson(item: OfflineAttendanceItem): Promise<ResolvedOfflineAttendancePerson> {
    try {
      const person = await this.resolvePerson(item);
      return { personId: person.id };
    } catch (error: unknown) {
      if (
        !(error instanceof BadRequestException) &&
        !(error instanceof NotFoundException) &&
        !(error instanceof ConflictException)
      ) {
        throw error;
      }
      return { personId: null, errorMessage: errorMessage(error) };
    }
  }

  private async write(
    item: OfflineAttendanceItem,
    metadata: OfflineAttendanceSubmissionMetadata,
    resolvedPerson: ResolvedOfflineAttendancePerson,
    locationData: AttendanceLocationData,
  ) {
    const where = this.where(metadata.submittedById, item.clientId);
    const existing = await this.prisma.offlineEventAttendanceSubmission.findUnique({
      where,
      include: {
        event: true,
      },
    });

    if (existing) {
      if (existing.status !== 'PENDING') {
        return { submission: existing, changed: false, queuedForReview: false };
      }

      return this.updatePending(item, metadata, resolvedPerson, locationData);
    }

    try {
      return {
        submission: await this.prisma.offlineEventAttendanceSubmission.create({
          data: {
            clientId: item.clientId,
            eventId: item.eventId,
            personId: resolvedPerson.personId,
            createdByMethod: item.createdByMethod,
            scannerCode: this.scannerCodeForStorage(item),
            manualValue: normalizeOptionalString(item.value),
            collectedAt: item.collectedAt,
            authorUserId: metadata.createdById,
            authorName: normalizeOptionalString(item.authorName),
            authorEmail: normalizeOptionalString(item.authorEmail),
            submittedById: metadata.submittedById,
            stagedReason: metadata.stagedReason,
            resolutionError: resolvedPerson.errorMessage,
            ...locationData,
          },
          include: {
            event: true,
          },
        }),
        changed: true,
        queuedForReview: true,
      };
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return this.updatePending(item, metadata, resolvedPerson, locationData);
      }

      throw error;
    }
  }

  private async updatePending(
    item: OfflineAttendanceItem,
    metadata: Pick<OfflineAttendanceSubmissionMetadata, 'submittedById' | 'stagedReason'>,
    resolvedPerson: ResolvedOfflineAttendancePerson,
    locationData: AttendanceLocationData,
  ) {
    const update = await this.prisma.offlineEventAttendanceSubmission.updateMany({
      where: {
        submittedById: metadata.submittedById,
        clientId: item.clientId,
        status: 'PENDING',
      },
      data: {
        stagedReason: metadata.stagedReason,
        resolutionError: resolvedPerson.errorMessage ?? null,
        personId: resolvedPerson.personId,
        scannerCode: this.scannerCodeForStorage(item),
        manualValue: normalizeOptionalString(item.value) ?? null,
        collectedLatitude: locationData.collectedLatitude,
        collectedLongitude: locationData.collectedLongitude,
        collectedAccuracyMeters: locationData.collectedAccuracyMeters,
      },
    });
    const submission = await this.prisma.offlineEventAttendanceSubmission.findUniqueOrThrow({
      where: this.where(metadata.submittedById, item.clientId),
      include: {
        event: true,
      },
    });

    return {
      submission,
      changed: update.count === 1,
      queuedForReview: false,
    };
  }

  private scannerCodeForStorage(item: OfflineAttendanceItem): string | null {
    return item.createdByMethod === AttendanceCreationMethod.SCANNER ? scannerUserIdForStorage(item.code) : null;
  }

  private where(submittedById: string, clientId: string) {
    return {
      submittedById_clientId: {
        submittedById,
        clientId,
      },
    };
  }

  private toOfflineSubmission(submission: {
    id: string;
    clientId: string;
    eventId: string;
    event?: OfflineEventAttendanceSubmission['event'] | null;
    personId: string | null;
    person?: OfflineEventAttendanceSubmission['person'] | null;
    status: OfflineEventAttendanceSubmission['status'];
    createdByMethod: EventAttendance['createdByMethod'];
    scannerCode: string | null;
    manualValue: string | null;
    collectedAt: Date;
    authorUserId: string | null;
    authorName: string | null;
    authorEmail: string | null;
    submittedById: string;
    submittedAt: Date;
    stagedReason: string | null;
    resolutionError: string | null;
    collectedLatitude: number | null;
    collectedLongitude: number | null;
    collectedAccuracyMeters: number | null;
    committedAt: Date | null;
    committedById: string | null;
    rejectedAt: Date | null;
    rejectedById: string | null;
    rejectionReason: string | null;
  }): OfflineEventAttendanceSubmission {
    return {
      ...submission,
      event: submission.event ?? undefined,
      personId: submission.personId ?? undefined,
      person: submission.person ?? undefined,
      scannerCode: submission.scannerCode ?? undefined,
      manualValue: submission.manualValue ?? undefined,
      authorUserId: submission.authorUserId ?? undefined,
      authorName: submission.authorName ?? undefined,
      authorEmail: submission.authorEmail ?? undefined,
      stagedReason: submission.stagedReason ?? undefined,
      resolutionError: submission.resolutionError ?? undefined,
      resolutionIssue: classifyOfflineAttendanceMessage(submission.resolutionError ?? submission.stagedReason),
      collectedLatitude: submission.collectedLatitude ?? undefined,
      collectedLongitude: submission.collectedLongitude ?? undefined,
      collectedAccuracyMeters: submission.collectedAccuracyMeters ?? undefined,
      committedAt: submission.committedAt ?? undefined,
      committedById: submission.committedById ?? undefined,
      rejectedAt: submission.rejectedAt ?? undefined,
      rejectedById: submission.rejectedById ?? undefined,
      rejectionReason: submission.rejectionReason ?? undefined,
    };
  }
}
