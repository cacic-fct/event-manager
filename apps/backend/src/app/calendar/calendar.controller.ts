import { Controller, Get, Param, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiProduces, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { CalendarDownload } from './calendar.models';
import { CalendarService } from './calendar.service';

@ApiTags('Calendar')
@Public()
@Controller('calendar')
export class CalendarController {
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
  })
  @ApiProduces('text/calendar')
  @ApiResponse({ status: 200, description: 'iCalendar file generated for the public event.' })
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
  })
  @ApiProduces('text/calendar')
  @ApiResponse({ status: 200, description: 'Private iCalendar feed generated for the key owner.' })
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
  })
  @ApiProduces('text/calendar')
  @ApiResponse({ status: 200, description: 'Private admin iCalendar feed generated for the key owner.' })
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
  })
  @ApiProduces('text/calendar')
  @ApiResponse({ status: 200, description: 'Shared super-admin iCalendar feed generated for the key.' })
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
    const forwardedProto = this.readForwardedHeader(request, 'x-forwarded-proto')?.split(',')[0]?.trim();
    const forwardedHost = this.readForwardedHeader(request, 'x-forwarded-host')?.split(',')[0]?.trim();
    const protocol = forwardedProto || request.protocol;
    const host = forwardedHost || request.get('host') || 'localhost';

    return `${protocol}://${host}`;
  }

  private readForwardedHeader(request: Request, header: string): string | undefined {
    const value = request.headers[header];
    return Array.isArray(value) ? value[0] : value;
  }
}
