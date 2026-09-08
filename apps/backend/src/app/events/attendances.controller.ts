import { Controller, ForbiddenException, Headers, MessageEvent, Param, Req, Sse } from '@nestjs/common';
import { AttendanceCreationMethod, EventAttendanceStatus, SubscriptionStatus } from '@prisma/client';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { Observable, defer, interval, map, startWith, switchMap } from 'rxjs';
import { Permission } from '@cacic-fct/shared-permissions';
import { authenticateHttpRequest, type AuthenticatedRequest } from '../auth/authenticated-request';
import { AUTH_SESSION_COOKIE_NAME } from '../auth/auth.constants';
import { readAuthCookie } from '../auth/auth-cookie-utils';
import { KeycloakAuthService } from '../auth/keycloak-auth.service';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { AuthorizationPolicyService } from '../authorization/authorization-policy.service';
import { PrismaService } from '../prisma/prisma.service';
import { AttendanceCategoryService } from './attendance-category.service';
import { EventAttendancesScannerFeedSupport } from './attendances/shared/scanner-feed-support';
import { SseReplayService } from '../realtime/sse-replay.service';

type RequestWithUser = AuthenticatedRequest;

class EventAttendanceScannerFeedItemDto {
  @ApiProperty({
    description: 'Person identifier associated with the attendance record.',
    example: '018f47b1-5c4e-7c7b-9e6f-0c8c2f7281ad',
  })
  personId!: string;

  @ApiProperty({
    description: 'Event identifier for the attendance record.',
    example: '018f47b1-5c4e-7c7b-9e6f-0c8c2f7281ae',
  })
  eventId!: string;

  @ApiPropertyOptional({
    description: 'Participant name displayed in the scanner feed. Null when the person record cannot provide a name.',
    example: 'João Silva',
    nullable: true,
  })
  fullName!: string | null;

  @ApiPropertyOptional({
    description: 'Identity document, masked when it is a CPF.',
    example: '•••.982.247-••',
    nullable: true,
  })
  identityDocument!: string | null;

  @ApiPropertyOptional({
    description: 'Formatted UNESP role list joined for compact display in the scanner feed.',
    example: 'aluno-graduacao',
    nullable: true,
  })
  unespRole!: string | null;

  @ApiPropertyOptional({
    description:
      'Major-event subscription status for this participant when the scanned event belongs to a major event.',
    enum: SubscriptionStatus,
    enumName: 'SubscriptionStatus',
    nullable: true,
  })
  subscriptionStatus!: SubscriptionStatus | null;

  @ApiPropertyOptional({
    description: 'Timestamp when attendance was collected.',
    example: '2026-05-29T17:20:00.000Z',
    nullable: true,
  })
  attendedAt!: Date | null;

  @ApiPropertyOptional({
    description: 'Explicit oral-attendance decision. Null means no explicit decision exists.',
    enum: EventAttendanceStatus,
    enumName: 'EventAttendanceStatus',
    nullable: true,
  })
  status!: EventAttendanceStatus | null;

  @ApiPropertyOptional({
    description:
      'How the attendance record was created, useful for distinguishing scanner, manual, import, or other collection flows.',
    enum: AttendanceCreationMethod,
    enumName: 'AttendanceCreationMethod',
    nullable: true,
  })
  createdByMethod!: AttendanceCreationMethod | null;

  @ApiPropertyOptional({
    description:
      'First name of the user who collected the attendance, when the attendance record has a collector user.',
    example: 'João',
    nullable: true,
  })
  collectedByFirstName!: string | null;

  @ApiPropertyOptional({
    description: 'First name of the user who synchronized the attendance, when it differs from the original collector.',
    example: 'Maria',
    nullable: true,
  })
  committedByFirstName!: string | null;
}

class EventAttendanceScannerFeedEventDataDto {
  @ApiProperty({
    description: 'SSE event discriminator used by the Angular scanner/admin UI to route attendance feed updates.',
    example: 'event-attendance-scanner-feed',
  })
  type!: 'event-attendance-scanner-feed';

