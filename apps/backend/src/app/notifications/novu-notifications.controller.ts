import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  type RawBodyRequest,
  HttpCode,
  Post,
  Req,
  ServiceUnavailableException,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { REST_VALIDATION_PIPE } from '../common/rest-validation.pipe';
import { IsString, Length, Matches } from 'class-validator';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiServiceUnavailableResponse,
  ApiNoContentResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { NovuSubscriberSession } from '@cacic-fct/shared-data-types';
import { type Request } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { assertPushEndpoint, NovuWebPushService } from './novu-web-push.service';
import { AUTH_SESSION_COOKIE_NAME } from '../auth/auth.constants';
import { type AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { CurrentUserContextService } from '../current-user/context.service';
import { NovuNotificationsService } from './novu-notifications.service';
import type { NotificationRecipient } from './novu-notification.types';
import { RateLimit } from '../rate-limit/rate-limit.decorator';
import { RateLimitGuard } from '../rate-limit/rate-limit.guard';
import { RATE_LIMIT_POLICIES } from '../rate-limit/rate-limit.policies';

class RegisterWebPushSubscriptionDto {
  @ApiProperty({ description: 'Expected subscriber from the signed session.', example: 'user-1' })
  @IsString()
  @Length(1, 200)
  subscriberId!: string;

  @ApiProperty({ description: 'HTTPS endpoint provided by the browser push service.' })
  @IsString()
  @Length(1, 2048)
  endpoint!: string;

  @ApiProperty({ description: 'Browser public encryption key in base64url.' })
  @IsString()
  @Matches(/^B[A-Za-z0-9_-]{86}$/)
  p256dh!: string;

  @ApiProperty({ description: 'Browser encryption secret in base64url.' })
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{22}$/)
  auth!: string;
}

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
    example: 'push-webhook-example',
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
    private readonly webPush: NovuWebPushService,
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
    const recipient = await this.currentRecipient(request);
    const session = this.notifications.createSubscriberSession(recipient);

    if (!session) {
      throw new ServiceUnavailableException('Novu notifications are not configured.');
    }

    return session;
  }

  @Post('push-subscription')
  @UsePipes(REST_VALIDATION_PIPE)
  @HttpCode(204)
  @UseGuards(RateLimitGuard)
  @RateLimit(RATE_LIMIT_POLICIES.notificationPushRegistration)
  @ApiBearerAuth()
  @ApiCookieAuth(AUTH_SESSION_COOKIE_NAME)
  @ApiOperation({
    summary: 'Register this browser for push notifications',
    description: 'Saves this browser’s Web Push subscription for the authenticated subscriber.',
  })
  @ApiForbiddenResponse({ description: 'An authenticated identity is required.' })
  @ApiNoContentResponse({ description: 'This browser subscription was registered for the authenticated subscriber.' })
  @ApiServiceUnavailableResponse({ description: 'Push registration is unavailable.' })
  async registerPushSubscription(
    @Req() request: RequestWithUser,
    @Body() body: RegisterWebPushSubscriptionDto,
  ): Promise<void> {
    const recipient = await this.currentRecipient(request);
    if (recipient.subscriberId !== body.subscriberId) {
      throw new ForbiddenException('The notification session belongs to a different user.');
    }
    assertPushEndpoint(body.endpoint);
    if (
      !this.notifications.createSubscriberSession(recipient)?.vapidPublicKey ||
      !(await this.notifications.registerWebPushRecipient(recipient))
    ) {
      throw new ServiceUnavailableException('Push registration is unavailable.');
    }
    await this.webPush.saveSubscription(recipient.subscriberId, {
      endpoint: body.endpoint,
      keys: { p256dh: body.p256dh, auth: body.auth },
    });
  }

  @Public()
  @Post('push-webhook')
  @HttpCode(200)
  @ApiOperation({ summary: 'Deliver a signed Novu Push Webhook to subscribed browsers' })
  @ApiOkResponse({ description: 'Novu message identifier.' })
  @ApiForbiddenResponse({ description: 'The Novu signature is missing or invalid.' })
  async deliverPushWebhook(
    @Req() request: RawBodyRequest<Request>,
    @Headers('x-novu-signature') signature: string | undefined,
  ): Promise<{ id: string }> {
    return this.webPush.deliver(request.rawBody, signature, request.body);
  }

  private async currentRecipient(request: RequestWithUser): Promise<NotificationRecipient> {
    if (!request.user) {
      throw new ForbiddenException('User is not authenticated.');
    }

    const { person } = await this.currentUserContext.resolveCurrentUserContext(request.user, true);
    return person
      ? this.notifications.mapPersonToRecipient(person)
      : this.notifications.mapAuthenticatedUserToRecipient(request.user);
  }
}
