import { Controller, Injectable, Logger, MessageEvent, Query, Req, Sse } from '@nestjs/common';
import { SubscriptionStatus } from '@prisma/client';
import type { Request } from 'express';
import { Observable, Subject, interval, map, merge } from 'rxjs';
import {
  ApiBearerAuth,
  ApiExtraModels,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiProperty,
  ApiQuery,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import { AUTH_SESSION_COOKIE_NAME } from '../../auth/auth.constants';
import { KeycloakAuthService } from '../../auth/keycloak-auth.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CurrentUserEventMapperService } from '../mapper.service';
import { CurrentUserPendingOnlineAttendanceEvent } from '../models';
import { PUBLIC_EVENT_SELECT, PublicEventSubscriptionSummary } from '../../public-events/models';
import { CurrentUserContextService } from '../context.service';
import { PublicEventsResolver } from '../../public-events/events.resolver';

const ONLINE_ATTENDANCE_CHANNEL = 'current-user.online-attendance';
const MAJOR_EVENT_SUBSCRIPTION_CHANNEL = 'public.major-event-subscription';
const EVENT_SUBSCRIPTION_CHANNEL = 'current-user.event-subscription';

type RequestWithCookies = Request & {
  cookies?: Record<string, unknown>;
};

interface RealtimeClient {
  personId?: string;
  events: Subject<RealtimeServerMessage>;
  majorEventSubscriptionIds: Set<string>;
  eventSubscriptionIds: Set<string>;
}

interface PendingOnlineAttendanceMessage {
  type: 'event';
  channel: typeof ONLINE_ATTENDANCE_CHANNEL;
  event: 'pendingOnlineAttendancesChanged';
  payload: {
    eventIds: string[];
  };
}

interface MajorEventSubscriptionChangedMessage {
  type: 'event';
  channel: typeof MAJOR_EVENT_SUBSCRIPTION_CHANNEL;
  event: 'majorEventSubscriptionChanged';
  majorEventId: string;
  payload: {
    subscriptionSummaries: PublicEventSubscriptionSummary[];
  };
}

interface EventSubscriptionChangedMessage {
  type: 'event';
  channel: typeof EVENT_SUBSCRIPTION_CHANNEL;
  event: 'eventSubscriptionAvailabilityChanged';
  eventId: string;
  payload: {
    eventId: string;
    hasAvailableSlots: boolean;
  };
}

type RealtimeServerMessage =
  | PendingOnlineAttendanceMessage
  | MajorEventSubscriptionChangedMessage
  | EventSubscriptionChangedMessage;

@Injectable()
export class CurrentUserOnlineAttendanceRealtimeService {
  private readonly logger = new Logger(CurrentUserOnlineAttendanceRealtimeService.name);
  private readonly clients = new Set<RealtimeClient>();
  private readonly majorEventSubscriptionSnapshots = new Map<string, string>();
  private readonly eventSubscriptionSnapshots = new Map<string, string>();
  private readonly heartbeat$ = interval(25_000).pipe(
    map(() => ({
      data: {
        type: 'heartbeat',
        timestamp: Date.now(),
      },
    })),
  );

  private majorEventSubscriptionInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly auth: KeycloakAuthService,
    private readonly currentUserContext: CurrentUserContextService,
    private readonly mapper: CurrentUserEventMapperService,
    private readonly prisma: PrismaService,
    private readonly publicEvents: PublicEventsResolver,
  ) {}

  stream(
    request: Request,
    majorEventSubscriptionIds: string[],
    eventSubscriptionIds: string[],
  ): Observable<MessageEvent> {
    this.ensureMajorEventSubscriptionPolling();

    const events = new Subject<RealtimeServerMessage>();
    const client: RealtimeClient = {
      events,
      majorEventSubscriptionIds: new Set(majorEventSubscriptionIds),
      eventSubscriptionIds: new Set(eventSubscriptionIds),
    };

    this.clients.add(client);

    void this.resolvePersonId(request).then((personId) => {
      client.personId = personId ?? undefined;

      if (personId) {
        void this.notifyPerson(personId);
      }
    });

    for (const majorEventId of client.majorEventSubscriptionIds) {
      void this.notifyMajorEvent(client, majorEventId);
    }

    for (const eventId of client.eventSubscriptionIds) {
      void this.notifyEventSubscription(client, eventId);
    }

    return new Observable<MessageEvent>((subscriber) => {
      const subscription = merge(
        events.pipe(map((message) => this.toMessageEvent(message))),
        this.heartbeat$,
      ).subscribe(subscriber);

      return () => {
        subscription.unsubscribe();
        events.complete();
        this.clients.delete(client);
      };
    });
  }

  private ensureMajorEventSubscriptionPolling(): void {
    if (this.majorEventSubscriptionInterval) {
      return;
    }

    this.majorEventSubscriptionInterval = setInterval(() => {
      void this.notifySubscribedMajorEvents();
    }, 3_000);
  }

  async listPendingOnlineAttendanceEvents(personId: string): Promise<CurrentUserPendingOnlineAttendanceEvent[]> {
    const now = new Date();
    const events = await this.prisma.event.findMany({
      where: {
        deletedAt: null,
        shouldCollectAttendance: true,
        isOnlineAttendanceAllowed: true,

        onlineAttendanceStartDate: {
          lte: now,
        },
        onlineAttendanceEndDate: {
          gte: now,
        },

        attendances: {
          none: {
            personId,
          },
        },

        OR: [
          {
            allowSubscription: false,
          },
          {
            subscriptions: {
              some: {
                personId,
                deletedAt: null,
              },
            },
          },
        ],

        AND: [
          {
            OR: [
              {
                majorEventId: null,
              },
              {
                majorEvent: {
                  isPaymentRequired: false,
                },
              },
              {
                majorEvent: {
                  subscriptions: {
                    some: {
                      personId,
                      deletedAt: null,
                      subscriptionStatus: SubscriptionStatus.CONFIRMED,
                    },
                  },
                },
              },
            ],
          },
        ],
      },
      select: {
        ...PUBLIC_EVENT_SELECT,
      },
      orderBy: {
        startDate: 'asc',
      },
    });

    return events.map((event) => ({
      eventId: event.id,
      event: this.mapper.mapPublicEvent(event),
    }));
  }

  async notifyAllConnectedPeople(): Promise<void> {
    const personIds = new Set(
      [...this.clients].map((client) => client.personId).filter((personId): personId is string => Boolean(personId)),
    );

    await Promise.all([...personIds].map((personId) => this.notifyPerson(personId)));
  }

  async notifyPerson(personId: string): Promise<void> {
    const eventIds = (await this.listPendingOnlineAttendanceEvents(personId)).map((item) => item.eventId);

    const message: PendingOnlineAttendanceMessage = {
      type: 'event',
      channel: ONLINE_ATTENDANCE_CHANNEL,
      event: 'pendingOnlineAttendancesChanged',
      payload: {
        eventIds,
      },
    };

    for (const client of this.clients) {
      if (client.personId === personId) {
        client.events.next(message);
      }
    }
  }

  private async notifySubscribedMajorEvents(): Promise<void> {
    const majorEventIds = new Set([...this.clients].flatMap((client) => [...client.majorEventSubscriptionIds]));

    const eventIds = new Set([...this.clients].flatMap((client) => [...client.eventSubscriptionIds]));

    await Promise.all([
      ...[...majorEventIds].map((majorEventId) => this.notifyMajorEventSubscribers(majorEventId)),
      ...[...eventIds].map((eventId) => this.notifyEventSubscriptionSubscribers(eventId)),
    ]);
  }

  private async notifyMajorEventSubscribers(majorEventId: string) {
    let payload: MajorEventSubscriptionChangedMessage['payload'];

    try {
      payload = await this.getMajorEventSubscriptionDeltaPayload(majorEventId);
    } catch (error) {
      this.logger.warn(error instanceof Error ? error.message : 'Could not publish major-event subscription update.');
      return;
    }

    const message: MajorEventSubscriptionChangedMessage = {
      type: 'event',
      channel: MAJOR_EVENT_SUBSCRIPTION_CHANNEL,
      event: 'majorEventSubscriptionChanged',
      majorEventId,
      payload,
    };

    const serializedMessage = JSON.stringify(message);
    const previousSnapshot = this.majorEventSubscriptionSnapshots.get(majorEventId);

    if (previousSnapshot === serializedMessage) {
      return;
    }

    this.majorEventSubscriptionSnapshots.set(majorEventId, serializedMessage);

    for (const client of this.clients) {
      if (client.majorEventSubscriptionIds.has(majorEventId)) {
        client.events.next(message);
      }
    }
  }

  private async notifyMajorEvent(client: RealtimeClient, majorEventId: string): Promise<void> {
    try {
      const payload = await this.getMajorEventSubscriptionDeltaPayload(majorEventId);

      const message = {
        type: 'event',
        channel: MAJOR_EVENT_SUBSCRIPTION_CHANNEL,
        event: 'majorEventSubscriptionChanged',
        majorEventId,
        payload,
      } satisfies MajorEventSubscriptionChangedMessage;

      const serializedMessage = JSON.stringify(message);
      this.majorEventSubscriptionSnapshots.set(majorEventId, serializedMessage);
      client.events.next(message);
    } catch (error) {
      this.logger.warn(error instanceof Error ? error.message : 'Could not publish major-event subscription update.');
    }
  }

  private async notifyEventSubscriptionSubscribers(eventId: string): Promise<void> {
    let payload: EventSubscriptionChangedMessage['payload'];

    try {
      payload = await this.getEventSubscriptionDeltaPayload(eventId);
    } catch (error) {
      this.logger.warn(error instanceof Error ? error.message : 'Could not publish event subscription update.');
      return;
    }

    const message: EventSubscriptionChangedMessage = {
      type: 'event',
      channel: EVENT_SUBSCRIPTION_CHANNEL,
      event: 'eventSubscriptionAvailabilityChanged',
      eventId,
      payload,
    };

    const serializedMessage = JSON.stringify(message);
    const previousSnapshot = this.eventSubscriptionSnapshots.get(eventId);

    if (previousSnapshot === serializedMessage) {
      return;
    }

    this.eventSubscriptionSnapshots.set(eventId, serializedMessage);

    for (const client of this.clients) {
      if (client.eventSubscriptionIds.has(eventId)) {
        client.events.next(message);
      }
    }
  }

  private async notifyEventSubscription(client: RealtimeClient, eventId: string): Promise<void> {
    try {
      const payload = await this.getEventSubscriptionDeltaPayload(eventId);

      const message = {
        type: 'event',
        channel: EVENT_SUBSCRIPTION_CHANNEL,
        event: 'eventSubscriptionAvailabilityChanged',
        eventId,
        payload,
      } satisfies EventSubscriptionChangedMessage;

      const serializedMessage = JSON.stringify(message);
      this.eventSubscriptionSnapshots.set(eventId, serializedMessage);
      client.events.next(message);
    } catch (error) {
      this.logger.warn(error instanceof Error ? error.message : 'Could not publish event subscription update.');
    }
  }

  private toMessageEvent(message: RealtimeServerMessage): MessageEvent {
    return {
      data: message,
    };
  }

  private async getMajorEventSubscriptionDeltaPayload(
    majorEventId: string,
  ): Promise<MajorEventSubscriptionChangedMessage['payload']> {
    const page = await this.publicEvents.getPublicEventSubscriptionPagePayload(majorEventId);

    return {
      subscriptionSummaries: page.subscriptionSummaries,
    };
  }

  private async getEventSubscriptionDeltaPayload(eventId: string): Promise<EventSubscriptionChangedMessage['payload']> {
    const summary = await this.publicEvents.publicEventSubscriptionSummary(eventId);

    return {
      eventId: summary.eventId,
      hasAvailableSlots: summary.hasAvailableSlots,
    };
  }

  private async resolvePersonId(request: Request): Promise<string | null> {
    const sessionId = this.readCookie(request, AUTH_SESSION_COOKIE_NAME);

    if (!sessionId) {
      return null;
    }

    const user = await this.auth.authenticateSession(sessionId);
    const { person } = await this.currentUserContext.resolveCurrentUserContext(user);

    return person?.id ?? null;
  }

  private readCookie(request: Request, name: string): string | null {
    const parsedCookie = (request as RequestWithCookies).cookies?.[name];

    if (typeof parsedCookie === 'string') {
      return parsedCookie;
    }

    const cookieHeader = request.headers.cookie;

    if (!cookieHeader) {
      return null;
    }

    for (const cookie of cookieHeader.split(';')) {
      const [cookieName, ...rest] = cookie.trim().split('=');

      if (cookieName === name && rest.length > 0) {
        return decodeURIComponent(rest.join('='));
      }
    }

    return null;
  }
}

