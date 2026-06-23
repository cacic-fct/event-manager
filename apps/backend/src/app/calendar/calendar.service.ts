import ical, { ICalCalendarMethod, ICalEventClass, ICalEventStatus } from 'ical-generator';
import type { ICalLocation } from 'ical-generator';
import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SubscriptionStatus } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { subHours, subMonths, subYears } from 'date-fns';
import { PrismaService } from '../prisma/prisma.service';
import {
  CALENDAR_FEED_DISABLED_BY_USER,
  CALENDAR_FEED_DISABLED_STALE_LOGIN,
  CalendarDownload,
  CurrentUserCalendarFeedSettings,
} from './calendar.models';

const CALENDAR_FEED_KEY_BYTES = 64;
const PRIVATE_FEED_LAST_FETCH_WRITE_INTERVAL_HOURS = 6;
const PRIVATE_FEED_LOOKBACK_MONTHS = 1;
const PRIVATE_FEED_EVENT_TAKE = 600;

const CALENDAR_EVENT_SELECT = {
  id: true,
  name: true,
  startDate: true,
  endDate: true,
  description: true,
  shortDescription: true,
  latitude: true,
  longitude: true,
  locationDescription: true,
  createdAt: true,
  updatedAt: true,
  majorEvent: {
    select: {
      name: true,
    },
  },
  eventGroup: {
    select: {
      name: true,
    },
  },
} satisfies Prisma.EventSelect;

const CALENDAR_FEED_SETTINGS_SELECT = {
  feedKey: true,
  enabled: true,
  disabledAt: true,
  disabledReason: true,
  lastFetchedAt: true,
  rotatedAt: true,
  updatedAt: true,
} satisfies Prisma.UserCalendarFeedSettingsSelect;

type CalendarEventRecord = Prisma.EventGetPayload<{ select: typeof CALENDAR_EVENT_SELECT }>;
type CalendarFeedSettingsRecord = Prisma.UserCalendarFeedSettingsGetPayload<{
  select: typeof CALENDAR_FEED_SETTINGS_SELECT;
}>;

@Injectable()
export class CalendarService {
  constructor(private readonly prisma: PrismaService) {}

  async getCurrentUserCalendarFeedSettings(userId: string): Promise<CurrentUserCalendarFeedSettings> {
    const settings = await this.prisma.userCalendarFeedSettings.findUnique({
      where: {
        userId,
      },
      select: CALENDAR_FEED_SETTINGS_SELECT,
    });

    return this.mapSettings(settings);
  }

  async setCurrentUserCalendarFeedEnabled(
    userId: string,
    enabled: boolean,
  ): Promise<CurrentUserCalendarFeedSettings> {
    if (!enabled) {
      const settings = await this.prisma.userCalendarFeedSettings.updateManyAndReturn({
        where: {
          userId,
        },
        data: {
          enabled: false,
          disabledAt: new Date(),
          disabledReason: CALENDAR_FEED_DISABLED_BY_USER,
        },
        select: CALENDAR_FEED_SETTINGS_SELECT,
      });

      return this.mapSettings(settings[0] ?? null);
    }

    const settings = await this.enableCurrentUserCalendarFeed(userId);
    return this.mapSettings(settings);
  }

  async rotateCurrentUserCalendarFeedKey(userId: string): Promise<CurrentUserCalendarFeedSettings> {
    const now = new Date();
    const settings = await this.prisma.userCalendarFeedSettings.upsert({
      where: {
        userId,
      },
      create: {
        userId,
        feedKey: this.generateFeedKey(),
        enabled: false,
        rotatedAt: now,
      },
      update: {
        feedKey: this.generateFeedKey(),
        rotatedAt: now,
        lastFetchedAt: null,
      },
      select: CALENDAR_FEED_SETTINGS_SELECT,
    });

    return this.mapSettings(settings);
  }

  async buildPublicEventCalendar(eventId: string, publicAppOrigin: string): Promise<CalendarDownload> {
    const event = await this.prisma.event.findFirst({
      where: {
        id: eventId,
        deletedAt: null,
        publiclyVisible: true,
      },
      select: CALENDAR_EVENT_SELECT,
    });

    if (!event) {
      throw new NotFoundException(`Event ${eventId} was not found.`);
    }

    return {
      content: this.buildCalendar({
        name: event.name,
        description: event.shortDescription ?? event.description ?? null,
        events: [event],
        eventClass: ICalEventClass.PUBLIC,
        publicAppOrigin,
        ttlSeconds: 60 * 60,
      }),
      fileName: `${this.slugifyFileName(event.name) || 'evento'}.ics`,
    };
  }

