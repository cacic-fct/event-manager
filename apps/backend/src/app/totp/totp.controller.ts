import { BadRequestException, Controller, Get, Req } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { AUTH_SESSION_COOKIE_NAME } from '../auth/auth.constants';
import { AllowNonOnboarded } from '../auth/decorators/allow-non-onboarded.decorator';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { KeycloakAuthService } from '../auth/keycloak-auth.service';
import { AccountManagerTotpService } from './account-manager-totp.service';
import { WalletTotpSeedDto } from './dto';

type RequestWithUser = Request & {
  user?: AuthenticatedUser;
  cookies?: Record<string, unknown>;
};

@ApiTags('totp')
@Controller('totp')
export class TotpController {
  constructor(
    private readonly accountManagerTotp: AccountManagerTotpService,
    private readonly keycloakAuth: KeycloakAuthService,
  ) {}

  @Get('seed')
  @AllowNonOnboarded()
  @ApiCookieAuth(AUTH_SESSION_COOKIE_NAME)
  @ApiOperation({
    summary: 'Relay the current user TOTP seed for the public wallet',
    description:
      'Fetches the current authenticated user TOTP seed from Account Manager using M2M credentials and returns the Event Manager session expiration so the public app can clear its IndexedDB cache.',
  })
  @ApiOkResponse({
    type: WalletTotpSeedDto,
    description: 'TOTP seed and session lifetime for the authenticated user.',
  })
  async relayCurrentUserSeed(@Req() request: RequestWithUser): Promise<WalletTotpSeedDto> {
    const userId = request.user?.sub;
    if (!userId) {
      throw new BadRequestException('Authenticated user is missing a subject identifier.');
    }

    const sessionId = this.readCookie(request, AUTH_SESSION_COOKIE_NAME);
    const sessionExpiresAt = sessionId ? await this.keycloakAuth.getSessionExpiration(sessionId) : null;
    if (!sessionExpiresAt) {
      throw new BadRequestException('Authenticated session is missing or expired.');
    }

    return {
      ...(await this.accountManagerTotp.relaySeed(userId)),
      sessionExpiresAt,
    };
  }

  private readCookie(request: RequestWithUser, name: string): string | null {
    const parsedCookie = request.cookies?.[name];
    if (typeof parsedCookie === 'string') {
      return parsedCookie;
    }

    const cookieHeader = request.headers.cookie;
    if (!cookieHeader) {
      return null;
    }

    const cookies = cookieHeader.split(';');
    for (const cookie of cookies) {
      const [cookieName, ...rest] = cookie.trim().split('=');
      if (cookieName !== name || rest.length === 0) {
        continue;
      }

      return decodeURIComponent(rest.join('='));
    }

    return null;
  }
}