class RealtimeHeartbeatDataDto {
  @ApiProperty({
    description:
      'Heartbeat discriminator used by the Angular client to observe that the SSE connection is still alive.',
    example: 'heartbeat',
  })
  type!: 'heartbeat';

  @ApiProperty({
    description: 'Server timestamp in milliseconds since epoch.',
    example: 1767225599000,
  })
  timestamp!: number;
}

class PendingOnlineAttendancesChangedPayloadDto {
  @ApiProperty({
    description: 'Event identifiers for which the current authenticated user still has pending online attendance.',
    example: ['018f47b1-5c4e-7c7b-9e6f-0c8c2f7281ad', '018f47b1-5c4e-7c7b-9e6f-0c8c2f7281ae'],
    type: [String],
  })
  eventIds!: string[];
}

class PendingOnlineAttendancesChangedDataDto {
  @ApiProperty({
    description: 'Realtime message kind.',
    example: 'event',
  })
  type!: 'event';

  @ApiProperty({
    description: 'Realtime channel for current-user online attendance updates.',
    example: ONLINE_ATTENDANCE_CHANNEL,
  })
  channel!: typeof ONLINE_ATTENDANCE_CHANNEL;

  @ApiProperty({
    description: 'Emitted when the current user pending online-attendance list changes.',
    example: 'pendingOnlineAttendancesChanged',
  })
  event!: 'pendingOnlineAttendancesChanged';

