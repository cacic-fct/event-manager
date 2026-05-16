import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { MajorEventReceipt, Prisma, ReceiptValidationActionType, SubscriptionStatus } from '@prisma/client';
import { Queue } from 'bullmq';
import { randomUUID } from 'crypto';
import { extname } from 'path';
import { Readable } from 'stream';
import { KeycloakAuthService } from '../auth/keycloak-auth.service';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { CurrentUserContextService } from '../current-user/context.service';
import { GraphqlContext } from '../current-user/selects';
import { DashboardInsightsService } from '../dashboard/insights.service';
import { AttendanceCategoryService } from '../events/attendance-category.service';
import {
  MajorEventSubscriptionNotificationRecord,
  NovuNotificationsService,
} from '../notifications/novu-notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';
import {
  CurrentUserReceiptResponse,
  AdminReceiptQueueItem,
  AdminReceiptQueueResponse,
  AdminReceiptValidationResult,
  MAJOR_EVENT_RECEIPTS_QUEUE,
  MAX_RECEIPT_FILE_SIZE_BYTES,
  RECEIPT_ADMIN_PERMISSION,
  ReceiptRejectionCode,
  ReceiptProcessingJob,
  UploadedReceiptFile,
} from './receipt.types';

const RECEIPT_UPLOAD_INTERVAL_MS = 60_000;

