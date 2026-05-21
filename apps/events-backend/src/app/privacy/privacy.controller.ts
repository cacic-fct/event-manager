import { BadRequestException, Controller, Post, Req } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { AccountManagerPrivacySyncService } from './account-manager-privacy-sync.service';

type RequestWithUser = Request & {
  user?: AuthenticatedUser;
};

@ApiTags('privacy')
@Controller('privacy')
export class PrivacyController {
  constructor(private readonly accountManagerPrivacySync: AccountManagerPrivacySyncService) {}

  @Post('cookie-banner/accept')
  @ApiOkResponse({ description: 'Cookie banner acceptance was synced for the authenticated user.' })
  async acceptCookieBanner(@Req() request: RequestWithUser): Promise<{ synced: true }> {
    const userId = request.user?.sub;
    if (!userId) {
      throw new BadRequestException('Authenticated user is missing a subject identifier.');
    }

    await this.accountManagerPrivacySync.recordCookieConsent(userId);

    return { synced: true };
  }
}