  @ApiProperty({
    description: 'Pending online-attendance state for the current authenticated user.',
    type: PendingOnlineAttendancesChangedPayloadDto,
  })
  payload!: PendingOnlineAttendancesChangedPayloadDto;
}

class PublicEventSubscriptionSummaryDto {
  @ApiProperty({
    description: 'Event whose subscription availability is summarized.',
    example: '018f47b1-5c4e-7c7b-9e6f-0c8c2f7281af',
  })
  eventId!: string;

  @ApiProperty({
    description: 'Whether the event currently has available slots.',
    example: true,
  })
  hasAvailableSlots!: boolean;
}

class MajorEventSubscriptionChangedPayloadDto {
  @ApiProperty({
    description:
      'Public subscription summaries for the subscribed major event. Used by the Angular frontend to refresh availability indicators without reloading the whole event page.',
    type: [PublicEventSubscriptionSummaryDto],
  })
  subscriptionSummaries!: PublicEventSubscriptionSummaryDto[];
}

class MajorEventSubscriptionChangedDataDto {
  @ApiProperty({
    description: 'Realtime message kind.',
    example: 'event',
  })
  type!: 'event';

  @ApiProperty({
    description: 'Realtime channel for major-event subscription summary updates.',
    example: MAJOR_EVENT_SUBSCRIPTION_CHANNEL,
  })
  channel!: typeof MAJOR_EVENT_SUBSCRIPTION_CHANNEL;