@Injectable()
export class MajorEventReceiptsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly currentUserContext: CurrentUserContextService,
    private readonly attendanceCategories: AttendanceCategoryService,
    private readonly dashboardInsights: DashboardInsightsService,
    private readonly keycloakAuthService: KeycloakAuthService,
    private readonly notifications: NovuNotificationsService,
    @InjectQueue(MAJOR_EVENT_RECEIPTS_QUEUE)
    private readonly receiptQueue: Queue<ReceiptProcessingJob>,
  ) {}

  async getCurrentReceipt(majorEventId: string, authenticatedUser: AuthenticatedUser): Promise<CurrentUserReceiptResponse | null> {
    const person = await this.currentUserContext.requireCurrentPerson(this.buildUserContext(authenticatedUser));
    const receipt = await this.prisma.majorEventReceipt.findFirst({
      where: {
        majorEventId,
        personId: person.id,
      },
      orderBy: {
        uploadedAt: 'desc',
      },
    });

    return receipt ? this.mapReceipt(receipt) : null;
  }

  async getPendingValidationCount(): Promise<{ pendingCount: number }> {
    const pendingCount = await this.prisma.majorEventSubscription.count({
      where: {
        deletedAt: null,
        subscriptionStatus: SubscriptionStatus.RECEIPT_UNDER_REVIEW,
        majorEvent: {
          deletedAt: null,
          isPaymentRequired: true,
        },
      },
    });

    return { pendingCount };
  }

  async listPendingValidationQueue(majorEventId?: string): Promise<AdminReceiptQueueResponse> {
    const where = {
      deletedAt: null,
      subscriptionStatus: SubscriptionStatus.RECEIPT_UNDER_REVIEW,
      ...(majorEventId ? { majorEventId } : {}),
      majorEvent: {
        deletedAt: null,
        isPaymentRequired: true,
      },
    } satisfies Prisma.MajorEventSubscriptionWhereInput;

    const [pendingCount, subscriptions] = await Promise.all([
      this.prisma.majorEventSubscription.count({ where }),
      this.prisma.majorEventSubscription.findMany({
        where,
        select: this.adminQueueSubscriptionSelect(),
        orderBy: [
          {
            updatedAt: 'asc',
          },
          {
            createdAt: 'asc',
          },
        ],
        take: 100,
      }),
    ]);

    return {
      pendingCount,
      items: subscriptions.map((subscription) => this.mapAdminQueueItem(subscription)),
    };
  }

  async approveReceipt(
    subscriptionId: string,
    receiptId: string,
    authenticatedUser: AuthenticatedUser,
  ): Promise<AdminReceiptValidationResult> {
    const actorId = this.getActorId(authenticatedUser);
    const result = await this.prisma.$transaction(async (tx) => {
      const subscription = await this.findActionableSubscription(tx, subscriptionId, receiptId);
      const selectedEventIds = subscription.selectedEvents.map((selection) => selection.eventId);
      const now = new Date();

      const action = await tx.majorEventReceiptValidationAction.create({
        data: {
          subscriptionId,
          receiptId,
          action: ReceiptValidationActionType.APPROVE,
          previousStatus: subscription.subscriptionStatus,
          nextStatus: SubscriptionStatus.CONFIRMED,
          previousRejectionReason: subscription.receiptRejectionReason,
          createdById: actorId,
        },
      });

      await tx.majorEventSubscription.update({
        where: {
          id: subscriptionId,
        },
        data: {
          subscriptionStatus: SubscriptionStatus.CONFIRMED,
          receiptRejectionReason: null,
          receiptValidatedAt: now,
          receiptValidatedBy: actorId,
        },
      });

      await this.syncConfirmedEventSubscriptions(
        tx,
        subscription.majorEventId,
        subscription.personId,
        selectedEventIds,
        SubscriptionStatus.CONFIRMED,
        actorId,
      );
      await this.attendanceCategories.refreshForMajorEventPerson(subscription.majorEventId, subscription.personId, tx);
      await this.refreshEventSubscriptionCounters(tx, selectedEventIds);

      return action;
    });

    const item = await this.getSubscriptionQueueItem(subscriptionId);
    if (!item) {
      throw new NotFoundException(`Subscription ${subscriptionId} was not found after receipt approval ${result.id}.`);
    }
    const notificationRecord = await this.findMajorEventSubscriptionNotificationRecord(subscriptionId);
    if (notificationRecord) {
      await this.notifications.notifyMajorEventSubscriptionRecordChanged(SubscriptionStatus.RECEIPT_UNDER_REVIEW, notificationRecord);
    }
    await this.dashboardInsights.invalidateCachedInsights();
    return {
      actionId: result.id,
      item,
    };
  }

  async rejectReceipt(
    subscriptionId: string,
    receiptId: string | undefined,
    rejectionCode: ReceiptRejectionCode,
    reason: string | undefined,
    authenticatedUser: AuthenticatedUser,
  ): Promise<AdminReceiptValidationResult> {
    const actorId = this.getActorId(authenticatedUser);
    const nextStatus = this.rejectionStatus(rejectionCode);
    const normalizedReason = this.normalizeRejectionReason(reason);

    if (nextStatus === SubscriptionStatus.REJECTED_INVALID_RECEIPT && !normalizedReason) {
      throw new BadRequestException('A rejection reason is required for invalid receipts.');
    }

    const action = await this.prisma.$transaction(async (tx) => {
      const subscription = await this.findActionableSubscription(tx, subscriptionId, receiptId);
      const now = new Date();

      const createdAction = await tx.majorEventReceiptValidationAction.create({
        data: {
          subscriptionId,
          receiptId: receiptId ?? null,
          action: ReceiptValidationActionType.REJECT,
          previousStatus: subscription.subscriptionStatus,
          nextStatus,
          previousRejectionReason: subscription.receiptRejectionReason,
          nextRejectionReason: normalizedReason,
          createdById: actorId,
        },
      });

      await tx.majorEventSubscription.update({
        where: {
          id: subscriptionId,
        },
        data: {
          subscriptionStatus: nextStatus,
          receiptRejectionReason: normalizedReason,
          receiptValidatedAt: now,
          receiptValidatedBy: actorId,
        },
      });

      await this.attendanceCategories.refreshForMajorEventPerson(subscription.majorEventId, subscription.personId, tx);
      return createdAction;
    });

    const item = await this.getSubscriptionQueueItem(subscriptionId);
    if (!item) {
      throw new NotFoundException(`Subscription ${subscriptionId} was not found after receipt rejection.`);
    }
    const notificationRecord = await this.findMajorEventSubscriptionNotificationRecord(subscriptionId);
    if (notificationRecord) {
      await this.notifications.notifyMajorEventSubscriptionRecordChanged(SubscriptionStatus.RECEIPT_UNDER_REVIEW, notificationRecord);
    }
    await this.dashboardInsights.invalidateCachedInsights();
    return {
      actionId: action.id,
      item,
    };
  }

  async undoValidationAction(actionId: string, authenticatedUser: AuthenticatedUser): Promise<AdminReceiptQueueItem> {
    const actorId = this.getActorId(authenticatedUser);

    const action = await this.prisma.$transaction(async (tx) => {
      const existingAction = await tx.majorEventReceiptValidationAction.findUnique({
        where: {
          id: actionId,
        },
        include: {
          subscription: {
            include: {
              selectedEvents: {
                where: {
                  deletedAt: null,
                },
                select: {
                  eventId: true,
                },
              },
              receipts: {
                orderBy: {
                  uploadedAt: 'desc',
                },
                take: 1,
                select: {
                  id: true,
                },
              },
            },
          },
        },
      });

      if (!existingAction || existingAction.undoneAt) {
        throw new NotFoundException(`Validation action ${actionId} was not found.`);
      }

      const latestReceipt = existingAction.subscription.receipts[0];
      if (
        existingAction.subscription.subscriptionStatus !== existingAction.nextStatus ||
        (existingAction.receiptId ? latestReceipt?.id !== existingAction.receiptId : false)
      ) {
        throw new ConflictException('This validation action can no longer be undone because the subscription changed.');
      }

      const selectedEventIds = existingAction.subscription.selectedEvents.map((selection) => selection.eventId);
      const now = new Date();

      await tx.majorEventSubscription.update({
        where: {
          id: existingAction.subscriptionId,
        },
        data: {
          subscriptionStatus: existingAction.previousStatus,
          receiptRejectionReason: existingAction.previousRejectionReason,
          receiptValidatedAt: null,
          receiptValidatedBy: null,
        },
      });

      await tx.majorEventReceiptValidationAction.update({
        where: {
          id: actionId,
        },
        data: {
          undoneAt: now,
          undoneById: actorId,
        },
      });

      await this.syncConfirmedEventSubscriptions(
        tx,
        existingAction.subscription.majorEventId,
        existingAction.subscription.personId,
        selectedEventIds,
        existingAction.previousStatus,
        actorId,
      );
      await this.attendanceCategories.refreshForMajorEventPerson(
        existingAction.subscription.majorEventId,
        existingAction.subscription.personId,
        tx,
      );
      await this.refreshEventSubscriptionCounters(tx, selectedEventIds);

      return existingAction;
    });

    const item = await this.getSubscriptionQueueItem(action.subscriptionId);
    if (!item) {
      throw new NotFoundException(`Subscription ${action.subscriptionId} was not found after undo.`);
    }
    const notificationRecord = await this.findMajorEventSubscriptionNotificationRecord(action.subscriptionId);
    if (notificationRecord) {
      await this.notifications.notifyMajorEventSubscriptionRecordChanged(action.nextStatus, notificationRecord);
    }
    await this.dashboardInsights.invalidateCachedInsights();
    return item;
  }

  async uploadReceipt(
    majorEventId: string,
    file: UploadedReceiptFile | undefined,
    authenticatedUser: AuthenticatedUser,
  ): Promise<CurrentUserReceiptResponse> {
    this.assertValidUpload(file);

    const person = await this.currentUserContext.requireCurrentPerson(this.buildUserContext(authenticatedUser));
    const subscription = await this.prisma.majorEventSubscription.findFirst({
      where: {
        majorEventId,
        personId: person.id,
        deletedAt: null,
      },
      select: {
        id: true,
        subscriptionStatus: true,
        majorEvent: {
          select: {
            id: true,
            isPaymentRequired: true,
            subscriptionEndDate: true,
          },
        },
      },
    });

    if (!subscription) {
      throw new NotFoundException(`Subscription for major event ${majorEventId} was not found.`);
    }

    if (!subscription.majorEvent.isPaymentRequired) {
      throw new BadRequestException(`Major event ${majorEventId} does not require receipt upload.`);
    }

    if (subscription.majorEvent.subscriptionEndDate && new Date() > subscription.majorEvent.subscriptionEndDate) {
      throw new BadRequestException(`Receipt uploads for major event ${majorEventId} are closed.`);
    }

    if (subscription.subscriptionStatus === SubscriptionStatus.CONFIRMED) {
      throw new BadRequestException(`Subscription for major event ${majorEventId} is already confirmed.`);
    }

    if (subscription.subscriptionStatus === SubscriptionStatus.CANCELED) {
      throw new BadRequestException(`Subscription for major event ${majorEventId} is canceled.`);
    }

    await this.assertUploadRateLimit(subscription.id);

    const receiptId = randomUUID();
    const uploadedAt = new Date();
    const expiresAt = new Date(uploadedAt.getTime() + 365 * 24 * 60 * 60 * 1000);
    const objectKey = this.buildReceiptObjectKey(majorEventId, subscription.id, receiptId, file.originalname, file.mimetype);

    const uploadResult = await this.s3.uploadFile(
      objectKey,
      file.buffer,
      file.mimetype,
      {
        majorEventId,
        subscriptionId: subscription.id,
        personId: person.id,
        receiptId,
        expiresAt: expiresAt.toISOString(),
      },
      expiresAt,
    );

    const receipt = await this.prisma.$transaction(async (tx) => {
      const createdReceipt = await tx.majorEventReceipt.create({
        data: {
          id: receiptId,
          subscriptionId: subscription.id,
          majorEventId,
          personId: person.id,
          objectKey: uploadResult.key,
          fileName: file.originalname || 'comprovante',
          mimeType: file.mimetype,
          sizeBytes: uploadResult.size,
          expiresAt,
          uploadedAt,
          uploadedBy: authenticatedUser.sub,
        },
      });

      const updateResult = await tx.majorEventSubscription.updateMany({
        where: {
          id: subscription.id,
          subscriptionStatus: {
            notIn: [SubscriptionStatus.CONFIRMED, SubscriptionStatus.CANCELED],
          },
        },
        data: {
          subscriptionStatus: SubscriptionStatus.RECEIPT_UNDER_REVIEW,
          receiptRejectionReason: null,
          receiptValidatedAt: null,
          receiptValidatedBy: null,
        },
      });
      if (updateResult.count !== 1) {
        throw new ConflictException(`Subscription for major event ${majorEventId} cannot receive a new receipt.`);
      }
      await this.attendanceCategories.refreshForMajorEventPerson(majorEventId, person.id, tx);

      return createdReceipt;
    });

    await this.receiptQueue.add(
      'process',
      { receiptId: receipt.id },
      {
        jobId: receipt.id,
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 30_000,
        },
        removeOnComplete: {
          age: 365 * 24 * 60 * 60,
        },
        removeOnFail: false,
      },
    );

    await this.dashboardInsights.invalidateCachedInsights();
    return this.mapReceipt(receipt);
  }

  async getReceiptImage(
    receiptId: string,
    authenticatedUser: AuthenticatedUser,
  ): Promise<{
    stream: Readable;
    contentType: string;
    contentLength?: number;
  }> {
    const receipt = await this.prisma.majorEventReceipt.findUnique({
      where: {
        id: receiptId,
      },
      select: {
        id: true,
        personId: true,
        objectKey: true,
        mimeType: true,
        expiresAt: true,
      },
    });

    if (!receipt) {
      throw new NotFoundException(`Receipt ${receiptId} was not found.`);
    }

    if (receipt.expiresAt < new Date()) {
      throw new GoneException(`Receipt ${receiptId} image has expired.`);
    }

    await this.assertCanReadReceipt(receipt.personId, authenticatedUser);

    const file = await this.s3.downloadFile(receipt.objectKey);
    return {
      stream: file.stream,
      contentType: file.contentType ?? receipt.mimeType,
      contentLength: file.contentLength,
    };
  }

  private assertValidUpload(file: UploadedReceiptFile | undefined): asserts file is UploadedReceiptFile {
    if (!file) {
      throw new BadRequestException('Receipt image file is required.');
    }

    if (!file.mimetype.startsWith('image/')) {
      throw new BadRequestException('Receipt must be an image.');
    }

    if (file.size > MAX_RECEIPT_FILE_SIZE_BYTES) {
      throw new BadRequestException('Receipt image must be at most 15 MB.');
    }
  }

  private adminQueueSubscriptionSelect() {
    return {
      id: true,
      majorEventId: true,
      majorEvent: {
        select: {
          name: true,
        },
      },
      personId: true,
      person: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
        },
      },
      amountPaid: true,
      paymentTier: true,
      subscriptionStatus: true,
      receiptRejectionReason: true,
      updatedAt: true,
      selectedEvents: {
        where: {
          deletedAt: null,
        },
        select: {
          event: {
            select: {
              id: true,
              name: true,
              emoji: true,
              type: true,
              startDate: true,
              endDate: true,
              locationDescription: true,
              slots: true,
              slotsAvailable: true,
            },
          },
        },
        orderBy: {
          event: {
            startDate: 'asc',
          },
        },
      },
      receipts: {
        orderBy: {
          uploadedAt: 'desc',
        },
        take: 1,
      },
    } satisfies Prisma.MajorEventSubscriptionSelect;
  }

  private mapAdminQueueItem(
    subscription: Prisma.MajorEventSubscriptionGetPayload<{
      select: ReturnType<MajorEventReceiptsService['adminQueueSubscriptionSelect']>;
    }>,
  ): AdminReceiptQueueItem {
    const events = subscription.selectedEvents.map((selection) => selection.event);
    const conflictIds = this.getScheduleConflictEventIds(events);
    const latestReceipt = subscription.receipts[0];
    const hasOcrMatch =
      latestReceipt?.amountMatched === true ||
      latestReceipt?.nameMatched === true ||
      Boolean(latestReceipt?.matchedAmountText) ||
      Boolean(latestReceipt?.matchedNameText);

    return {
      subscriptionId: subscription.id,
      majorEventId: subscription.majorEventId,
      majorEventName: subscription.majorEvent.name,
      personId: subscription.personId,
      personName: subscription.person.name,
      personEmail: subscription.person.email,
      personPhone: subscription.person.phone,
      amountPaid: subscription.amountPaid,
      paymentTier: subscription.paymentTier,
      subscriptionStatus: subscription.subscriptionStatus,
      subscriptionUpdatedAt: subscription.updatedAt,
      receiptRejectionReason: subscription.receiptRejectionReason,
      receipt: latestReceipt
        ? {
            id: latestReceipt.id,
            fileName: latestReceipt.fileName,
            mimeType: latestReceipt.mimeType,
            sizeBytes: latestReceipt.sizeBytes,
            uploadedAt: latestReceipt.uploadedAt,
            expiresAt: latestReceipt.expiresAt,
            imageUrl: `/api/major-event-receipts/${latestReceipt.id}/image`,
            processingStatus: latestReceipt.processingStatus,
            ocrText: latestReceipt.ocrText,
            amountMatched: hasOcrMatch ? latestReceipt.amountMatched : null,
            matchedAmountText: hasOcrMatch ? latestReceipt.matchedAmountText : null,
            nameMatched: hasOcrMatch ? latestReceipt.nameMatched : null,
            matchedNameText: hasOcrMatch ? latestReceipt.matchedNameText : null,
          }
        : null,
      events: events.map((event) => ({
        id: event.id,
        name: event.name,
        emoji: event.emoji,
        type: event.type,
        startDate: event.startDate,
        endDate: event.endDate,
        locationDescription: event.locationDescription,
        slots: event.slots,
        slotsAvailable: event.slotsAvailable,
        hasScheduleConflict: conflictIds.has(event.id),
        hasNoSlots: event.slotsAvailable != null && event.slotsAvailable <= 0,
      })),
    };
  }

  private async getSubscriptionQueueItem(subscriptionId: string): Promise<AdminReceiptQueueItem | null> {
    const subscription = await this.prisma.majorEventSubscription.findUnique({
      where: {
        id: subscriptionId,
      },
      select: this.adminQueueSubscriptionSelect(),
    });

    return subscription ? this.mapAdminQueueItem(subscription) : null;
  }

  private async findMajorEventSubscriptionNotificationRecord(
    id: string,
  ): Promise<MajorEventSubscriptionNotificationRecord | null> {
    return this.prisma.majorEventSubscription.findUnique({
      where: {
        id,
      },
      select: {
        id: true,
        majorEventId: true,
        subscriptionStatus: true,
        receiptRejectionReason: true,
        majorEvent: {
          select: {
            name: true,
          },
        },
        person: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            userId: true,
            user: {
              select: {
                id: true,
                email: true,
                name: true,
              },
            },
          },
        },
      },
    });
  }

  private async findActionableSubscription(
    tx: Prisma.TransactionClient,
    subscriptionId: string,
    receiptId: string | undefined,
  ): Promise<
    Prisma.MajorEventSubscriptionGetPayload<{
      include: {
        selectedEvents: {
          select: {
            eventId: true;
          };
        };
        receipts: {
          select: {
            id: true;
          };
        };
      };
    }>
  > {
    const subscription = await tx.majorEventSubscription.findUnique({
      where: {
        id: subscriptionId,
      },
      include: {
        selectedEvents: {
          where: {
            deletedAt: null,
          },
          select: {
            eventId: true,
          },
        },
        receipts: {
          orderBy: {
            uploadedAt: 'desc',
          },
          take: 1,
          select: {
            id: true,
          },
        },
      },
    });

    if (!subscription || subscription.deletedAt) {
      throw new NotFoundException(`Subscription ${subscriptionId} was not found.`);
    }

    if (subscription.subscriptionStatus !== SubscriptionStatus.RECEIPT_UNDER_REVIEW) {
      throw new ConflictException('This receipt has already been validated.');
    }

    if (receiptId && subscription.receipts[0]?.id !== receiptId) {
      throw new ConflictException('A newer receipt has been uploaded for this subscription.');
    }

    return subscription;
  }

  private async syncConfirmedEventSubscriptions(
    tx: Prisma.TransactionClient,
    majorEventId: string,
    personId: string,
    selectedEventIds: string[],
    status: SubscriptionStatus,
    actorId: string,
  ): Promise<void> {
    const selectedEventIdSet = new Set(selectedEventIds);
    const activeSubscriptions = await tx.eventSubscription.findMany({
      where: {
        personId,
        deletedAt: null,
        event: {
          majorEventId,
          deletedAt: null,
        },
      },
      select: {
        eventId: true,
      },
    });
    const activeEventIdSet = new Set(activeSubscriptions.map((subscription) => subscription.eventId));
    const now = new Date();
    const eventIdsToArchive = [...activeEventIdSet].filter(
      (eventId) => status !== SubscriptionStatus.CONFIRMED || !selectedEventIdSet.has(eventId),
    );

    if (eventIdsToArchive.length > 0) {
      await tx.eventSubscription.updateMany({
        where: {
          personId,
          eventId: {
            in: eventIdsToArchive,
          },
          deletedAt: null,
        },
        data: {
          deletedAt: now,
        },
      });
    }

    const eventIdsToCreate =
      status === SubscriptionStatus.CONFIRMED
        ? selectedEventIds.filter((eventId) => !activeEventIdSet.has(eventId))
        : [];
    if (eventIdsToCreate.length > 0) {
      await tx.eventSubscription.createMany({
        data: eventIdsToCreate.map((eventId) => ({
          eventId,
          personId,
          createdById: actorId,
          createdByMethod: 'ADMIN_DASHBOARD',
        })),
      });
    }
  }

  private async refreshEventSubscriptionCounters(tx: Prisma.TransactionClient, eventIds: string[]): Promise<void> {
    const uniqueEventIds = [...new Set(eventIds)];
    if (uniqueEventIds.length === 0) {
      return;
    }

    await Promise.all(
      uniqueEventIds.map(
        (eventId) =>
          tx.$executeRaw`
          UPDATE "events" event
          SET
            "queueCount" = (
              SELECT COUNT(*)::INTEGER
              FROM "major_event_subscription_event_selections" selection
              JOIN "major_event_subscriptions" subscription
                ON subscription."id" = selection."subscriptionId"
              WHERE selection."eventId" = ${eventId}
                AND selection."deletedAt" IS NULL
                AND subscription."deletedAt" IS NULL
                AND subscription."subscriptionStatus" NOT IN ('CONFIRMED', 'CANCELED')
            ),
            "slotsAvailable" = CASE
              WHEN event."slots" IS NULL THEN NULL
              ELSE event."slots" - (
                SELECT COUNT(*)::INTEGER
                FROM "event_subscriptions" event_subscription
                WHERE event_subscription."eventId" = ${eventId}
                  AND event_subscription."deletedAt" IS NULL
              )
            END
          WHERE event."id" = ${eventId}
        `,
      ),
    );
  }

  private getScheduleConflictEventIds(events: Array<{ id: string; startDate: Date; endDate: Date }>): Set<string> {
    const conflictIds = new Set<string>();
    for (const event of events) {
      for (const otherEvent of events) {
        if (event.id === otherEvent.id) {
          continue;
        }
        if (event.startDate < otherEvent.endDate && otherEvent.startDate < event.endDate) {
          conflictIds.add(event.id);
          conflictIds.add(otherEvent.id);
        }
      }
    }
    return conflictIds;
  }

  private rejectionStatus(rejectionCode: ReceiptRejectionCode): SubscriptionStatus {
    switch (rejectionCode) {
      case 'INVALID_RECEIPT':
        return SubscriptionStatus.REJECTED_INVALID_RECEIPT;
      case 'NO_SLOTS':
        return SubscriptionStatus.REJECTED_NO_SLOTS;
      case 'SCHEDULE_CONFLICT':
        return SubscriptionStatus.REJECTED_SCHEDULE_CONFLICT;
      case 'GENERIC':
        return SubscriptionStatus.REJECTED_GENERIC;
    }
  }

  private normalizeRejectionReason(reason: string | undefined): string | null {
    const normalized = reason?.trim();
    return normalized ? normalized : null;
  }

  private getActorId(authenticatedUser: AuthenticatedUser): string {
    return authenticatedUser.sub ?? authenticatedUser.email ?? '';
  }

  private async assertUploadRateLimit(subscriptionId: string): Promise<void> {
    const latestReceipt = await this.prisma.majorEventReceipt.findFirst({
      where: {
        subscriptionId,
      },
      select: {
        uploadedAt: true,
      },
      orderBy: {
        uploadedAt: 'desc',
      },
    });

    if (latestReceipt && latestReceipt.uploadedAt.getTime() > Date.now() - RECEIPT_UPLOAD_INTERVAL_MS) {
      throw new HttpException('Wait a moment before sending another receipt.', HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  private async assertCanReadReceipt(personId: string, authenticatedUser: AuthenticatedUser): Promise<void> {
    if (await this.hasAdminReceiptReadPermission(authenticatedUser)) {
      return;
    }

    const { person } = await this.currentUserContext.resolveCurrentUserContext(authenticatedUser);
    if (person?.id === personId) {
      return;
    }

    throw new ForbiddenException('You cannot access this receipt.');
  }

  private async hasAdminReceiptReadPermission(authenticatedUser: AuthenticatedUser): Promise<boolean> {
    if (authenticatedUser.permissionSet.has(RECEIPT_ADMIN_PERMISSION)) {
      return true;
    }

    const grantedPermissions = await this.keycloakAuthService.evaluateAccessTokenPermissions(authenticatedUser.token, [
      RECEIPT_ADMIN_PERMISSION,
    ]);
    return grantedPermissions.includes(RECEIPT_ADMIN_PERMISSION);
  }

  private buildReceiptObjectKey(
    majorEventId: string,
    subscriptionId: string,
    receiptId: string,
    fileName: string,
    mimeType: string,
  ): string {
    const extension = this.extensionForMimeType(mimeType) ?? this.normalizeExtension(extname(fileName)) ?? 'img';
    return `major-events/${majorEventId}/subscriptions/${subscriptionId}/receipts/${receiptId}.${extension}`;
  }

  private extensionForMimeType(mimeType: string): string | undefined {
    const extensions: Record<string, string> = {
      'image/avif': 'avif',
      'image/bmp': 'bmp',
      'image/gif': 'gif',
      'image/heic': 'heic',
      'image/heif': 'heif',
      'image/jpeg': 'jpg',
      'image/pjpeg': 'jpg',
      'image/png': 'png',
      'image/tiff': 'tiff',
      'image/webp': 'webp',
      'image/x-portable-bitmap': 'pbm',
    };

    return extensions[mimeType.toLowerCase()];
  }

  private normalizeExtension(extension: string): string | undefined {
    const normalizedExtension = extension.replace('.', '').trim().toLowerCase();
    return normalizedExtension.length > 0 ? normalizedExtension : undefined;
  }

  private buildUserContext(authenticatedUser: AuthenticatedUser): GraphqlContext {
    return { req: { user: authenticatedUser } } as GraphqlContext;
  }

  private mapReceipt(receipt: MajorEventReceipt): CurrentUserReceiptResponse {
    return {
      id: receipt.id,
      fileName: receipt.fileName,
      mimeType: receipt.mimeType,
      sizeBytes: receipt.sizeBytes,
      uploadedAt: receipt.uploadedAt,
      expiresAt: receipt.expiresAt,
      imageUrl: `/api/major-event-receipts/${receipt.id}/image`,
      processingStatus: receipt.processingStatus,
      amountMatched: receipt.amountMatched,
      nameMatched: receipt.nameMatched,
    };
  }
}