  async buildPrivateUserCalendarFeed(feedKey: string, publicAppOrigin: string): Promise<CalendarDownload> {
    const settings = await this.prisma.userCalendarFeedSettings.findUnique({
      where: {
        feedKey,
      },
      select: {
        userId: true,
        enabled: true,
        feedKey: true,
        lastFetchedAt: true,
        user: {
          select: {
            name: true,
            lastLoginAt: true,
            people: {
              where: {
                deletedAt: null,
              },
              select: {
                id: true,
              },
            },
          },
        },
      },
    });

    if (!settings?.enabled) {
      throw new NotFoundException('Calendar feed was not found.');
    }

    const now = new Date();
    if (this.isStaleLogin(settings.user.lastLoginAt, now)) {
      await this.disableStaleCalendarFeed(settings.userId, now);
      throw new NotFoundException('Calendar feed was not found.');
    }

    const personIds = settings.user.people.map((person) => person.id);
    const events = await this.getPrivateFeedEvents(personIds, now);

    await this.sampleLastFetchedAt(settings.userId, settings.feedKey, settings.lastFetchedAt, now);

    return {
      content: this.buildCalendar({
        name: `CACiC Eventos - ${settings.user.name}`,
        description: 'Eventos vinculados a sua conta CACiC Eventos.',
        events,
        eventClass: ICalEventClass.PRIVATE,
        publicAppOrigin,
        ttlSeconds: 60 * 60,
      }),
      fileName: 'calendario-cacic-eventos.ics',
    };
  }

  private async enableCurrentUserCalendarFeed(userId: string): Promise<CalendarFeedSettingsRecord> {
    const now = new Date();

    const [, settings] = await this.prisma.$transaction([
      this.prisma.user.update({
        where: {
          id: userId,
        },
        data: {
          lastLoginAt: now,
        },
        select: {
          id: true,
        },
      }),
      this.prisma.userCalendarFeedSettings.upsert({
        where: {
          userId,
        },
        create: {
          userId,
          feedKey: this.generateFeedKey(),
          enabled: true,
        },
        update: {
          enabled: true,
          disabledAt: null,
          disabledReason: null,
        },
        select: CALENDAR_FEED_SETTINGS_SELECT,
      }),
    ]);

    return settings;
  }

  private async getPrivateFeedEvents(personIds: string[], now: Date): Promise<CalendarEventRecord[]> {
    if (personIds.length === 0) {
      return [];
    }

    const eventWhere = this.privateFeedEventWhere(now);

    const [eventSubscriptions, majorEventSelections, lecturerEvents, eventAttendances, certificates] =
      await Promise.all([
        this.prisma.eventSubscription.findMany({
          where: {
            personId: {
              in: personIds,
            },
            deletedAt: null,
            event: eventWhere,
          },
          select: {
            event: {
              select: CALENDAR_EVENT_SELECT,
            },
          },
          orderBy: {
            event: {
              startDate: 'asc',
            },
          },
          take: PRIVATE_FEED_EVENT_TAKE,
        }),
        this.prisma.majorEventSubscriptionEventSelection.findMany({
          where: {
            deletedAt: null,
            subscription: {
              personId: {
                in: personIds,
              },
              deletedAt: null,
              subscriptionStatus: {
                in: [
                  SubscriptionStatus.WAITING_RECEIPT_UPLOAD,
                  SubscriptionStatus.RECEIPT_UNDER_REVIEW,
                  SubscriptionStatus.CONFIRMED,
                ],
              },
            },
            event: eventWhere,
          },
          select: {
            event: {
              select: CALENDAR_EVENT_SELECT,
            },
          },
          orderBy: {
            event: {
              startDate: 'asc',
            },
          },
          take: PRIVATE_FEED_EVENT_TAKE,
        }),
        this.prisma.eventLecturer.findMany({
          where: {
            personId: {
              in: personIds,
            },
            event: eventWhere,
          },
          select: {
            event: {
              select: CALENDAR_EVENT_SELECT,
            },
          },
          orderBy: {
            event: {
              startDate: 'asc',
            },
          },
          take: PRIVATE_FEED_EVENT_TAKE,
        }),
        this.prisma.eventAttendance.findMany({
          where: {
            personId: {
              in: personIds,
            },
            event: eventWhere,
          },
          select: {
            event: {
              select: CALENDAR_EVENT_SELECT,
            },
          },
          orderBy: {
            event: {
              startDate: 'asc',
            },
          },
          take: PRIVATE_FEED_EVENT_TAKE,
        }),
        this.prisma.certificate.findMany({
          where: {
            personId: {
              in: personIds,
            },
            deletedAt: null,
            config: {
              deletedAt: null,
              event: eventWhere,
            },
          },
          select: {
            config: {
              select: {
                event: {
                  select: CALENDAR_EVENT_SELECT,
                },
              },
            },
          },
          orderBy: {
            issuedAt: 'desc',
          },
          take: PRIVATE_FEED_EVENT_TAKE,
        }),
      ]);

    const eventsById = new Map<string, CalendarEventRecord>();
    for (const event of [
      ...eventSubscriptions.map((subscription) => subscription.event),
      ...majorEventSelections.map((selection) => selection.event),
      ...lecturerEvents.map((lecturer) => lecturer.event),
      ...eventAttendances.map((attendance) => attendance.event),
      ...certificates.map((certificate) => certificate.config.event).filter((event): event is CalendarEventRecord => !!event),
    ]) {
      eventsById.set(event.id, event);
    }

    return [...eventsById.values()].sort(
      (left, right) => left.startDate.getTime() - right.startDate.getTime() || left.name.localeCompare(right.name),
    );
  }

