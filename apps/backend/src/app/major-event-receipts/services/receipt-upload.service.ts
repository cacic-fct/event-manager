import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { MajorEventReceipt, SubscriptionStatus } from '@prisma/client';
import { Queue } from 'bullmq';
import { randomUUID } from 'crypto';
import { addYears } from 'date-fns';
import { Readable } from 'stream';
import { AuthorizationPolicyService } from '../../authorization/authorization-policy.service';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { CurrentUserContextService } from '../../current-user/context.service';
import { GraphqlContext } from '../../current-user/selects';
import { DashboardInsightsService } from '../../dashboard/insights.service';
import { AttendanceCategoryService } from '../../events/attendance-category.service';
import { FrozenResourceService } from '../../common/frozen-resource.service';
import { PrismaService } from '../../prisma/prisma.service';
import { S3Service } from '../../s3/s3.service';
import { mapReceipt } from '../mappers/receipt-queue.mapper';
import {
  CurrentUserReceiptResponse,
  MAJOR_EVENT_RECEIPTS_QUEUE,
  RECEIPT_PROCESSING_ATTEMPTS,
  RECEIPT_ADMIN_PERMISSION,
  ReceiptProcessingJob,
  UploadedReceiptFile,
} from '../receipt.types';
import { assertValidReceiptUpload, buildReceiptObjectKey } from '../utils/receipt-file.utils';
import {
  assertReceiptBufferWithinProcessingLimits,
  isReceiptImageProcessingError,
} from '../utils/receipt-image-processing.utils';

@Injectable()
export class ReceiptUploadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly currentUserContext: CurrentUserContextService,
    private readonly attendanceCategories: AttendanceCategoryService,
    private readonly dashboardInsights: DashboardInsightsService,
    private readonly authorizationPolicy: AuthorizationPolicyService,
    @InjectQueue(MAJOR_EVENT_RECEIPTS_QUEUE)
    private readonly receiptQueue: Queue<ReceiptProcessingJob>,
    private readonly frozenResources: FrozenResourceService = {
      assertMajorEventMutable: async () => undefined,
    } as unknown as FrozenResourceService,
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

    return receipt ? mapReceipt(receipt as MajorEventReceipt) : null;
  }

  async uploadReceipt(
    majorEventId: string,
    file: UploadedReceiptFile | undefined,
    authenticatedUser: AuthenticatedUser,
  ): Promise<CurrentUserReceiptResponse> {
    assertValidReceiptUpload(file);
    await this.frozenResources.assertMajorEventMutable(majorEventId, authenticatedUser, 'edit');

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

    await this.assertReceiptImageCanBeProcessed(file.buffer);

    const receiptId = randomUUID();
    const uploadedAt = new Date();
    const expiresAt = addYears(uploadedAt, 1);
    const objectKey = buildReceiptObjectKey(majorEventId, subscription.id, receiptId, file.originalname, file.mimetype);

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
        attempts: RECEIPT_PROCESSING_ATTEMPTS,
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
    return mapReceipt(receipt as MajorEventReceipt);
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

    await this.assertCanReadReceipt(receipt.id, receipt.personId, authenticatedUser);

    const file = await this.s3.downloadFile(receipt.objectKey);
    return {
      stream: file.stream,
      contentType: file.contentType ?? receipt.mimeType,
      contentLength: file.contentLength,
    };
  }

  private async assertReceiptImageCanBeProcessed(buffer: Buffer): Promise<void> {
    try {
      await assertReceiptBufferWithinProcessingLimits(buffer);
    } catch (error: unknown) {
      if (isReceiptImageProcessingError(error)) {
        throw new BadRequestException(error.message);
      }

      throw error;
    }
  }

  private async assertCanReadReceipt(
    receiptId: string,
    personId: string,
    authenticatedUser: AuthenticatedUser,
  ): Promise<void> {
    if (await this.hasAdminReceiptReadPermission(authenticatedUser, receiptId)) {
      return;
    }

    const { person } = await this.currentUserContext.resolveCurrentUserContext(authenticatedUser);
    if (person?.id === personId) {
      return;
    }

    throw new ForbiddenException('You cannot access this receipt.');
  }

  private async hasAdminReceiptReadPermission(authenticatedUser: AuthenticatedUser, receiptId: string): Promise<boolean> {
    try {
      await this.authorizationPolicy.assertPermissions(authenticatedUser, [RECEIPT_ADMIN_PERMISSION], {
        receiptId,
      });
      return true;
    } catch (error) {
      if (!(error instanceof ForbiddenException)) {
        throw error;
      }

      return false;
    }
  }

  private buildUserContext(authenticatedUser: AuthenticatedUser): GraphqlContext {
    return { req: { user: authenticatedUser } } as GraphqlContext;
  }
}
