import {
  BadRequestException,
  Controller,
  Get,
  Header,
  MessageEvent,
  Param,
  Post,
  Query,
  Req,
  Res,
  Sse,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiProperty,
  ApiPropertyOptional,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Request, Response } from 'express';
import { Observable, interval, map, startWith, switchMap } from 'rxjs';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { RateLimit } from '../rate-limit/rate-limit.decorator';
import { RateLimitGuard } from '../rate-limit/rate-limit.guard';
import { RATE_LIMIT_POLICIES } from '../rate-limit/rate-limit.policies';
import { MajorEventReceiptsService } from './major-event-receipts.service';
import {
  MAX_RECEIPT_FILE_SIZE_BYTES,
  RECEIPT_ADMIN_PERMISSION,
  CurrentUserReceiptResponse,
  UploadedReceiptFile,
} from './receipt.types';
import { isAllowedReceiptMimeType } from './utils/receipt-file.utils';

type RequestWithUser = Request & {
  user?: AuthenticatedUser;
};

class ReceiptUploadBodyDto {
  @ApiProperty({
    description: 'Receipt image file selected in the Angular receipt upload form.',
    type: 'string',
    format: 'binary',
  })
  file!: unknown;
}

class CurrentUserReceiptResponseDto {
  @ApiProperty({
    description: 'Receipt identifier used by protected image endpoints.',
    example: '018f47b1-5c4e-7c7b-9e6f-0c8c2f7281ad',
  })
  id!: string;

  @ApiProperty({
    description: 'Original file name received from the upload.',
    example: 'comprovante-pagamento.png',
  })
  fileName!: string;

  @ApiProperty({
    description: 'Stored MIME type.',
    example: 'image/png',
  })
  mimeType!: string;

  @ApiProperty({
    description: 'Uploaded file size in bytes.',
    example: 482391,
  })
  sizeBytes!: number;

  @ApiProperty({
    description: 'Upload timestamp.',
    example: '2026-05-29T17:20:00.000Z',
  })
  uploadedAt!: Date;

  @ApiProperty({
    description: 'Timestamp after which the uploaded receipt should no longer be considered usable for validation.',
    example: '2026-06-05T17:20:00.000Z',
  })
  expiresAt!: Date;

  @ApiProperty({
    description: 'Protected URL used by the Angular frontend to display the receipt image.',
    example: '/api/major-event-receipts/018f47b1-5c4e-7c7b-9e6f-0c8c2f7281ad/image',
  })
  imageUrl!: string;

  @ApiProperty({
    description: 'Current processing status for OCR/matching or manual validation workflows.',
    example: 'PENDING',
  })
  processingStatus!: string;

  @ApiPropertyOptional({
    description: 'Whether the expected payment amount was matched during receipt processing.',
    example: true,
    nullable: true,
  })
  amountMatched?: boolean | null;

  @ApiPropertyOptional({
    description: 'Whether the payer/person name was matched during receipt processing.',
    example: false,
    nullable: true,
  })
  nameMatched?: boolean | null;
}

class AdminReceiptEventSummaryDto {
  @ApiProperty({
    description: 'Event identifier.',
    example: '018f47b1-5c4e-7c7b-9e6f-0c8c2f7281ad',
  })
  id!: string;

  @ApiProperty({
    description: 'Event display name shown in the admin queue.',
    example: 'Angular avançado com SSR',
  })
  name!: string;

  @ApiProperty({
    description: 'Emoji used by the event card/list UI.',
    example: '🅰️',
  })
  emoji!: string;

  @ApiProperty({
    description: 'Event type/category used by the Angular admin UI for grouping or labeling.',
    example: 'COURSE',
  })
  type!: string;

  @ApiProperty({
    description: 'Event start timestamp.',
    example: '2026-06-10T13:00:00.000Z',
  })
  startDate!: Date;

  @ApiProperty({
    description: 'Event end timestamp.',
    example: '2026-06-10T15:00:00.000Z',
  })
  endDate!: Date;

  @ApiPropertyOptional({
    description: 'Human-readable location text.',
    example: 'Laboratório 3',
    nullable: true,
  })
  locationDescription?: string | null;

  @ApiPropertyOptional({
    description: 'Configured event capacity.',
    example: 40,
    nullable: true,
  })
  slots?: number | null;

  @ApiPropertyOptional({
    description: 'Current remaining capacity snapshot used during receipt confirmation decisions.',
    example: 8,
    nullable: true,
  })
  slotsAvailable?: number | null;

