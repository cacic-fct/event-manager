import {
  BadRequestException,
  Body,
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
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { Observable, interval, map, startWith, switchMap } from 'rxjs';
import { RequireScopes } from '../auth/decorators/require-scopes.decorator';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { MajorEventReceiptsService } from './major-event-receipts.service';
import {
  AdminReceiptQueueResponse,
  CurrentUserReceiptResponse,
  MAX_RECEIPT_FILE_SIZE_BYTES,
  RECEIPT_ADMIN_EDIT_PERMISSION,
  RECEIPT_ADMIN_PERMISSION,
  ReceiptRejectionCode,
  UploadedReceiptFile,
} from './receipt.types';

type RequestWithUser = Request & {
  user?: AuthenticatedUser;
};

interface RejectReceiptBody {
  receiptId?: string;
  rejectionCode?: ReceiptRejectionCode;
  reason?: string;
}

interface ApproveReceiptBody {
  receiptId?: string;
  selectedEventIds?: string[];
}

@ApiTags('major-event-receipts')
@ApiBearerAuth()
@Controller('major-event-receipts')
export class MajorEventReceiptsController {
  constructor(private readonly receipts: MajorEventReceiptsService) {}

  @Get('major-events/:majorEventId/current')
  @ApiOkResponse({ description: 'Latest receipt uploaded by the current user for the major event.' })
  getCurrentReceipt(
    @Param('majorEventId') majorEventId: string,
    @Req() request: RequestWithUser,
  ): Promise<CurrentUserReceiptResponse | null> {
    return this.receipts.getCurrentReceipt(majorEventId, this.requireAuthenticatedUser(request));
  }

  @Post('major-events/:majorEventId')
  @UseGuards(ThrottlerGuard)
  @Throttle({
    default: {
      limit: 4,
      ttl: 60_000,
      blockDuration: 60_000,
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: MAX_RECEIPT_FILE_SIZE_BYTES,
        files: 1,
      },
      fileFilter: (_request, file: UploadedReceiptFile, callback: (error: Error | null, acceptFile: boolean) => void) => {
        if (!file.mimetype.startsWith('image/')) {
          callback(new BadRequestException('Receipt must be an image.'), false);
          return;
        }

        callback(null, true);
      },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  uploadReceipt(
    @Param('majorEventId') majorEventId: string,
    @UploadedFile() file: UploadedReceiptFile | undefined,
    @Req() request: RequestWithUser,
  ): Promise<CurrentUserReceiptResponse> {
    return this.receipts.uploadReceipt(majorEventId, file, this.requireAuthenticatedUser(request));
  }

  @Get('admin/pending-count')
  @RequireScopes(RECEIPT_ADMIN_PERMISSION)
  getPendingValidationCount(): Promise<{ pendingCount: number }> {
    return this.receipts.getPendingValidationCount();
  }

  @Get('admin/queue')
  @RequireScopes(RECEIPT_ADMIN_PERMISSION)
  listPendingValidationQueue(@Query('majorEventId') majorEventId?: string): Promise<AdminReceiptQueueResponse> {
    return this.receipts.listPendingValidationQueue(majorEventId?.trim() || undefined);
  }

  @Sse('admin/queue/events')
  @RequireScopes(RECEIPT_ADMIN_PERMISSION)
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

  @Post('admin/subscriptions/:subscriptionId/approve')
  @RequireScopes(RECEIPT_ADMIN_EDIT_PERMISSION)
  approveReceipt(
    @Param('subscriptionId') subscriptionId: string,
    @Body() body: ApproveReceiptBody,
    @Req() request: RequestWithUser,
  ) {
    if (!body.receiptId) {
      throw new BadRequestException('receiptId is required.');
    }
    return this.receipts.approveReceipt(
      subscriptionId,
      body.receiptId,
      Array.isArray(body.selectedEventIds) ? body.selectedEventIds : undefined,
      this.requireAuthenticatedUser(request),
    );
  }

  @Post('admin/subscriptions/:subscriptionId/reject')
  @RequireScopes(RECEIPT_ADMIN_EDIT_PERMISSION)
  rejectReceipt(
    @Param('subscriptionId') subscriptionId: string,
    @Body() body: RejectReceiptBody,
    @Req() request: RequestWithUser,
  ) {
    if (!body.rejectionCode) {
      throw new BadRequestException('rejectionCode is required.');
    }
    return this.receipts.rejectReceipt(
      subscriptionId,
      body.receiptId,
      body.rejectionCode,
      body.reason,
      this.requireAuthenticatedUser(request),
    );
  }

  @Post('admin/actions/:actionId/undo')
  @RequireScopes(RECEIPT_ADMIN_EDIT_PERMISSION)
  undoValidationAction(@Param('actionId') actionId: string, @Req() request: RequestWithUser) {
    return this.receipts.undoValidationAction(actionId, this.requireAuthenticatedUser(request));
  }

  @Get(':receiptId/image')
  @Header('Cache-Control', 'private, no-store')
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
