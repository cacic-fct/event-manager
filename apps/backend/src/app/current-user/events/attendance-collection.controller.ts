import { Controller, MessageEvent, Param, Req, Sse } from '@nestjs/common';
import { AttendanceCreationMethod, SubscriptionStatus } from '@prisma/client';
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
import { Request } from 'express';
import { Observable, interval, map, startWith, switchMap } from 'rxjs';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { AuthorizationPolicyService } from '../../authorization/authorization-policy.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AttendanceCategoryService } from '../../events/attendance-category.service';
import { EventAttendancesScannerFeedSupport } from '../../events/attendances/shared/scanner-feed-support';
import { CurrentUserContextService } from '../context.service';

type RequestWithUser = Request & {
  user?: AuthenticatedUser;
};

class EventAttendanceScannerFeedItemDto {
  @ApiProperty({
    description: 'Person identifier associated with the attendance record.',
    example: '018f47b1-5c4e-7c7b-9e6f-0c8c2f7281ad',
  })
  personId!: string;

  @ApiProperty({
    description: 'Event identifier for the attendance record.',
    example: '018f47b1-5c4e-7c7b-9e6f-0c8c2f7281ad',
  })
  eventId!: string;

  @ApiPropertyOptional({
    description:
      'Participant name displayed in the Angular scanner feed. Null when the person record cannot provide a name.',
    example: 'João Silva',
    nullable: true,
  })
  fullName!: string | null;

  @ApiPropertyOptional({
    description: 'Unesp role list joined for compact display in the scanner feed.',
    example: 'aluno-graduacao',
    nullable: true,
  })
  unespRole!: string | null;

  @ApiPropertyOptional({
    description: 'Major-event subscription status for this participant when the event belongs to a major event.',
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
    description:
      'How the attendance record was created, useful for distinguishing QR-code scans, manual entries, imports, or other collection flows.',
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
    description:
      'First name of the user who synchronized the attendance, when it differs from the original collector.',
    example: 'Maria',
    nullable: true,
  })
  committedByFirstName!: string | null;
}

class EventAttendanceScannerFeedEventDataDto {
  @ApiProperty({
    description: 'SSE event discriminator used by the Angular scanner screen to route attendance feed updates.',
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
    description: 'SSE payload emitted to the Angular attendance scanner feed.',
    type: EventAttendanceScannerFeedEventDataDto,
  })
  data!: EventAttendanceScannerFeedEventDataDto;
}

@ApiTags('SSE', 'attendance-collection')
@Controller('attendance-collection')
export class CurrentUserAttendanceCollectionController extends EventAttendancesScannerFeedSupport {
  constructor(
    prisma: PrismaService,
    attendanceCategories: AttendanceCategoryService,
    private readonly currentUserContext: CurrentUserContextService,
    private readonly authorizationPolicy: AuthorizationPolicyService,
  ) {
    super(prisma, attendanceCategories);
  }

  @Sse('events/:eventId/feed/events')
  @ApiOperation({
    summary: 'Stream attendance scanner feed updates',
    description:
      'Server-Sent Events stream used by the Angular attendance collection screen. The stream verifies that the current user is allowed to collect attendance for the event, emits an initial snapshot immediately, and then refreshes the scanner feed every two seconds while the connection remains open.',
  })
  @ApiProduces('text/event-stream')
  @ApiParam({
    name: 'eventId',
    description: 'Event whose attendance feed is being observed by an authorized collector.',
    example: '018f47b1-5c4e-7c7b-9e6f-0c8c2f7281ad',
  })
  @ApiOkResponse({
    description: 'SSE stream emitting scanner-feed snapshots for the selected event.',
    type: EventAttendanceScannerFeedMessageDto,
  })
  @ApiForbiddenResponse({
    description:
      'Returned when the current person is not configured as an attendance collector for the event, the event is deleted or not public, attendance collection is disabled, or the collection window is closed.',
  })
  @ApiBearerAuth()
  streamFeed(@Param('eventId') eventId: string, @Req() request: RequestWithUser): Observable<MessageEvent> {
    return interval(2_000).pipe(
      startWith(0),
      switchMap(async () => {
        await this.requireCollector(eventId, request, true);
        return this.getScannerFeed(eventId);
      }),
      map((attendances) => ({
        data: {
          type: 'event-attendance-scanner-feed',
          attendances,
        },
      })),
    );
  }

  private async requireCollector(eventId: string, request: RequestWithUser, enforceCollectionWindow: boolean) {
    const collectorPerson = await this.currentUserContext.requireCurrentPerson({
      req: request,
    });
    await this.authorizationPolicy.assertAttendanceCollectorForEvent(eventId, collectorPerson.id, {
      enforceCollectionWindow,
      user: request.user,
    });

    return {
      collectorPerson,
      collectorUserId: request.user?.sub,
    };
  }

}