  @ApiPropertyOptional({
    description: 'Event group identifier when the event belongs to a group.',
    example: '018f47b1-5c4e-7c7b-9e6f-0c8c2f7281ad',
    nullable: true,
  })
  eventGroupId?: string | null;

  @ApiPropertyOptional({
    description: 'Event group display name.',
    example: 'Minicursos',
    nullable: true,
  })
  eventGroupName?: string | null;

  @ApiPropertyOptional({
    description: 'User preference order for selection flows where the participant ranked desired activities.',
    example: 1,
    nullable: true,
  })
  preferenceOrder?: number | null;

  @ApiProperty({
    description: 'Whether this event should be automatically selected during confirmation.',
    example: false,
  })
  autoSubscribe!: boolean;

  @ApiProperty({
    description: 'Whether this event is currently selected for confirmation in the receipt validation flow.',
    example: true,
  })
  selectedForConfirmation!: boolean;

  @ApiProperty({
    description: 'Whether confirming this event would conflict with another selected event.',
    example: false,
  })
  hasScheduleConflict!: boolean;

  @ApiProperty({
    description: 'Whether this event currently has no available slots for confirmation.',
    example: false,
  })
  hasNoSlots!: boolean;
}

class AdminReceiptQueueReceiptDto {
  @ApiProperty({
    description: 'Receipt identifier.',
    example: '018f47b1-5c4e-7c7b-9e6f-0c8c2f7281ad',
  })
  id!: string;

  @ApiProperty({
    description: 'Original file name received from upload.',
    example: 'comprovante.png',
  })
  fileName!: string;

  @ApiProperty({
    description: 'Stored MIME type.',
    example: 'image/png',
  })
  mimeType!: string;

  @ApiProperty({
    description: 'Uploaded file size in bytes.',
    example: 482391,
  })
  sizeBytes!: number;

  @ApiProperty({
    description: 'Upload timestamp.',
    example: '2026-05-29T17:20:00.000Z',
  })
  uploadedAt!: Date;

  @ApiProperty({
    description: 'Timestamp after which the receipt should no longer be considered valid for processing.',
    example: '2026-06-05T17:20:00.000Z',
  })
  expiresAt!: Date;

  @ApiProperty({
    description: 'Protected URL used by the Angular admin UI to preview the receipt.',
    example: '/api/major-event-receipts/018f47b1-5c4e-7c7b-9e6f-0c8c2f7281ad/image',
  })
  imageUrl!: string;

  @ApiProperty({
    description: 'Current processing status for OCR/matching or manual validation workflows.',
    example: 'PENDING',
  })
  processingStatus!: string;

  @ApiPropertyOptional({
    description: 'OCR text extracted from the receipt when processing completed with readable output.',
    example: 'Transferência Pix R$ 35,00 ...',
    nullable: true,
  })
  ocrText?: string | null;

  @ApiPropertyOptional({
    description: 'Whether the expected payment amount was matched.',
    example: true,
    nullable: true,
  })
  amountMatched?: boolean | null;

  @ApiPropertyOptional({
    description: 'Amount text matched in the receipt OCR output.',
    example: 'R$ 35,00',
    nullable: true,
  })
  matchedAmountText?: string | null;

  @ApiPropertyOptional({
    description: 'Whether the expected person name was matched.',
    example: true,
    nullable: true,
  })
  nameMatched?: boolean | null;

  @ApiPropertyOptional({
    description: 'Name text matched in the receipt OCR output.',
    example: 'João Silva',
    nullable: true,
  })
  matchedNameText?: string | null;
}

class AdminReceiptQueueItemDto {
  @ApiProperty({
    description: 'Subscription awaiting receipt validation.',
    example: '018f47b1-5c4e-7c7b-9e6f-0c8c2f7281ad',
  })
  subscriptionId!: string;

  @ApiProperty({
    description: 'Major event associated with the subscription.',
    example: '018f47b1-5c4e-7c7b-9e6f-0c8c2f7281ad',
  })
  majorEventId!: string;

  @ApiProperty({
    description: 'Major event display name.',
    example: 'SECOMPP 2026',
  })
  majorEventName!: string;

  @ApiProperty({
    description: 'Person identifier associated with the subscription.',
    example: '018f47b1-5c4e-7c7b-9e6f-0c8c2f7281ad',
  })
  personId!: string;

  @ApiProperty({
    description: 'Participant name shown to receipt validators.',
    example: 'João Silva',
  })
  personName!: string;

  @ApiPropertyOptional({
    description: 'Participant email shown to receipt validators.',
    example: 'joao@cacic.dev.br',
    nullable: true,
  })
  personEmail?: string | null;

