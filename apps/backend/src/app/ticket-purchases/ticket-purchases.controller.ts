import { Body, Controller, Get, Header, Param, Post, Req, Res, UnauthorizedException, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { pipeline } from 'node:stream/promises';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { MAX_RECEIPT_FILE_SIZE_BYTES, UploadedReceiptFile } from '../major-event-receipts/receipt.types';
import { RateLimit } from '../rate-limit/rate-limit.decorator';
import { RateLimitGuard } from '../rate-limit/rate-limit.guard';
import { RATE_LIMIT_POLICIES } from '../rate-limit/rate-limit.policies';
import { TicketPurchasesService } from './ticket-purchases.service';

type TicketPurchaseRequest = Request & { user?: AuthenticatedUser };

@ApiTags('ticket-purchases')
@ApiBearerAuth()
@Controller('ticket-purchases')
export class TicketPurchasesController {
  constructor(private readonly purchases: TicketPurchasesService) {}

  @Post(':eventId/receipt')
  @UseGuards(RateLimitGuard)
  @RateLimit(RATE_LIMIT_POLICIES.receiptUpload, [{ source: 'params', path: 'eventId' }])
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_RECEIPT_FILE_SIZE_BYTES, files: 1, fields: 2 } }))
  @ApiOperation({ summary: 'Submit a ticket purchase receipt', description: 'Validates the current account’s approved subscription, ticket visibility and price. Creates a purchase only after receipt storage succeeds. Concurrent or stale submissions do not create duplicate purchases.' })
  @ApiParam({ name: 'eventId', description: 'Event represented by the ticket.', example: '019af432-98b0-7000-8000-000000000001' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', required: ['file', 'ticketConfigId', 'expectedAmountCents'], properties: {
    file: { type: 'string', format: 'binary' },
    ticketConfigId: { type: 'string', description: 'Configuration displayed on the purchase page.' },
    expectedAmountCents: { type: 'integer', example: 2500, description: 'Displayed price in cents; never used as the authoritative price.' },
  } } })
  @ApiResponse({ status: 201, description: 'Stored receipt details and purchaseId; the purchase awaits manual validation.' })
  @ApiResponse({ status: 409, description: 'Conditions changed or this purchase is already pending/approved.' })
  upload(@Param('eventId') eventId: string, @UploadedFile() file: UploadedReceiptFile | undefined,
    @Body('ticketConfigId') ticketConfigId: string, @Body('expectedAmountCents') amount: string,
    @Req() request: TicketPurchaseRequest) {
    return this.purchases.upload(eventId, file, { ticketConfigId, amountCents: Number(amount) }, this.user(request));
  }

  @Get(':purchaseId/receipt')
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  @ApiOperation({ summary: 'Read a protected ticket receipt', description: 'Available only to its owner or a receipt reviewer authorized for the purchase’s major event. The image is never publicly cached.' })
  @ApiParam({ name: 'purchaseId', description: 'Ticket purchase identifier.' })
  @ApiResponse({ status: 200, description: 'Protected PNG receipt preview.', content: { 'image/png': { schema: { type: 'string', format: 'binary' } } } })
  @ApiResponse({ status: 410, description: 'Receipt retention period ended.' })
  async image(@Param('purchaseId') purchaseId: string, @Req() request: TicketPurchaseRequest, @Res() response: Response) {
    const image = await this.purchases.image(purchaseId, this.user(request));
    response.type(image.contentType ?? 'image/png');
    if (image.contentLength != null) response.setHeader('Content-Length', image.contentLength.toString());
    const close = () => { if (!response.writableEnded) image.stream.destroy(); };
    response.once('close', close);
    try { await pipeline(image.stream, response); }
    finally { response.off('close', close); }
  }

  private user(request: TicketPurchaseRequest): AuthenticatedUser {
    if (!request.user?.sub) throw new UnauthorizedException();
    return request.user;
  }
}
