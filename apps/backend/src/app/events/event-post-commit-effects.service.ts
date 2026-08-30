import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { EventType, Prisma, PublicationState } from '@prisma/client';
import { OnlineAttendanceNotificationJobsService } from '../attendance/online-attendance-notification-jobs.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventSitemapService } from '../public-events/event-sitemap.service';
import { TypesenseSearchService } from '../search/typesense-search.service';
import {
  PUBLIC_CATALOG_REALTIME_CHANNEL,
  createPublicCatalogInvalidation,
} from '../realtime/public-catalog-invalidation';
import { RealtimeInvalidationService } from '../realtime/realtime-invalidation.service';

export interface EventPostCommitRecord {
  id: string;
  name: string;
  emoji: string;
  type: EventType;
  description: string | null;
  shortDescription: string | null;
  locationDescription: string | null;
  majorEventId: string | null;
  eventGroupId: string | null;
  shouldIssueCertificate: boolean;
  shouldCollectAttendance: boolean;
  isOnlineAttendanceAllowed: boolean;
  onlineAttendanceCode: string | null;
  onlineAttendanceStartDate: Date | null;
  onlineAttendanceEndDate: Date | null;
  isPubliclyListed: boolean;
  publicationState: PublicationState;
  startDate: Date;
  endDate: Date;
}

export interface EventGroupPostCommitRecord {
  id: string;
  name: string;
}

const EVENT_EFFECTS_SELECT = {
  id: true,
  name: true,
  emoji: true,
  type: true,
  description: true,
  shortDescription: true,
  locationDescription: true,
  majorEventId: true,
  eventGroupId: true,
  shouldIssueCertificate: true,
  shouldCollectAttendance: true,
  isOnlineAttendanceAllowed: true,
  onlineAttendanceCode: true,
  onlineAttendanceStartDate: true,
  onlineAttendanceEndDate: true,
  isPubliclyListed: true,
  publicationState: true,
  startDate: true,
  endDate: true,
  deletedAt: true,
} satisfies Prisma.EventSelect;

const EVENT_GROUP_EFFECTS_SELECT = {
  id: true,
  name: true,
  deletedAt: true,
} satisfies Prisma.EventGroupSelect;

@Injectable()
export class EventPostCommitEffectsService {
  private readonly logger = new Logger(EventPostCommitEffectsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly typesenseSearch: TypesenseSearchService,
    private readonly sitemap: EventSitemapService,
    private readonly onlineAttendanceNotifications: OnlineAttendanceNotificationJobsService,
    @Inject(RealtimeInvalidationService)
    @Optional()
    private readonly realtime: Pick<RealtimeInvalidationService, 'publish' | 'scope'> = {
      scope: (channel) => channel,
      publish: async () => ({}),
    },
  ) {}

  async upsertEvent(event: EventPostCommitRecord): Promise<void> {
    try {
      await this.sitemap.refresh();
      await this.upsertEventSearchDocument(event);
      await this.onlineAttendanceNotifications.scheduleEvent(event);
    } finally {
      await this.publishInvalidationsBestEffort('event');
    }
  }

  async deleteEvent(eventId: string): Promise<void> {
    try {
      await this.sitemap.refresh();
      await this.typesenseSearch.deleteEvent(eventId);
    } finally {
      await this.publishInvalidationsBestEffort('event');
    }
  }

  async syncEvent(eventId: string): Promise<void> {
    await this.syncEvents([eventId]);
  }

  async syncEvents(eventIds: readonly string[]): Promise<void> {
    const uniqueIds = [...new Set(eventIds.filter(Boolean))];
    if (uniqueIds.length === 0) return;

    const events = await this.prisma.event.findMany({
      where: { id: { in: uniqueIds } },
      select: EVENT_EFFECTS_SELECT,
    });
    const eventsById = new Map(events.map((event) => [event.id, event]));

    try {
      await this.sitemap.refresh();
      await Promise.all(
        uniqueIds.map(async (eventId) => {
          const event = eventsById.get(eventId);
          if (!event || event.deletedAt) {
            await this.typesenseSearch.deleteEvent(eventId);
            return;
          }
          await this.upsertEventSearchDocument(event);
          await this.onlineAttendanceNotifications.scheduleEvent(event);
        }),
      );
    } finally {
      await this.publishInvalidationsBestEffort('event');
    }
  }

  async upsertEventGroup(eventGroup: EventGroupPostCommitRecord): Promise<void> {
    try {
      await this.typesenseSearch.upsertEventGroup(eventGroup);
    } finally {
      await this.publishInvalidationsBestEffort('event-group');
    }
  }

  async deleteEventGroup(eventGroupId: string): Promise<void> {
    try {
      await this.typesenseSearch.deleteEventGroup(eventGroupId);
    } finally {
      await this.publishInvalidationsBestEffort('event-group');
    }
  }

  async syncEventGroup(eventGroupId: string): Promise<void> {
    await this.syncEventGroups([eventGroupId]);
  }

  async syncEventGroups(eventGroupIds: readonly string[]): Promise<void> {
    const uniqueIds = [...new Set(eventGroupIds.filter(Boolean))];
    if (uniqueIds.length === 0) return;

    const eventGroups = await this.prisma.eventGroup.findMany({
      where: { id: { in: uniqueIds } },
      select: EVENT_GROUP_EFFECTS_SELECT,
    });
    const eventGroupsById = new Map(eventGroups.map((eventGroup) => [eventGroup.id, eventGroup]));

    try {
      await Promise.all(
        uniqueIds.map((eventGroupId) => {
          const eventGroup = eventGroupsById.get(eventGroupId);
          return !eventGroup || eventGroup.deletedAt
            ? this.typesenseSearch.deleteEventGroup(eventGroupId)
            : this.typesenseSearch.upsertEventGroup({ id: eventGroup.id, name: eventGroup.name });
        }),
      );
    } finally {
      await this.publishInvalidationsBestEffort('event-group');
    }
  }

  private async publishInvalidations(domain: 'event' | 'event-group'): Promise<void> {
    const payload = {
      type: 'CATALOG_INVALIDATED',
      domain,
      occurredAt: new Date().toISOString(),
    };
    await Promise.all([
      this.realtime.publish(this.realtime.scope('admin-workspace'), payload),
      this.realtime.publish(this.realtime.scope(PUBLIC_CATALOG_REALTIME_CHANNEL), createPublicCatalogInvalidation()),
    ]);
  }

  private async publishInvalidationsBestEffort(domain: 'event' | 'event-group'): Promise<void> {
    try {
      await this.publishInvalidations(domain);
    } catch (error: unknown) {
      this.logger.warn(
        `Catalog realtime invalidation failed after ${domain} post-commit effects: ${
          error instanceof Error ? error.message : String(error)
        }`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  private upsertEventSearchDocument(event: EventPostCommitRecord): Promise<void> {
    return this.typesenseSearch.upsertEvent({
      id: event.id,
      name: event.name,
      emoji: event.emoji,
      type: event.type,
      description: event.description,
      shortDescription: event.shortDescription,
      locationDescription: event.locationDescription,
      majorEventId: event.majorEventId,
      eventGroupId: event.eventGroupId,
      shouldIssueCertificate: event.shouldIssueCertificate,
      isPubliclyListed: event.isPubliclyListed,
      publicationState: event.publicationState,
      startDate: event.startDate,
      endDate: event.endDate,
    });
  }
}