  @ApiPropertyOptional({
    description: 'Participant phone shown to receipt validators.',
    example: '+55 11 99999-9999',
    nullable: true,
  })
  personPhone?: string | null;

  @ApiPropertyOptional({
    description: 'Payment amount recorded for the subscription, when available.',
    example: 25,
    nullable: true,
  })
  amountPaid?: number | null;

  @ApiPropertyOptional({
    description: 'Payment tier used to contextualize the expected amount during validation.',
    example: 'STUDENT',
    nullable: true,
  })
  paymentTier?: string | null;

  @ApiProperty({
    description: 'Subscription flow used by the participant, useful for admin validation rules and UI branching.',
    example: 'RANKED_PREFERENCE',
  })
  subscriptionFlow!: string;

  @ApiPropertyOptional({
    description: 'Desired number of courses in preference-based flows.',
    example: 2,
    nullable: true,
  })
  desiredCourses?: number | null;

  @ApiPropertyOptional({
    description: 'Desired number of lectures in preference-based flows.',
    example: 3,
    nullable: true,
  })
  desiredLectures?: number | null;

  @ApiPropertyOptional({
    description: 'Desired number of uncategorized activities in preference-based flows.',
    example: 1,
    nullable: true,
  })
  desiredUncategorized?: number | null;

  @ApiProperty({
    description: 'Current subscription status before receipt validation is resolved.',
    example: 'PENDING_PAYMENT_VALIDATION',
  })
  subscriptionStatus!: string;

  @ApiProperty({
    description: 'Last subscription update timestamp, used by the admin queue for ordering and stale-state checks.',
    example: '2026-05-29T17:20:00.000Z',
  })
  subscriptionUpdatedAt!: Date;

  @ApiPropertyOptional({
    description: 'Previous rejection reason when the participant has already submitted an invalid receipt.',
    example: 'Imagem ilegível.',
    nullable: true,
  })
  receiptRejectionReason?: string | null;

  @ApiPropertyOptional({
    description:
      'Receipt submitted for validation. Null when the queue item exists without an accessible current receipt.',
    type: AdminReceiptQueueReceiptDto,
    nullable: true,
  })
  receipt?: AdminReceiptQueueReceiptDto | null;

  @ApiProperty({
    description: 'Events relevant to this subscription and receipt confirmation decision.',
    type: [AdminReceiptEventSummaryDto],
  })
  events!: AdminReceiptEventSummaryDto[];
}

class AdminReceiptQueueResponseDto {
  @ApiProperty({
    description: 'Total number of subscriptions currently pending receipt validation for the selected filter.',
    example: 12,
  })
  pendingCount!: number;

  @ApiProperty({
    description: 'Queue items rendered by the Angular admin receipt validation screen.',
    type: [AdminReceiptQueueItemDto],
  })
  items!: AdminReceiptQueueItemDto[];
}

class ReceiptValidationQueueEventDataDto {
  @ApiProperty({
    description: 'SSE event discriminator used by the Angular admin UI to route queue updates.',
    example: 'receipt-validation-queue',
  })
  type!: 'receipt-validation-queue';

  @ApiProperty({
    description: 'Current queue snapshot for the selected major event filter, if any.',
    type: AdminReceiptQueueResponseDto,
  })
  queue!: AdminReceiptQueueResponseDto;
}

class ReceiptValidationQueueMessageDto {
  @ApiProperty({
    description: 'SSE payload emitted to the admin validation queue stream.',
    type: ReceiptValidationQueueEventDataDto,
  })
  data!: ReceiptValidationQueueEventDataDto;
}

@ApiTags('major-event-receipts')
@ApiBearerAuth()
@Controller('major-event-receipts')
export class MajorEventReceiptsController {
  constructor(private readonly receipts: MajorEventReceiptsService) {}

