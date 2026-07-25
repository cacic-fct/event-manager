import { Body, Controller, Header, Param, Post, Res } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
import { Permission } from '@cacic-fct/shared-permissions';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { SubscriberBadgeExportInput, SubscriptionBadgeExportService } from './subscription-badge-export.service';

const SUBSCRIPTION_EXPORT_PERMISSIONS = [
  Permission.Subscription.Read,
  Permission.Event.Read,
  Permission.MajorEvent.Read,
] as const;

@ApiTags('subscription-exports')
@ApiBearerAuth()
@Controller('subscription-exports')
export class SubscriptionBadgeExportController {
  constructor(private readonly exports: SubscriptionBadgeExportService) {}

  @Post('events/:eventId/badges.zip')
  @RequirePermissions(...SUBSCRIPTION_EXPORT_PERMISSIONS)
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  @ApiOperation({ summary: 'Export event subscriptions with Aztec badge codes as a ZIP archive' })
  @ApiParam({ name: 'eventId', description: 'Event identifier.' })
  @ApiProduces('application/zip')
  @ApiOkResponse({ description: 'ZIP stream containing inscricoes.csv and the codigos directory.' })
  @ApiForbiddenResponse({ description: 'Returned when the caller cannot read subscriptions for the event.' })
  async exportEvent(
    @Param('eventId') eventId: string,
    @Body() input: SubscriberBadgeExportInput,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.exports.exportEvent(eventId, input);
    this.setDownloadHeaders(response, result.fileName);
    return result.file;
  }

  @Post('major-events/:majorEventId/badges.zip')
  @RequirePermissions(...SUBSCRIPTION_EXPORT_PERMISSIONS)
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  @ApiOperation({ summary: 'Export major-event subscriptions with Aztec badge codes as a ZIP archive' })
  @ApiParam({ name: 'majorEventId', description: 'Major event identifier.' })
  @ApiProduces('application/zip')
  @ApiOkResponse({ description: 'ZIP stream containing inscricoes.csv and the codigos directory.' })
  @ApiForbiddenResponse({ description: 'Returned when the caller cannot read subscriptions for the major event.' })
  async exportMajorEvent(
    @Param('majorEventId') majorEventId: string,
    @Body() input: SubscriberBadgeExportInput,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.exports.exportMajorEvent(majorEventId, input);
    this.setDownloadHeaders(response, result.fileName);
    return result.file;
  }

  private setDownloadHeaders(response: Response, fileName: string): void {
    response.setHeader('Content-Type', 'application/zip');
    response.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  }
}
