import { Injectable, Logger } from '@nestjs/common';
import { SubscriptionStatus } from '@prisma/client';
import type { IncomingMessage, Server as HttpServer } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import { AUTH_SESSION_COOKIE_NAME } from '../../auth/auth.constants';
import { KeycloakAuthService } from '../../auth/keycloak-auth.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CurrentUserEventMapperService } from '../mapper.service';
import { CurrentUserPendingOnlineAttendanceEvent } from '../models';
import { PUBLIC_EVENT_SELECT } from '../../public-events/models';
import { CurrentUserContextService } from '../context.service';

const ONLINE_ATTENDANCE_CHANNEL = 'current-user.online-attendance';

interface AttendanceSocketClient {
  personId?: string;
  socket: WebSocket;
  subscriptions: Set<string>;
}

interface PendingOnlineAttendanceMessage {
  type: 'event';
  channel: typeof ONLINE_ATTENDANCE_CHANNEL;
  event: 'pendingOnlineAttendancesChanged';
  payload: {
    eventIds: string[];
  };
}

interface PublicSocketClientMessage {
  type?: string;
  channel?: string;
}

@Injectable()
export class CurrentUserOnlineAttendanceRealtimeService {
  private readonly logger = new Logger(
    CurrentUserOnlineAttendanceRealtimeService.name,
  );
  private readonly clients = new Set<AttendanceSocketClient>();
  private webSocketServer: WebSocketServer | null = null;

  constructor(
    private readonly auth: KeycloakAuthService,
    private readonly currentUserContext: CurrentUserContextService,
    private readonly mapper: CurrentUserEventMapperService,
    private readonly prisma: PrismaService,
  ) {}

  attach(server: HttpServer): void {
    if (this.webSocketServer) {
      return;
    }

    this.webSocketServer = new WebSocketServer({ noServer: true });
    server.on('upgrade', (request, socket, head) => {
      if (!request.url?.startsWith('/api/public/ws')) {
        return;
      }

      this.webSocketServer?.handleUpgrade(request, socket, head, (client) => {
        this.registerClient(request, client);
      });
    });
  }

  async listPendingOnlineAttendanceEvents(
    personId: string,
  ): Promise<CurrentUserPendingOnlineAttendanceEvent[]> {
    const now = new Date();
    const events = await this.prisma.event.findMany({
      where: {
        deletedAt: null,
        shouldCollectAttendance: true,
        isOnlineAttendanceAllowed: true,
        OR: [
          { onlineAttendanceStartDate: null },
          { onlineAttendanceStartDate: { lte: now } },
        ],
        AND: [
          {
            OR: [
              { onlineAttendanceEndDate: null },
              { onlineAttendanceEndDate: { gte: now } },
            ],
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
      [...this.clients]
        .map((client) => client.personId)
        .filter((personId): personId is string => Boolean(personId)),
    );
    await Promise.all(
      [...personIds].map((personId) => this.notifyPerson(personId)),
    );
  }

  async notifyPerson(personId: string): Promise<void> {
    const eventIds = (
      await this.listPendingOnlineAttendanceEvents(personId)
    ).map((item) => item.eventId);
    const message: PendingOnlineAttendanceMessage = {
      type: 'event',
      channel: ONLINE_ATTENDANCE_CHANNEL,
      event: 'pendingOnlineAttendancesChanged',
      payload: {
        eventIds,
      },
    };

    for (const client of this.clients) {
      if (
        client.personId === personId &&
        client.subscriptions.has(ONLINE_ATTENDANCE_CHANNEL) &&
        client.socket.readyState === WebSocket.OPEN
      ) {
        client.socket.send(JSON.stringify(message));
      }
    }
  }

  private registerClient(request: IncomingMessage, socket: WebSocket): void {
    const client: AttendanceSocketClient = {
      socket,
      subscriptions: new Set(),
    };
    this.clients.add(client);
    socket.on('message', (data) => {
      void this.handleMessage(request, client, data.toString());
    });
    socket.on('close', () => this.clients.delete(client));
    socket.send(JSON.stringify({ type: 'ready' }));
  }

  private async handleMessage(
    request: IncomingMessage,
    client: AttendanceSocketClient,
    rawMessage: string,
  ): Promise<void> {
    const message = this.parseClientMessage(rawMessage);
    if (!message?.channel) {
      return;
    }

    if (
      message.channel !== ONLINE_ATTENDANCE_CHANNEL ||
      (message.type !== 'subscribe' && message.type !== 'unsubscribe')
    ) {
      client.socket.send(
        JSON.stringify({
          type: 'error',
          channel: message.channel,
          message: 'Unsupported public websocket channel or action.',
        }),
      );
      return;
    }

    if (message.type === 'unsubscribe') {
      client.subscriptions.delete(message.channel);
      return;
    }

    try {
      const personId = await this.resolvePersonId(request);
      if (!personId) {
        client.socket.send(
          JSON.stringify({
            type: 'error',
            channel: message.channel,
            message: 'Authentication is required for this channel.',
          }),
        );
        return;
      }

      client.personId = personId;
      client.subscriptions.add(message.channel);
      client.socket.send(
        JSON.stringify({ type: 'subscribed', channel: message.channel }),
      );
      await this.notifyPerson(personId);
    } catch (error) {
      this.logger.warn(
        error instanceof Error
          ? error.message
          : 'Could not subscribe to attendance websocket channel.',
      );
      client.socket.send(
        JSON.stringify({
          type: 'error',
          channel: message.channel,
          message: 'Could not subscribe to this channel.',
        }),
      );
    }
  }

  private parseClientMessage(
    rawMessage: string,
  ): PublicSocketClientMessage | null {
    try {
      return JSON.parse(rawMessage) as PublicSocketClientMessage;
    } catch {
      return null;
    }
  }

  private async resolvePersonId(
    request: IncomingMessage,
  ): Promise<string | null> {
    const sessionId = this.readCookie(request, AUTH_SESSION_COOKIE_NAME);
    if (!sessionId) {
      return null;
    }

    const user = await this.auth.authenticateSession(sessionId);
    const { person } =
      await this.currentUserContext.resolveCurrentUserContext(user);

    return person?.id ?? null;
  }

  private readCookie(request: IncomingMessage, name: string): string | null {
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