  @ApiProperty({
    description: 'Emitted when the public subscription summary for a major event changes.',
    example: 'majorEventSubscriptionChanged',
  })
  event!: 'majorEventSubscriptionChanged';

  @ApiProperty({
    description: 'Major event whose subscription summary changed.',
    example: '018f47b1-5c4e-7c7b-9e6f-0c8c2f7281ad',
  })
  majorEventId!: string;

  @ApiProperty({
    description: 'Major-event subscription summary payload used by public event pages.',
    type: MajorEventSubscriptionChangedPayloadDto,
  })
  payload!: MajorEventSubscriptionChangedPayloadDto;
}

class EventSubscriptionAvailabilityChangedPayloadDto {
  @ApiProperty({
    description: 'Event whose availability was recalculated.',
    example: '018f47b1-5c4e-7c7b-9e6f-0c8c2f7281af',
  })
  eventId!: string;

  @ApiProperty({
    description: 'Whether the event currently has available slots according to the public subscription summary.',
    example: true,
  })
  hasAvailableSlots!: boolean;
}

class EventSubscriptionAvailabilityChangedDataDto {
  @ApiProperty({
    description: 'Realtime message kind.',
    example: 'event',
  })
  type!: 'event';

  @ApiProperty({
    description: 'Realtime channel for individual event subscription availability updates.',
    example: EVENT_SUBSCRIPTION_CHANNEL,
  })
  channel!: typeof EVENT_SUBSCRIPTION_CHANNEL;

