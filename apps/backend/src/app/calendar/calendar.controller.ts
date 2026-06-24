import { Controller, Get, Param, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiProduces, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { CalendarDownload } from './calendar.models';
import { CalendarService } from './calendar.service';

const ICALENDAR_RESPONSE_EXAMPLE =
  'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//CACiC FCT//CACiC Eventos//PT-BR\r\nBEGIN:VEVENT\r\nSUMMARY:Oficina de TypeScript\r\nDTSTART:20260701T130000Z\r\nDTEND:20260701T150000Z\r\nEND:VEVENT\r\nEND:VCALENDAR';

@ApiTags('Calendar')
@Public()
@Controller('calendar')
export class CalendarController {
  private readonly configuredPublicAppOrigin = this.readConfiguredPublicAppOrigin();

  constructor(private readonly calendars: CalendarService) {}

  @Get('events/:eventId.ics')
  @ApiOperation({
    summary: 'Download a public event as an iCalendar file',
    description:
      'Generates a single-event .ics file on demand. Hidden, deleted, or unknown events are returned as not found.',
  })
  @ApiParam({
    name: 'eventId',
    description: 'Public event identifier.',
    example: 'event_01jz0ev6c5w1kt2f0f8r6f0q7x',
  })
  @ApiProduces('text/calendar')
  @ApiResponse({
    status: 200,
    description: 'iCalendar file generated for the public event.',
    schema: {
      type: 'string',
      example: ICALENDAR_RESPONSE_EXAMPLE,
    },
  })
  async downloadPublicEventCalendar(
    @Param('eventId') eventId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const download = await this.calendars.buildPublicEventCalendar(eventId, this.getRequestOrigin(request));
    this.sendCalendar(response, download, 'public, max-age=3600');
  }

  @Get('feeds/:feedKey.ics')
  @ApiOperation({
    summary: 'Read a private user calendar feed',
    description:
      'Generates a private user-specific .ics feed for valid enabled feed keys. Disabled, stale, or unknown keys are returned as not found.',
  })
  @ApiParam({
    name: 'feedKey',
    description: 'Long private calendar feed key generated for one user.',
    example: 'jEjZmuQLMUP00vg2oMz5Gt5F2cVr9SzUwN9jOxy9gFXeTWNaeMpd3UoZ8uM0K1KFY66OOpNfKg1cVim41LqN8Q',
  })
  @ApiProduces('text/calendar')
  @ApiResponse({
    status: 200,
    description: 'Private iCalendar feed generated for the key owner.',
    schema: {
      type: 'string',
      example: ICALENDAR_RESPONSE_EXAMPLE,
    },
  })
  async downloadPrivateUserCalendarFeed(
    @Param('feedKey') feedKey: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const download = await this.calendars.buildPrivateUserCalendarFeed(feedKey, this.getRequestOrigin(request));
    this.sendCalendar(response, download, 'private, max-age=900');
  }

  @Get('admin/feeds/:feedKey.ics')
  @ApiOperation({
    summary: 'Read a private admin calendar feed',
    description:
      'Generates a private user-specific admin .ics feed for valid enabled feed keys. Disabled, stale, or unknown keys are returned as not found.',
  })
  @ApiParam({
    name: 'feedKey',
    description: 'Long private administrative calendar feed key generated for one admin user.',
    example: 'l3pfU9NsasNe0S8oPd2kF2P4TEUvJx85n2CVWmFxEQLjEvXSipxHk49e6ksfS4CoXtdAAosbNUZPtuUFkB93_g',
  })
  @ApiProduces('text/calendar')
  @ApiResponse({
    status: 200,
    description: 'Private admin iCalendar feed generated for the key owner.',
    schema: {
      type: 'string',
      example: ICALENDAR_RESPONSE_EXAMPLE,
    },
  })
  async downloadPrivateAdminCalendarFeed(
    @Param('feedKey') feedKey: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const download = await this.calendars.buildPrivateAdminCalendarFeed(feedKey, this.getRequestOrigin(request));
    this.sendCalendar(response, download, 'private, max-age=900');
  }

  @Get('admin/super-admin/:feedKey.ics')
  @ApiOperation({
    summary: 'Read the shared super-admin calendar feed',
    description:
      'Generates the shared super-admin .ics feed for a valid enabled shared key. Unknown or rotated keys are returned as not found.',
  })
  @ApiParam({
    name: 'feedKey',
    description: 'Long shared private calendar feed key for super-admin users.',
    example: 'W9PrrUZAuAVyJXJHh4cRXMu88XB0vqz8f3KSCdA_jzAMVG0fYryYLzRohXoz2X8YROpRp8Rh8Su5sr7mLjCzNQ',
  })
  @ApiProduces('text/calendar')
  @ApiResponse({
    status: 200,
    description: 'Shared super-admin iCalendar feed generated for the key.',
    schema: {
      type: 'string',
      example: ICALENDAR_RESPONSE_EXAMPLE,
    },
  })
  async downloadSuperAdminCalendarFeed(
    @Param('feedKey') feedKey: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const download = await this.calendars.buildSuperAdminCalendarFeed(feedKey, this.getRequestOrigin(request));
    this.sendCalendar(response, download, 'private, max-age=900');
  }

  private sendCalendar(response: Response, download: CalendarDownload, cacheControl: string): void {
    response.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    response.setHeader('Content-Disposition', `attachment; filename="${download.fileName}"`);
    response.setHeader('Cache-Control', cacheControl);
    response.send(download.content);
  }

  private getRequestOrigin(request: Request): string {
    if (this.configuredPublicAppOrigin) {
      return this.configuredPublicAppOrigin;
    }

    const protocol = request.protocol;
    const host = request.get('host') || 'localhost';

    return `${protocol}://${host}`;
  }

  private readConfiguredPublicAppOrigin(): string | null {
    const rawOrigin = process.env.PUBLIC_APP_ORIGIN?.trim();
    if (!rawOrigin) {
      return null;
    }

    return new URL(rawOrigin).origin;
  }
}