  @ApiProperty({
    description:
      'Latest attendance records for the event, ordered by most recently attended first and capped by the backend feed limit.',
    type: [EventAttendanceScannerFeedItemDto],
  })
  attendances!: EventAttendanceScannerFeedItemDto[];
}

class EventAttendanceScannerFeedMessageDto {
  @ApiProperty({
    description: 'SSE payload emitted to the event attendance scanner feed.',
    type: EventAttendanceScannerFeedEventDataDto,
  })
  data!: EventAttendanceScannerFeedEventDataDto;
}

@ApiTags('SSE', 'event-attendances')
@ApiBearerAuth()
@Controller('event-attendances')
export class EventAttendancesController extends EventAttendancesScannerFeedSupport {
  constructor(
    prisma: PrismaService,
    attendanceCategories: AttendanceCategoryService,
    private readonly replay: SseReplayService,
    private readonly keycloakAuthService: KeycloakAuthService,
    private readonly authorizationPolicy: AuthorizationPolicyService,
  ) {
    super(prisma, attendanceCategories);
  }

  @Sse('events/:eventId/scanner-feed/events')
  @RequirePermissions(Permission.EventAttendance.Read)
  @ApiOperation({
    summary: 'Stream event attendance scanner feed updates',
    description: [
      'Server-Sent Events stream used by the Angular attendance scanner/admin UI.',
      '',
      'The stream emits an initial snapshot immediately and then refreshes the latest attendance feed every two seconds while the connection remains open.',
      '',
      `Only callers with the \`${Permission.EventAttendance.Read}\` permission may subscribe.`,
      '',
      'Swagger UI documents this endpoint, but it is not a good interactive client for `text/event-stream`. Test it with the Angular EventSource client or an SSE-capable HTTP client.',
    ].join('\n'),
  })
  @ApiProduces('text/event-stream')
  @ApiParam({
    name: 'eventId',
    description: 'Event whose attendance feed should be streamed.',
    example: '018f47b1-5c4e-7c7b-9e6f-0c8c2f7281ae',
  })
  @ApiOkResponse({
    description: 'SSE stream emitting scanner-feed snapshots for the selected event.',
    type: EventAttendanceScannerFeedMessageDto,
  })
  @ApiForbiddenResponse({
    description: `Returned when the authenticated principal does not have the required permission: ${Permission.EventAttendance.Read}.`,
  })
  streamScannerFeed(
    @Param('eventId') eventId: string,
    @Headers('last-event-id') lastEventId: string | undefined,
    @Req() request: RequestWithUser,
  ): Observable<MessageEvent> {
    const snapshots = interval(2_000).pipe(
      startWith(0),
      switchMap(() => this.authorizedScannerSnapshot(eventId, request)),
      map((attendances) => ({
        data: {
          type: 'event-attendance-scanner-feed',
          attendances,
        },
      })),
    );

    const scope = this.replay.scope(
      'event-attendance-scanner-feed',
      eventId,
      request.user?.sub ?? readAuthCookie(request, AUTH_SESSION_COOKIE_NAME) ?? request.headers.cookie,
    );

    return defer(() => this.authorizeScannerFeed(eventId, request)).pipe(
      switchMap(() => this.replay.replay(scope, lastEventId, snapshots)),
    );
  }

  private async authorizedScannerSnapshot(eventId: string, request: RequestWithUser) {
    await this.authorizeScannerFeed(eventId, request);
    return this.getScannerFeed(eventId);
  }

  private async authorizeScannerFeed(eventId: string, request: RequestWithUser): Promise<void> {
    const user = await authenticateHttpRequest(request, this.keycloakAuthService);
    await this.authorizationPolicy.assertPermissions(user, [Permission.EventAttendance.Read], { eventId });
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, deletedAt: true },
    });
    if (!event || event.deletedAt) {
      throw new ForbiddenException('Attendance feed is not available for this event.');
    }
  }
}
