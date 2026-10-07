import {
  BadRequestException,
  Controller,
  forwardRef,
  Headers,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Optional,
  Logger,
  MessageEvent,
  OnModuleDestroy,
  Query,
  Req,
  Sse,
} from '@nestjs/common';
import { isAttendanceEligible } from '@cacic-fct/shared-event-participation';
import type { Request } from 'express';
import { Observable, Subject, interval, map, merge, takeUntil } from 'rxjs';
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
import { readAuthCookie } from '../../auth/auth-cookie-utils';
import { Public } from '../../auth/decorators/public.decorator';
import { KeycloakAuthService } from '../../auth/keycloak-auth.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CurrentUserEventMapperService } from '../mapper.service';
import { CurrentUserPendingOnlineAttendanceEvent } from '../models';
import {
  PUBLIC_EVENT_GROUP_SELECT,
  PUBLIC_EVENT_SELECT,
  PUBLIC_EVENT_WHERE,
  PUBLIC_MAJOR_EVENT_SELECT,
  PublicEventSubscriptionSummary,
} from '../../public-events/models';
import { CurrentUserContextService } from '../context.service';
import { PublicEventsResolver } from '../../public-events/events.resolver';
import { SseReplayService } from '../../realtime/sse-replay.service';
import { AudienceInvitationService, invitationFactForAttendance } from '../../audiences/audience-invitation.service';
import { ANONYMOUS_AUDIENCE, audienceContext, type EventAudiencePrincipal } from '../../audiences/audience-context';
import {
  eventAttendanceEligibility,
  isApprovedAttendance,
  isRegisteredAttendanceEvidence,
} from '../../events/attendance-eligibility';

const ONLINE_ATTENDANCE_CHANNEL = 'current-user.online-attendance';
const MAJOR_EVENT_SUBSCRIPTION_CHANNEL = 'public.major-event-subscription';
const EVENT_SUBSCRIPTION_CHANNEL = 'current-user.event-subscription';
const MAX_REALTIME_IDS = 50;
const MAX_REALTIME_ID_LENGTH = 128;
const MAX_REALTIME_QUERY_LENGTH = 4_096;
const MAX_REALTIME_CONNECTIONS_PER_IDENTITY = 10;

const PENDING_ONLINE_ATTENDANCE_EVENT_SELECT = {
  ...PUBLIC_EVENT_SELECT,
  majorEvent: {
    select: {
      ...PUBLIC_MAJOR_EVENT_SELECT,
      deletedAt: true,
    },
  },
  eventGroup: {
    select: {
      ...PUBLIC_EVENT_GROUP_SELECT,
      deletedAt: true,
    },
  },
} as const;

interface RealtimeClient {
  connectionIdentity: string;
  audiencePrincipal: EventAudiencePrincipal;
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
export class CurrentUserOnlineAttendanceRealtimeService implements OnModuleDestroy {
  private readonly logger = new Logger(CurrentUserOnlineAttendanceRealtimeService.name);
  private readonly clients = new Set<RealtimeClient>();
  private readonly connectionsByIdentity = new Map<string, number>();
  private readonly destroy$ = new Subject<void>();
  private readonly majorEventSubscriptionSnapshots = new Map<string, string>();
  private readonly eventSubscriptionSnapshots = new Map<string, string>();
  private readonly heartbeat$ = interval(25_000).pipe(
    takeUntil(this.destroy$),
    map(() => ({
      data: {
        type: 'heartbeat',
        timestamp: Date.now(),
      },
    })),
  );

  private majorEventSubscriptionInterval: ReturnType<typeof setInterval> | null = null;
  private pollingInFlight = false;

  constructor(
    private readonly auth: KeycloakAuthService,
    @Inject(forwardRef(() => CurrentUserContextService))
    private readonly currentUserContext: CurrentUserContextService,
    private readonly mapper: CurrentUserEventMapperService,
    private readonly prisma: PrismaService,
    private readonly publicEvents: PublicEventsResolver,
    @Optional() private readonly audienceInvitations?: AudienceInvitationService,
  ) {}

  onModuleDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();

    if (this.majorEventSubscriptionInterval) {
      clearInterval(this.majorEventSubscriptionInterval);
      this.majorEventSubscriptionInterval = null;
    }
    this.pollingInFlight = false;

    for (const client of this.clients) {
      client.events.complete();
    }
    this.clients.clear();
    this.connectionsByIdentity.clear();
    this.majorEventSubscriptionSnapshots.clear();
    this.eventSubscriptionSnapshots.clear();
  }

  stream(
    request: Request,
    majorEventSubscriptionIds: string[],
    eventSubscriptionIds: string[],
  ): Observable<MessageEvent> {
    this.assertSubscriptionIds(majorEventSubscriptionIds);
    this.assertSubscriptionIds(eventSubscriptionIds);
    const connectionIdentity = this.connectionIdentity(request);
    const activeConnections = this.connectionsByIdentity.get(connectionIdentity) ?? 0;
    if (activeConnections >= MAX_REALTIME_CONNECTIONS_PER_IDENTITY) {
      throw new HttpException('Limite de conexões SSE atingido.', HttpStatus.TOO_MANY_REQUESTS);
    }
    this.connectionsByIdentity.set(connectionIdentity, activeConnections + 1);

    const events = new Subject<RealtimeServerMessage>();
    const client: RealtimeClient = {
      connectionIdentity,
      audiencePrincipal: audienceContext.getStore() ?? ANONYMOUS_AUDIENCE,
      events,
      majorEventSubscriptionIds: new Set(majorEventSubscriptionIds),
      eventSubscriptionIds: new Set(eventSubscriptionIds),
    };

    this.clients.add(client);
    if (client.majorEventSubscriptionIds.size > 0 || client.eventSubscriptionIds.size > 0) {
      this.ensureMajorEventSubscriptionPolling();
    }

    void this.resolvePersonId(request)
      .then((personId) => {
        client.personId = personId ?? undefined;

        if (personId) {
          void this.notifyClient(client, personId).catch((error: unknown) => {
            this.logger.warn(error instanceof Error ? error.message : 'Could not publish current-user attendance.');
          });
        }
      })
      .catch((error: unknown) => {
        this.logger.warn(
          `Realtime identity resolution failed: ${error instanceof Error ? error.message : String(error)}`,
        );
        events.error(new Error('Realtime identity resolution failed.'));
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
        if (!this.clients.delete(client)) {
          return;
        }

        this.releaseConnection(client.connectionIdentity);
        this.cleanupSnapshots();
        if (
          [...this.clients].some(
            (connected) => connected.majorEventSubscriptionIds.size > 0 || connected.eventSubscriptionIds.size > 0,
          )
        ) {
          return;
        }

        if (this.majorEventSubscriptionInterval) {
          clearInterval(this.majorEventSubscriptionInterval);
          this.majorEventSubscriptionInterval = null;
        }
        this.majorEventSubscriptionSnapshots.clear();
        this.eventSubscriptionSnapshots.clear();
      };
    });
  }

  private releaseConnection(identity: string): void {
    const current = this.connectionsByIdentity.get(identity) ?? 0;
    if (current <= 1) {
      this.connectionsByIdentity.delete(identity);
      return;
    }
    this.connectionsByIdentity.set(identity, current - 1);
  }

  private cleanupSnapshots(): void {
    const activeMajorSnapshotKeys = new Set(
      [...this.clients].flatMap((client) =>
        [...client.majorEventSubscriptionIds].map((id) => this.snapshotKey('major', id, client.audiencePrincipal)),
      ),
    );
    const activeEventSnapshotKeys = new Set(
      [...this.clients].flatMap((client) =>
        [...client.eventSubscriptionIds].map((id) => this.snapshotKey('event', id, client.audiencePrincipal)),
      ),
    );
    for (const key of this.majorEventSubscriptionSnapshots.keys()) {
      if (!activeMajorSnapshotKeys.has(key)) {
        this.majorEventSubscriptionSnapshots.delete(key);
      }
    }
    for (const key of this.eventSubscriptionSnapshots.keys()) {
      if (!activeEventSnapshotKeys.has(key)) {
        this.eventSubscriptionSnapshots.delete(key);
      }
    }
  }

  private assertSubscriptionIds(ids: readonly string[]): void {
    if (ids.length > MAX_REALTIME_IDS) {
      throw new BadRequestException(`Informe no máximo ${MAX_REALTIME_IDS} identificadores por lista.`);
    }
    if (ids.some((id) => !/^[A-Za-z0-9_-]{1,128}$/.test(id) || id.length > MAX_REALTIME_ID_LENGTH)) {
      throw new BadRequestException('Identificador SSE inválido.');
    }
    if (ids.join(',').length > MAX_REALTIME_QUERY_LENGTH) {
      throw new BadRequestException('Filtros SSE muito longos.');
    }
  }

  private connectionIdentity(request: Request): string {
    return (
      readAuthCookie(request, AUTH_SESSION_COOKIE_NAME) ??
      `ip:${request.ip ?? request.socket?.remoteAddress ?? 'unknown'}`
    );
  }

  private ensureMajorEventSubscriptionPolling(): void {
    if (
      this.majorEventSubscriptionInterval ||
      ![...this.clients].some(
        (client) => client.majorEventSubscriptionIds.size > 0 || client.eventSubscriptionIds.size > 0,
      )
    ) {
      return;
    }

    this.majorEventSubscriptionInterval = setInterval(() => {
      void this.notifySubscribedMajorEvents().catch((error: unknown) => {
        this.logger.warn(error instanceof Error ? error.message : 'Could not poll subscription updates.');
      });
    }, 3_000);
  }

  async listPendingOnlineAttendanceEvents(personId: string): Promise<CurrentUserPendingOnlineAttendanceEvent[]> {
    const principal = audienceContext.getStore() ?? ANONYMOUS_AUDIENCE;
    return audienceContext.run(principal, () => this.listPendingOnlineAttendanceEventsScoped(personId));
  }

  private async listPendingOnlineAttendanceEventsScoped(
    personId: string,
  ): Promise<CurrentUserPendingOnlineAttendanceEvent[]> {
    const now = new Date();
    const events = await this.prisma.event.findMany({
      where: {
        AND: [PUBLIC_EVENT_WHERE],
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
            status: 'PRESENT',
          },
        },
      },
      select: PENDING_ONLINE_ATTENDANCE_EVENT_SELECT,
      orderBy: {
        startDate: 'asc',
      },
    });

    if (events.length === 0) {
      return [];
    }

    const eventIds = events.map((event) => event.id);
    const majorEventIds = [
      ...new Set(
        events
          .map((event) => event.majorEventId)
          .filter((majorEventId): majorEventId is string => Boolean(majorEventId)),
      ),
    ];
    const [eventSubscriptions, majorEventSubscriptions] = await Promise.all([
      this.prisma.eventSubscription.findMany({
        where: {
          eventId: { in: eventIds },
          personId,
          deletedAt: null,
        },
        select: {
          eventId: true,
        },
      }),
      majorEventIds.length
        ? this.prisma.majorEventSubscription.findMany({
            where: {
              majorEventId: { in: majorEventIds },
              personId,
              deletedAt: null,
            },
            select: {
              majorEventId: true,
              subscriptionStatus: true,
              selectedEvents: {
                where: { eventId: { in: eventIds }, deletedAt: null },
                select: { eventId: true },
              },
            },
          })
        : Promise.resolve([]),
    ]);

    const eventSubscriptionIds = new Set(eventSubscriptions.map((subscription) => subscription.eventId));
    const majorSubscriptionById = new Map(
      majorEventSubscriptions.map((subscription) => [subscription.majorEventId, subscription]),
    );

    const invitationFacts = this.audienceInvitations
      ? await this.audienceInvitations.getEventInvitationFacts(events, [personId], this.prisma)
      : new Map();

    return events.flatMap((event) => {
      const policy = eventAttendanceEligibility(event);
      const majorSubscription = event.majorEventId
        ? majorSubscriptionById.get(event.majorEventId)
        : undefined;
      const registrationEvidence = {
        hasEventSubscription: eventSubscriptionIds.has(event.id),
        majorEventSubscriptionStatus: majorSubscription?.subscriptionStatus,
        hasSelectedEvent: majorSubscription?.selectedEvents.some((selected) => selected.eventId === event.id),
        autoSubscribe: event.autoSubscribe,
      };
      const registered = isRegisteredAttendanceEvidence(event, registrationEvidence);
      const approved = isApprovedAttendance(
        event,
        registrationEvidence,
      );
      return isAttendanceEligible(policy, {
        registered,
        approved,
        invited: invitationFactForAttendance(event, invitationFacts.get(`${personId}:${event.id}`)),
      })
        ? [
            {
              eventId: event.id,
              event: this.mapper.mapPublicEvent(event),
            },
          ]
        : [];
    });
  }

  async notifyAllConnectedPeople(): Promise<void> {
    const personIds = new Set(
      [...this.clients].map((client) => client.personId).filter((personId): personId is string => Boolean(personId)),
    );

    await Promise.all([...personIds].map((personId) => this.notifyPerson(personId)));
  }

  async notifyPerson(personId: string): Promise<void> {
    const clients = [...this.clients].filter((client) => client.personId === personId);
    const groups = this.groupClientsByAudience(clients);
    const results = await Promise.all(
      groups.map(async ({ clients: groupedClients, principal }) => ({
        clients: groupedClients,
        eventIds: (
          await audienceContext.run(principal, () => this.listPendingOnlineAttendanceEventsScoped(personId))
        ).map((item) => item.eventId),
      })),
    );

    for (const { clients: groupedClients, eventIds } of results) {
      const message = this.pendingAttendanceMessage(eventIds);
      groupedClients.forEach((client) => client.events.next(message));
    }
  }

  private async notifyClient(client: RealtimeClient, personId: string): Promise<void> {
    const eventIds = (
      await audienceContext.run(client.audiencePrincipal, () => this.listPendingOnlineAttendanceEventsScoped(personId))
    ).map((item) => item.eventId);
    client.events.next(this.pendingAttendanceMessage(eventIds));
  }

  private pendingAttendanceMessage(eventIds: string[]): PendingOnlineAttendanceMessage {
    return {
      type: 'event',
      channel: ONLINE_ATTENDANCE_CHANNEL,
      event: 'pendingOnlineAttendancesChanged',
      payload: {
        eventIds,
      },
    };
  }

  private async notifySubscribedMajorEvents(): Promise<void> {
    if (this.pollingInFlight || this.clients.size === 0) {
      return;
    }

    this.pollingInFlight = true;
    const majorEventIds = new Set([...this.clients].flatMap((client) => [...client.majorEventSubscriptionIds]));

    const eventIds = new Set([...this.clients].flatMap((client) => [...client.eventSubscriptionIds]));

    try {
      await Promise.all([
        ...[...majorEventIds].map((majorEventId) => this.notifyMajorEventSubscribers(majorEventId)),
        ...[...eventIds].map((eventId) => this.notifyEventSubscriptionSubscribers(eventId)),
      ]);
    } finally {
      this.pollingInFlight = false;
    }
  }

  private async notifyMajorEventSubscribers(majorEventId: string) {
    const clients = [...this.clients].filter((client) => client.majorEventSubscriptionIds.has(majorEventId));
    await Promise.all(
      this.groupClientsByAudience(clients).map(({ clients: groupedClients, principal }) =>
        this.publishMajorEventUpdate(majorEventId, principal, groupedClients, false),
      ),
    );
  }

  private async notifyMajorEvent(client: RealtimeClient, majorEventId: string): Promise<void> {
    await this.publishMajorEventUpdate(majorEventId, client.audiencePrincipal, [client], true);
  }

  private async notifyEventSubscriptionSubscribers(eventId: string): Promise<void> {
    const clients = [...this.clients].filter((client) => client.eventSubscriptionIds.has(eventId));
    await Promise.all(
      this.groupClientsByAudience(clients).map(({ clients: groupedClients, principal }) =>
        this.publishEventSubscriptionUpdate(eventId, principal, groupedClients, false),
      ),
    );
  }

  private async notifyEventSubscription(client: RealtimeClient, eventId: string): Promise<void> {
    await this.publishEventSubscriptionUpdate(eventId, client.audiencePrincipal, [client], true);
  }

  private async publishMajorEventUpdate(
    majorEventId: string,
    principal: EventAudiencePrincipal,
    clients: readonly RealtimeClient[],
    force: boolean,
  ): Promise<void> {
    try {
      const payload = await audienceContext.run(principal, () => this.getMajorEventSubscriptionDeltaPayload(majorEventId));
      const message = {
        type: 'event',
        channel: MAJOR_EVENT_SUBSCRIPTION_CHANNEL,
        event: 'majorEventSubscriptionChanged',
        majorEventId,
        payload,
      } satisfies MajorEventSubscriptionChangedMessage;
      const serializedMessage = JSON.stringify(message);
      const snapshotKey = this.snapshotKey('major', majorEventId, principal);

      if (!force && this.majorEventSubscriptionSnapshots.get(snapshotKey) === serializedMessage) {
        return;
      }

      this.majorEventSubscriptionSnapshots.set(snapshotKey, serializedMessage);
      clients.forEach((client) => client.events.next(message));
    } catch (error) {
      this.logger.warn(error instanceof Error ? error.message : 'Could not publish major-event subscription update.');
    }
  }

  private async publishEventSubscriptionUpdate(
    eventId: string,
    principal: EventAudiencePrincipal,
    clients: readonly RealtimeClient[],
    force: boolean,
  ): Promise<void> {
    try {
      const payload = await audienceContext.run(principal, () => this.getEventSubscriptionDeltaPayload(eventId));
      const message = {
        type: 'event',
        channel: EVENT_SUBSCRIPTION_CHANNEL,
        event: 'eventSubscriptionAvailabilityChanged',
        eventId,
        payload,
      } satisfies EventSubscriptionChangedMessage;
      const serializedMessage = JSON.stringify(message);
      const snapshotKey = this.snapshotKey('event', eventId, principal);

      if (!force && this.eventSubscriptionSnapshots.get(snapshotKey) === serializedMessage) {
        return;
      }

      this.eventSubscriptionSnapshots.set(snapshotKey, serializedMessage);
      clients.forEach((client) => client.events.next(message));
    } catch (error) {
      this.logger.warn(error instanceof Error ? error.message : 'Could not publish event subscription update.');
    }
  }

  private groupClientsByAudience(
    clients: readonly RealtimeClient[],
  ): Array<{ principal: EventAudiencePrincipal; clients: RealtimeClient[] }> {
    const groups = new Map<string, { principal: EventAudiencePrincipal; clients: RealtimeClient[] }>();
    for (const client of clients) {
      const key = this.audiencePrincipalKey(client.audiencePrincipal);
      const group = groups.get(key);
      if (group) {
        group.clients.push(client);
        continue;
      }
      groups.set(key, { principal: client.audiencePrincipal, clients: [client] });
    }
    return [...groups.values()];
  }

  private snapshotKey(
    kind: 'major' | 'event',
    id: string,
    principal: EventAudiencePrincipal,
  ): string {
    return `${kind}:${id}:${this.audiencePrincipalKey(principal)}`;
  }

  private audiencePrincipalKey(principal: EventAudiencePrincipal): string {
    return JSON.stringify({
      userId: principal.userId ?? null,
      personIds: [...principal.personIds].sort(),
      isUnesp: principal.isUnesp,
      verifiedCourseCode: principal.verifiedCourseCode,
      bypass: principal.bypass,
    });
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
    const bearerPersonId = await this.resolveBearerPersonId(request);
    if (bearerPersonId) {
      return bearerPersonId;
    }

    return await this.resolveSessionPersonId(request);
  }

  private async resolveBearerPersonId(request: Request): Promise<string | null> {
    try {
      const user = await this.auth.authenticateAccessToken(this.readBearerToken(request) ?? '');
      if (!user) {
        return null;
      }
      const { person } = await this.currentUserContext.resolveCurrentUserContext(user);
      return person?.id ?? null;
    } catch {
      return null;
    }
  }

  private async resolveSessionPersonId(request: Request): Promise<string | null> {
    const sessionId = this.readCookie(request, AUTH_SESSION_COOKIE_NAME);
    if (!sessionId) {
      return null;
    }

    const user = await this.auth.authenticateSession(sessionId);
    const { person } = await this.currentUserContext.resolveCurrentUserContext(user);
    return person?.id ?? null;
  }

  private readBearerToken(request: Request): string | null {
    const header = request.headers.authorization;
    if (typeof header !== 'string') {
      return null;
    }

    const normalized = header.trim();
    const separator = normalized.indexOf(' ');
    if (separator < 0 || normalized.slice(0, separator).toLowerCase() !== 'bearer') {
      return null;
    }

    return normalized.slice(separator + 1).trim() || null;
  }

  private readCookie(request: Request, name: string): string | null {
    return readAuthCookie(request, name);
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
  constructor(
    private readonly realtime: CurrentUserOnlineAttendanceRealtimeService,
    private readonly replay: SseReplayService,
  ) {}

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
  @Public()
  stream(
    @Req() request: Request,
    @Query('majorEventIds') majorEventIds?: string | string[],
    @Query('eventIds') eventIds?: string | string[],
    @Headers('last-event-id') lastEventId?: string,
  ): Observable<MessageEvent> {
    const normalizedMajorEventIds = this.parseIds(majorEventIds);
    const normalizedEventIds = this.parseIds(eventIds);

    return this.replay.replay(
      this.replay.scope(
        'current-user-events-realtime',
        this.readCookie(request, AUTH_SESSION_COOKIE_NAME),
        normalizedMajorEventIds.join(','),
        normalizedEventIds.join(','),
      ),
      lastEventId,
      this.realtime.stream(request, normalizedMajorEventIds, normalizedEventIds),
    );
  }

  private parseIds(value?: string | string[]): string[] {
    const values = Array.isArray(value) ? value : [value ?? ''];
    const ids = [
      ...new Set(
        values
          .flatMap((item) => item.split(','))
          .map((item) => item.trim())
          .filter(Boolean),
      ),
    ];
    if (ids.length > MAX_REALTIME_IDS) {
      throw new BadRequestException(`Informe no máximo ${MAX_REALTIME_IDS} identificadores por lista.`);
    }
    if (ids.some((id) => !/^[A-Za-z0-9_-]{1,128}$/.test(id))) {
      throw new BadRequestException('Identificador SSE inválido.');
    }
    if (ids.join(',').length > MAX_REALTIME_QUERY_LENGTH) {
      throw new BadRequestException('Filtros SSE muito longos.');
    }
    return ids;
  }

  private readCookie(request: Request, name: string): string | null {
    return readAuthCookie(request, name);
  }
}
