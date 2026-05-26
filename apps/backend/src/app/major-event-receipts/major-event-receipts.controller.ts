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
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { Observable, interval, map, startWith, switchMap } from 'rxjs';
import { RequireScopes } from '../auth/decorators/require-scopes.decorator';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
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

@ApiTags('major-event-receipts')
@ApiBearerAuth()
@Controller('major-event-receipts')
export class MajorEventReceiptsController {
  constructor(private readonly receipts: MajorEventReceiptsService) {}

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
        if (!isAllowedReceiptMimeType(file.mimetype)) {
          callback(new BadRequestException('Receipt must be a supported raster image.'), false);
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

  @Get(':receiptId/image')
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
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
