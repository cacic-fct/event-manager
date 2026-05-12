import { Controller, Injectable, Logger, MessageEvent, Query, Req, Sse } from '@nestjs/common';
import { SubscriptionStatus } from '@prisma/client';
import type { Request } from 'express';
import { Observable, Subject, interval, map, merge } from 'rxjs';
import { AUTH_SESSION_COOKIE_NAME } from '../../auth/auth.constants';
import { Public } from '../../auth/decorators/public.decorator';
import { KeycloakAuthService } from '../../auth/keycloak-auth.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CurrentUserEventMapperService } from '../mapper.service';
import { CurrentUserPendingOnlineAttendanceEvent } from '../models';
import { PUBLIC_EVENT_SELECT, PublicEventSubscriptionSummary } from '../../public-events/models';
import { CurrentUserContextService } from '../context.service';
import { PublicEventsResolver } from '../../public-events/events.resolver';

const ONLINE_ATTENDANCE_CHANNEL = 'current-user.online-attendance';
const MAJOR_EVENT_SUBSCRIPTION_CHANNEL = 'public.major-event-subscription';

interface RealtimeClient {
  personId?: string;
  events: Subject<RealtimeServerMessage>;
  majorEventSubscriptionIds: Set<string>;
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

type RealtimeServerMessage = PendingOnlineAttendanceMessage | MajorEventSubscriptionChangedMessage;

@Injectable()
export class CurrentUserOnlineAttendanceRealtimeService {
  private readonly logger = new Logger(CurrentUserOnlineAttendanceRealtimeService.name);
  private readonly clients = new Set<RealtimeClient>();
  private readonly majorEventSubscriptionSnapshots = new Map<string, string>();
  private readonly heartbeat$ = interval(25_000).pipe(
    map(() => ({ data: { type: 'heartbeat', timestamp: Date.now() } })),
  );
  private majorEventSubscriptionInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly auth: KeycloakAuthService,
    private readonly currentUserContext: CurrentUserContextService,
    private readonly mapper: CurrentUserEventMapperService,
    private readonly prisma: PrismaService,
    private readonly publicEvents: PublicEventsResolver,
  ) {}

  stream(request: Request, majorEventSubscriptionIds: string[]): Observable<MessageEvent> {
    this.ensureMajorEventSubscriptionPolling();

    const events = new Subject<RealtimeServerMessage>();
    const client: RealtimeClient = {
      events,
      majorEventSubscriptionIds: new Set(majorEventSubscriptionIds),
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
        OR: [{ onlineAttendanceStartDate: null }, { onlineAttendanceStartDate: { lte: now } }],
        AND: [
          {
            OR: [{ onlineAttendanceEndDate: null }, { onlineAttendanceEndDate: { gte: now } }],
          },
          {
            attendances: {
              none: {
                personId,
              },
            },
          },
          {
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
          },
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

    await Promise.all([...majorEventIds].map((majorEventId) => this.notifyMajorEventSubscribers(majorEventId)));
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

@Controller('public/events')
@Public()
export class PublicRealtimeEventsController {
  constructor(private readonly realtime: CurrentUserOnlineAttendanceRealtimeService) {}

  @Sse()
  stream(@Req() request: Request, @Query('majorEventIds') majorEventIds?: string | string[]): Observable<MessageEvent> {
    return this.realtime.stream(request, this.parseMajorEventIds(majorEventIds));
  }

  private parseMajorEventIds(value?: string | string[]): string[] {
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
