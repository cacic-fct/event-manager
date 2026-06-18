import { Controller, ForbiddenException, Get, Req, ServiceUnavailableException } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { NovuSubscriberSession } from '@cacic-fct/shared-data-types';
import { Request } from 'express';
import { AUTH_SESSION_COOKIE_NAME } from '../auth/auth.constants';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { CurrentUserContextService } from '../current-user/context.service';
import { NovuNotificationsService } from './novu-notifications.service';

type RequestWithUser = Request & {
  user?: AuthenticatedUser;
};

class NovuSubscriberSessionResponseDto implements NovuSubscriberSession {
  @ApiProperty({
    description: 'Public Novu application identifier for the configured environment.',
    example: 'novu-application-identifier',
  })
  applicationIdentifier!: string;

  @ApiProperty({
    description: 'Subscriber identifier resolved from the authenticated backend user/person context.',
    example: '018f47b1-5c4e-7c7b-9e6f-0c8c2f7281ad',
  })
  subscriberId!: string;

  @ApiProperty({
    description: 'HMAC SHA-256 signature for subscriberId generated with the server-side Novu secret key.',
    example: '50e3b7e15b3f8f8f6ec65f19c68b4d0c0b314d4c2f64c75b77f97fb82709750d',
  })
  subscriberHash!: string;

  @ApiPropertyOptional({
    description: 'Browser SDK API URL for the Novu deployment.',
    example: 'https://notifications.example.com/api',
  })
  apiUrl?: string;

  @ApiPropertyOptional({
    description: 'Browser SDK socket URL for the Novu deployment.',
    example: 'https://notifications.example.com',
  })
  socketUrl?: string;

  @ApiPropertyOptional({
    description: 'Socket.IO path for the Novu deployment.',
    example: '/socket.io',
  })
  socketPath?: string;

  @ApiPropertyOptional({
    description: 'Novu push integration identifier used when registering this browser for push notifications.',
    example: 'firebase-cloud-messaging',
    nullable: true,
  })
  pushIntegrationIdentifier?: string | null;

  @ApiPropertyOptional({
    description: 'VAPID public key used for browser push subscriptions.',
    nullable: true,
  })
  vapidPublicKey?: string | null;
}

@ApiTags('Notifications')
@Controller('notifications')
export class NovuNotificationsController {
  constructor(
    private readonly currentUserContext: CurrentUserContextService,
    private readonly notifications: NovuNotificationsService,
  ) {}

  @Get('novu-session')
  @ApiBearerAuth()
  @ApiCookieAuth(AUTH_SESSION_COOKIE_NAME)
  @ApiOperation({
    summary: 'Create a signed Novu browser session',
    description:
      'Returns the Novu browser configuration for the authenticated user with a server-generated subscriber hash. The subscriber identifier is resolved from the backend current-user context instead of trusting browser-supplied identity.',
  })
  @ApiOkResponse({
    type: NovuSubscriberSessionResponseDto,
    description: 'Signed Novu browser session for the authenticated subscriber.',
  })
  @ApiForbiddenResponse({
    description: 'Returned when no authenticated identity was attached to the request.',
  })
  @ApiServiceUnavailableResponse({
    description:
      'Returned when Novu secure mode is not enabled or the required server-side signing configuration is missing.',
  })
  async createNovuSession(@Req() request: RequestWithUser): Promise<NovuSubscriberSession> {
    if (!request.user) {
      throw new ForbiddenException('User is not authenticated.');
    }

    const { person } = await this.currentUserContext.resolveCurrentUserContext(request.user, true);
    const recipient = person
      ? this.notifications.mapPersonToRecipient(person)
      : this.notifications.mapAuthenticatedUserToRecipient(request.user);
    const session = this.notifications.createSubscriberSession(recipient);

    if (!session) {
      throw new ServiceUnavailableException('Novu notifications are not configured.');
    }

    return session;
  }
}
