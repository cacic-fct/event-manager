import { BadRequestException, Controller, Get, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOkResponse, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { CacicTrackingSessionResponse } from '@cacic-fct/account-manager-m2m-contracts';
import type { Request, Response } from 'express';
import { AllowNonOnboarded } from '../auth/decorators/allow-non-onboarded.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { AccountManagerPrivacySyncService } from './account-manager-privacy-sync.service';
import { clearCacicTrackingCookies, refreshCacicTrackingCookies } from './tracking-cookie.utils';

type RequestWithUser = Request & {
  user?: AuthenticatedUser;
};

@ApiTags('tracking')
@Controller('tracking')
export class TrackingController {
  constructor(
    private readonly accountManagerPrivacySync: AccountManagerPrivacySyncService,
    private readonly configService: ConfigService,
  ) {}

  @Get('session')
  @AllowNonOnboarded()
  @ApiOperation({
    summary: 'Refresh shared CACiC analytics cookies',
    description:
      'Refreshes shared CACiC analytics cookies from the authenticated Event Manager session and Account Manager privacy settings.',
  })
  @ApiOkResponse({
    description: 'Tracking cookies were refreshed or cleared based on Account Manager privacy settings.',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - user is not authenticated.' })
  async refreshSessionTracking(
    @Req() request: RequestWithUser,
    @Res({ passthrough: true }) response: Response,
  ): Promise<CacicTrackingSessionResponse> {
    const userId = request.user?.sub;
    if (!userId) {
      throw new BadRequestException('Authenticated user is missing a subject identifier.');
    }

    const settings = await this.accountManagerPrivacySync.getUserPrivacySettings(userId);
    const analyticsAllowed = settings.settings.cookie_banner_accepted && settings.settings.analytics_tracking;

    return refreshCacicTrackingCookies(response, this.configService, {
      analyticsAllowed,
      cookieBannerAccepted: settings.settings.cookie_banner_accepted,
      keycloakId: userId,
      updatedAt: this.resolveDate(settings.updatedAt),
    });
  }

  @Post('clear')
  @Public()
  @ApiOperation({
    summary: 'Clear shared CACiC analytics cookies',
    description: 'Clears shared analytics and privacy directive cookies during logout flows.',
  })
  @ApiOkResponse({
    description: 'Tracking cookies were cleared.',
  })
  clearTrackingCookies(@Res({ passthrough: true }) response: Response): { cleared: true } {
    clearCacicTrackingCookies(response, this.configService);
    return { cleared: true };
  }

  private resolveDate(value: Date | string): Date {
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? new Date() : date;
  }
}