  @Post('major-events/:majorEventId')
  @UseGuards(RateLimitGuard)
  @RateLimit(RATE_LIMIT_POLICIES.receiptUpload, [{ source: 'params', path: 'majorEventId' }])
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: MAX_RECEIPT_FILE_SIZE_BYTES,
        files: 1,
      },
      fileFilter: (
        _request,
        file: UploadedReceiptFile,
        callback: (error: Error | null, acceptFile: boolean) => void,
      ) => {
        if (!isAllowedReceiptMimeType(file.mimetype)) {
          callback(new BadRequestException('Receipt must be a supported raster image.'), false);
          return;
        }

        callback(null, true);
      },
    }),
  )
  @ApiOperation({
    summary: 'Upload a major-event payment receipt',
    description:
      'Stores a receipt image for the authenticated participant and selected major event. This endpoint is throttled because it accepts user-uploaded files and feeds the payment validation workflow used by the event admin interface.',
  })
  @ApiParam({
    name: 'majorEventId',
    description: 'Major event whose payment receipt is being submitted by the authenticated participant.',
    example: '018f47b1-5c4e-7c7b-9e6f-0c8c2f7281ad',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    type: ReceiptUploadBodyDto,
    description: 'Multipart payload sent by the Angular receipt upload form.',
  })
  @ApiOkResponse({
    type: CurrentUserReceiptResponseDto,
    description: 'Receipt state for the authenticated participant after upload processing.',
  })
  @ApiBadRequestResponse({
    description:
      'Returned when the authenticated user is missing, the file is absent, or the uploaded file is not an accepted receipt image.',
  })
  @ApiResponse({
    status: 413,
    description: 'Returned when the uploaded file exceeds the configured receipt size limit.',
  })
  @ApiResponse({
    status: 429,
    description: 'Returned when the upload throttle window is exceeded.',
  })
  uploadReceipt(
    @Param('majorEventId') majorEventId: string,
    @UploadedFile() file: UploadedReceiptFile | undefined,
    @Req() request: RequestWithUser,
  ): Promise<CurrentUserReceiptResponse> {
    return this.receipts.uploadReceipt(majorEventId, file, this.requireAuthenticatedUser(request));
  }

  @Sse('admin/queue/events')
  @RequirePermissions(RECEIPT_ADMIN_PERMISSION)
  @ApiTags('SSE', 'receipt-validation')
  @ApiOperation({
    summary: 'Stream receipt validation queue updates',
    description:
      'Server-Sent Events stream for the Angular admin receipt validation screen. The stream emits the current queue immediately and then refreshes it every three seconds, optionally scoped to a major event.',
  })
  @ApiProduces('text/event-stream')
  @ApiQuery({
    name: 'majorEventId',
    required: false,
    description:
      'Optional major event filter for admin screens that validate receipts in the context of a single event.',
    example: '018f47b1-5c4e-7c7b-9e6f-0c8c2f7281ad',
  })
  @ApiOkResponse({
    description: 'SSE stream emitting receipt validation queue snapshots for the admin dashboard.',
    type: ReceiptValidationQueueMessageDto,
  })
  @ApiForbiddenResponse({
    description: `Returned when the authenticated user does not have the required scope: ${RECEIPT_ADMIN_PERMISSION}.`,
  })
  streamPendingValidationQueue(@Query('majorEventId') majorEventId?: string): Observable<MessageEvent> {
    const normalizedMajorEventId = majorEventId?.trim() || undefined;

    return interval(3_000).pipe(
      startWith(0),
      switchMap(() => this.receipts.listPendingValidationQueue(normalizedMajorEventId)),
      map((queue) => ({
        data: {
          type: 'receipt-validation-queue',
          queue,
        },
      })),
    );
  }

  @Get(':receiptId/image')
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  @ApiOperation({
    summary: 'Stream a protected receipt image',
    description:
      'Streams the stored receipt image after access is checked against the authenticated user. The response is marked private and no-store because receipts can contain payment data and personally identifiable information.',
  })
  @ApiParam({
    name: 'receiptId',
    description: 'Receipt image identifier. Access is still checked by the receipt service.',
    example: '018f47b1-5c4e-7c7b-9e6f-0c8c2f7281ad',
  })
  @ApiProduces('image/jpeg', 'image/png', 'image/webp')
  @ApiResponse({
    status: 200,
    description:
      'Binary image stream. Content-Type and Content-Length are set from stored receipt metadata when available.',
    content: {
      'image/jpeg': {
        schema: {
          type: 'string',
          format: 'binary',
        },
      },
      'image/png': {
        schema: {
          type: 'string',
          format: 'binary',
        },
      },
      'image/webp': {
        schema: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Returned when the authenticated user is missing from the request context.',
  })
  @ApiForbiddenResponse({
    description: 'Returned when the authenticated user is not allowed to access the requested receipt image.',
  })
  async getReceiptImage(
    @Param('receiptId') receiptId: string,
    @Req() request: RequestWithUser,
    @Res() response: Response,
  ): Promise<void> {
    const image = await this.receipts.getReceiptImage(receiptId, this.requireAuthenticatedUser(request));

    response.type(image.contentType);

    if (image.contentLength != null) {
      response.setHeader('Content-Length', image.contentLength.toString());
    }

    image.stream.pipe(response);
  }

  private requireAuthenticatedUser(request: RequestWithUser): AuthenticatedUser {
    if (!request.user) {
      throw new BadRequestException('Missing authenticated user.');
    }

    return request.user;
  }
}
