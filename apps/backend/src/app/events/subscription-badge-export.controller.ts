import { Body, Controller, Header, Param, Post, Res } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBadRequestResponse,
  ApiBody,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
import { Permission } from '@cacic-fct/shared-permissions';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import {
  type SubscriberBadgeCodeFileName,
  type SubscriberBadgeCodeFormat,
  SubscriptionBadgeExportService,
} from './subscription-badge-export.service';
import { ApiProperty } from '@nestjs/swagger';
import type { IdentityDocumentExportMode, SubscriberCsvField } from '@cacic-fct/shared-utils';

const EVENT_SUBSCRIPTION_EXPORT_PERMISSIONS = [
  Permission.Subscription.Read,
  Permission.Event.Read,
] as const;
const MAJOR_EVENT_SUBSCRIPTION_EXPORT_PERMISSIONS = [
  Permission.Subscription.Read,
  Permission.MajorEvent.Read,
] as const;

export class SubscriberBadgeExportInput {
  @ApiProperty({ enum: ['fullName', 'email', 'identityDocument', 'enrollmentNumber', 'unespRole', 'phone'], isArray: true })
  fields!: SubscriberCsvField[];

  @ApiProperty({ enum: ['masked', 'complete'] })
  identityDocumentMode!: IdentityDocumentExportMode;

  @ApiProperty({ example: '23', description: 'Integer from 5 through 95.' })
  errorCorrectionLevel!: string;

  @ApiProperty({ enum: ['svg', 'png'] })
  format!: SubscriberBadgeCodeFormat;

  @ApiProperty({ enum: ['id', 'fullName', 'identityDocument'] })
  fileName!: SubscriberBadgeCodeFileName;
}

@ApiTags('subscription-exports')
@ApiBearerAuth()
@Controller('subscription-exports')
export class SubscriptionBadgeExportController {
  constructor(private readonly exports: SubscriptionBadgeExportService) {}

  @Post('events/:eventId/badges.zip')
  @RequirePermissions(...EVENT_SUBSCRIPTION_EXPORT_PERMISSIONS)
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  @ApiOperation({ summary: 'Export event subscriptions with Aztec badge codes as a ZIP archive' })
  @ApiParam({ name: 'eventId', description: 'Event identifier.' })
  @ApiProduces('application/zip')
  @ApiBody({ type: SubscriberBadgeExportInput, examples: { default: { value: { fields: ['fullName'], identityDocumentMode: 'masked', errorCorrectionLevel: '23', format: 'svg', fileName: 'id' } } } })
  @ApiOkResponse({ description: 'ZIP stream containing inscricoes.csv and the codigos directory.' })
  @ApiBadRequestResponse({ description: 'Returned when export options or subscriber data cannot produce badge codes.' })
  @ApiNotFoundResponse({ description: 'Returned when the event does not exist.' })
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
  @RequirePermissions(...MAJOR_EVENT_SUBSCRIPTION_EXPORT_PERMISSIONS)
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  @ApiOperation({ summary: 'Export major-event subscriptions with Aztec badge codes as a ZIP archive' })
  @ApiParam({ name: 'majorEventId', description: 'Major event identifier.' })
  @ApiProduces('application/zip')
  @ApiBody({ type: SubscriberBadgeExportInput, examples: { default: { value: { fields: ['fullName'], identityDocumentMode: 'masked', errorCorrectionLevel: '23', format: 'svg', fileName: 'id' } } } })
  @ApiOkResponse({ description: 'ZIP stream containing inscricoes.csv and the codigos directory.' })
  @ApiBadRequestResponse({ description: 'Returned when export options or subscriber data cannot produce badge codes.' })
  @ApiNotFoundResponse({ description: 'Returned when the major event does not exist.' })
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