  private privateFeedEventWhere(now: Date): Prisma.EventWhereInput {
    return {
      deletedAt: null,
      publiclyVisible: true,
      endDate: {
        gte: subMonths(now, PRIVATE_FEED_LOOKBACK_MONTHS),
      },
    };
  }

  private buildCalendar(input: {
    name: string;
    description: string | null;
    events: CalendarEventRecord[];
    eventClass: ICalEventClass;
    publicAppOrigin: string;
    ttlSeconds: number;
  }): string {
    const calendar = ical({
      name: input.name,
      description: input.description,
      method: ICalCalendarMethod.PUBLISH,
      prodId: {
        company: 'CACiC FCT',
        product: 'CACiC Eventos',
        language: 'PT-BR',
      },
      ttl: input.ttlSeconds,
    });

    for (const event of input.events) {
      calendar.createEvent({
        id: `${event.id}@eventos.cacic.dev.br`,
        summary: event.name,
        start: event.startDate,
        end: event.endDate,
        description: this.buildEventDescription(event),
        location: this.buildEventLocation(event),
        created: event.createdAt,
        lastModified: event.updatedAt,
        status: ICalEventStatus.CONFIRMED,
        class: input.eventClass,
        url: this.buildPublicEventUrl(input.publicAppOrigin, event.id),
      });
    }

    return calendar.toString();
  }

  private buildEventDescription(event: CalendarEventRecord): string | null {
    const parts = [
      event.description?.trim() || event.shortDescription?.trim() || null,
      event.majorEvent?.name ? `Grande evento: ${event.majorEvent.name}` : null,
      event.eventGroup?.name ? `Grupo de eventos: ${event.eventGroup.name}` : null,
    ].filter((part): part is string => Boolean(part));

    return parts.length > 0 ? parts.join('\n\n') : null;
  }

  private buildEventLocation(event: CalendarEventRecord): ICalLocation | string | null {
    const title = event.locationDescription?.trim();
    const latitude = event.latitude;
    const longitude = event.longitude;
    const hasCoordinates = latitude != null && longitude != null;

    if (title && hasCoordinates) {
      return {
        title,
        geo: {
          lat: latitude,
          lon: longitude,
        },
      };
    }

    if (title) {
      return title;
    }

    if (hasCoordinates) {
      return {
        geo: {
          lat: latitude,
          lon: longitude,
        },
      };
    }

    return null;
  }

  private buildPublicEventUrl(publicAppOrigin: string, eventId: string): string {
    return new URL(`/app/event/${encodeURIComponent(eventId)}`, publicAppOrigin).toString();
  }

  private mapSettings(settings: CalendarFeedSettingsRecord | null): CurrentUserCalendarFeedSettings {
    return {
      enabled: settings?.enabled ?? false,
      feedPath: settings ? `/api/calendar/feeds/${encodeURIComponent(settings.feedKey)}.ics` : null,
      disabledAt: settings?.disabledAt ?? null,
      disabledReason: settings?.disabledReason ?? null,
      lastFetchedAt: settings?.lastFetchedAt ?? null,
      rotatedAt: settings?.rotatedAt ?? null,
      updatedAt: settings?.updatedAt ?? null,
    };
  }

  private async disableStaleCalendarFeed(userId: string, now: Date): Promise<void> {
    await this.prisma.userCalendarFeedSettings.updateMany({
      where: {
        userId,
        enabled: true,
      },
      data: {
        enabled: false,
        disabledAt: now,
        disabledReason: CALENDAR_FEED_DISABLED_STALE_LOGIN,
      },
    });
  }

  private async sampleLastFetchedAt(
    userId: string,
    feedKey: string,
    lastFetchedAt: Date | null,
    now: Date,
  ): Promise<void> {
    if (lastFetchedAt && lastFetchedAt > subHours(now, PRIVATE_FEED_LAST_FETCH_WRITE_INTERVAL_HOURS)) {
      return;
    }

    await this.prisma.userCalendarFeedSettings.updateMany({
      where: {
        userId,
        feedKey,
        enabled: true,
      },
      data: {
        lastFetchedAt: now,
      },
    });
  }

  private isStaleLogin(lastLoginAt: Date | null, now: Date): boolean {
    return !lastLoginAt || lastLoginAt < subYears(now, 2);
  }

  private generateFeedKey(): string {
    return randomBytes(CALENDAR_FEED_KEY_BYTES).toString('base64url');
  }

  private slugifyFileName(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase()
      .slice(0, 80);
  }
}