  @ApiProperty({
    description: 'Emitted when an individual event availability snapshot changes.',
    example: 'eventSubscriptionAvailabilityChanged',
  })
  event!: 'eventSubscriptionAvailabilityChanged';

  @ApiProperty({
    description: 'Event whose availability changed.',
    example: '018f47b1-5c4e-7c7b-9e6f-0c8c2f7281af',
  })
  eventId!: string;

  @ApiProperty({
    description: 'Event availability payload used by Angular subscription controls.',
    type: EventSubscriptionAvailabilityChangedPayloadDto,
  })
  payload!: EventSubscriptionAvailabilityChangedPayloadDto;
}

class RealtimeHeartbeatMessageDto {
  @ApiProperty({
    description: 'Heartbeat SSE message.',
    type: RealtimeHeartbeatDataDto,
  })
  data!: RealtimeHeartbeatDataDto;
}

class PendingOnlineAttendancesChangedMessageDto {
  @ApiProperty({
    description: 'Current-user online attendance SSE message.',
    type: PendingOnlineAttendancesChangedDataDto,
  })
  data!: PendingOnlineAttendancesChangedDataDto;
}

class MajorEventSubscriptionChangedMessageDto {
  @ApiProperty({
    description: 'Major-event subscription summary SSE message.',
    type: MajorEventSubscriptionChangedDataDto,
  })
  data!: MajorEventSubscriptionChangedDataDto;
}

class EventSubscriptionAvailabilityChangedMessageDto {
  @ApiProperty({
    description: 'Individual event availability SSE message.',
    type: EventSubscriptionAvailabilityChangedDataDto,
  })
  data!: EventSubscriptionAvailabilityChangedDataDto;
}

@ApiTags('SSE', 'current-user-events')
@ApiExtraModels(
  PublicEventSubscriptionSummaryDto,
  RealtimeHeartbeatMessageDto,
  PendingOnlineAttendancesChangedMessageDto,
  MajorEventSubscriptionChangedMessageDto,
  EventSubscriptionAvailabilityChangedMessageDto,
)
@Controller('current-user/events/realtime')
export class CurrentUserRealtimeEventsController {
  constructor(private readonly realtime: CurrentUserOnlineAttendanceRealtimeService) {}

  @Sse()
  @ApiTags('SSE', 'current-user')
  @ApiOperation({
    summary: 'Stream current-user event updates',
    description: [
      'Server-Sent Events stream used by the Angular events frontend.',
      '',
      'The stream emits multiple message shapes. Consumers should route messages by `data.type`, `data.channel`, and `data.event` instead of assuming a single payload structure.',
      '',
      'When the request contains a valid session cookie, the stream may emit pending online-attendance changes for the current user.',
      'When `majorEventIds` is provided, the stream emits major-event subscription summary changes.',
      'When `eventIds` is provided, the stream emits individual event availability changes.',
      'A heartbeat message is emitted periodically so the Angular client can observe that the connection is still alive.',
      '',
      'Swagger UI documents this endpoint, but it is not a good interactive client for `text/event-stream`. Test it with the Angular EventSource client or an SSE-capable HTTP client.',
    ].join('\n'),
  })
  @ApiProduces('text/event-stream')
  @ApiQuery({
    name: 'majorEventIds',
    required: false,
    description:
      'Major event filters. Accepts repeated query parameters or a comma-separated list. Values are trimmed and deduplicated server-side.',
    schema: {
      oneOf: [
        {
          type: 'string',
        },
        {
          type: 'array',
          items: {
            type: 'string',
          },
        },
      ],
    },
    examples: {
      commaSeparated: {
        summary: 'Comma-separated',
        value: '018f47b1-5c4e-7c7b-9e6f-0c8c2f7281ad,018f47b1-5c4e-7c7b-9e6f-0c8c2f7281ae',
      },
      repeated: {
        summary: 'Repeated query parameter',
        value: ['018f47b1-5c4e-7c7b-9e6f-0c8c2f7281ad', '018f47b1-5c4e-7c7b-9e6f-0c8c2f7281ae'],
      },
    },
  })
  @ApiQuery({
    name: 'eventIds',
    required: false,
    description:
      'Event filters. Accepts repeated query parameters or a comma-separated list. Values are trimmed and deduplicated server-side.',
    schema: {
      oneOf: [
        {
          type: 'string',
        },
        {
          type: 'array',
          items: {
            type: 'string',
          },
        },
      ],
    },
    examples: {
      commaSeparated: {
        summary: 'Comma-separated',
        value: '018f47b1-5c4e-7c7b-9e6f-0c8c2f7281af,018f47b1-5c4e-7c7b-9e6f-0c8c2f7281b0',
      },
      repeated: {
        summary: 'Repeated query parameter',
        value: ['018f47b1-5c4e-7c7b-9e6f-0c8c2f7281af', '018f47b1-5c4e-7c7b-9e6f-0c8c2f7281b0'],
      },
    },
  })
  @ApiOkResponse({
    description: 'SSE stream. Each emitted message uses one of the documented data shapes.',
    content: {
      'text/event-stream': {
        schema: {
          oneOf: [
            {
              $ref: getSchemaPath(RealtimeHeartbeatMessageDto),
            },
            {
              $ref: getSchemaPath(PendingOnlineAttendancesChangedMessageDto),
            },
            {
              $ref: getSchemaPath(MajorEventSubscriptionChangedMessageDto),
            },
            {
              $ref: getSchemaPath(EventSubscriptionAvailabilityChangedMessageDto),
            },
          ],
        },
        examples: {
          heartbeat: {
            summary: 'Heartbeat',
            value: {
              data: {
                type: 'heartbeat',
                timestamp: 1767225599000,
              },
            },
          },
          pendingOnlineAttendancesChanged: {
            summary: 'Pending online attendances changed',
            value: {
              data: {
                type: 'event',
                channel: ONLINE_ATTENDANCE_CHANNEL,
                event: 'pendingOnlineAttendancesChanged',
                payload: {
                  eventIds: ['018f47b1-5c4e-7c7b-9e6f-0c8c2f7281ad'],
                },
              },
            },
          },
          majorEventSubscriptionChanged: {
            summary: 'Major event subscription summary changed',
            value: {
              data: {
                type: 'event',
                channel: MAJOR_EVENT_SUBSCRIPTION_CHANNEL,
                event: 'majorEventSubscriptionChanged',
                majorEventId: '018f47b1-5c4e-7c7b-9e6f-0c8c2f7281ae',
                payload: {
                  subscriptionSummaries: [
                    {
                      eventId: '018f47b1-5c4e-7c7b-9e6f-0c8c2f7281af',
                      hasAvailableSlots: true,
                    },
                    {
                      eventId: '018f47b1-5c4e-7c7b-9e6f-0c8c2f7281b0',
                      hasAvailableSlots: false,
                    },
                  ],
                },
              },
            },
          },
          eventSubscriptionAvailabilityChanged: {
            summary: 'Event availability changed',
            value: {
              data: {
                type: 'event',
                channel: EVENT_SUBSCRIPTION_CHANNEL,
                event: 'eventSubscriptionAvailabilityChanged',
                eventId: '018f47b1-5c4e-7c7b-9e6f-0c8c2f7281af',
                payload: {
                  eventId: '018f47b1-5c4e-7c7b-9e6f-0c8c2f7281af',
                  hasAvailableSlots: true,
                },
              },
            },
          },
        },
      },
    },
  })
  @ApiBearerAuth()
  stream(
    @Req() request: Request,
    @Query('majorEventIds') majorEventIds?: string | string[],
    @Query('eventIds') eventIds?: string | string[],
  ): Observable<MessageEvent> {
    return this.realtime.stream(request, this.parseIds(majorEventIds), this.parseIds(eventIds));
  }

  private parseIds(value?: string | string[]): string[] {
    const values = Array.isArray(value) ? value : [value ?? ''];

    return [
      ...new Set(
        values
          .flatMap((item) => item.split(','))
          .map((item) => item.trim())
          .filter(Boolean),
      ),
    ];
  }
}
