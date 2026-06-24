import { Permission } from '@cacic-fct/shared-permissions';
import ical, { ICalCalendarMethod, ICalEventClass, ICalEventStatus } from 'ical-generator';
import type { ICalLocation } from 'ical-generator';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EventManagerPermissionGrantScope, Prisma, SubscriptionStatus } from '@prisma/client';
import { createHmac, randomBytes } from 'node:crypto';
import { subHours, subMonths, subYears } from 'date-fns';
import { PrismaService } from '../prisma/prisma.service';
import {
  ADMIN_CALENDAR_FEED_DISABLED_NO_CURRENT_TARGETS,
  ADMIN_CALENDAR_FEED_DISABLED_STALE_ACCESS,
  CALENDAR_FEED_DISABLED_BY_USER,
  CALENDAR_FEED_DISABLED_STALE_LOGIN,
  CalendarDownload,
  CurrentUserAdminCalendarFeedSettings,
  CurrentUserCalendarFeedSettings,
  SUPER_ADMIN_CALENDAR_FEED_ID,
  SuperAdminCalendarFeedSettings,
} from './calendar.models';

const CALENDAR_FEED_KEY_BYTES = 64;
const CALENDAR_FEED_KEY_ROTATION_COOLDOWN_HOURS = 24;
const PRIVATE_FEED_LAST_FETCH_WRITE_INTERVAL_HOURS = 6;
const PRIVATE_FEED_LOOKBACK_MONTHS = 1;
const PRIVATE_FEED_EVENT_TAKE = 600;
const ADMIN_FEED_ITEM_TAKE = 600;
const ADMIN_EVENT_GROUP_RANGE_EVENT_TAKE = 1000;
const ADMIN_FEED_ACCESS_CHECK_MAX_AGE_HOURS = 24;

const ADMIN_CALENDAR_EVENT_PERMISSIONS = [Permission.Event.Read] as const satisfies readonly Permission[];

const ADMIN_CALENDAR_EVENT_GROUP_PERMISSIONS = [Permission.EventGroup.Read] as const satisfies readonly Permission[];

const ADMIN_CALENDAR_MAJOR_EVENT_PERMISSIONS = [Permission.MajorEvent.Read] as const satisfies readonly Permission[];

const ADMIN_CALENDAR_FEED_PERMISSIONS = [
  ...ADMIN_CALENDAR_EVENT_PERMISSIONS,
  ...ADMIN_CALENDAR_EVENT_GROUP_PERMISSIONS,
  ...ADMIN_CALENDAR_MAJOR_EVENT_PERMISSIONS,
] as const satisfies readonly Permission[];

const ADMIN_CALENDAR_EVENT_PERMISSION_SET = new Set<string>(ADMIN_CALENDAR_EVENT_PERMISSIONS);
const ADMIN_CALENDAR_EVENT_GROUP_PERMISSION_SET = new Set<string>(ADMIN_CALENDAR_EVENT_GROUP_PERMISSIONS);
const ADMIN_CALENDAR_MAJOR_EVENT_PERMISSION_SET = new Set<string>(ADMIN_CALENDAR_MAJOR_EVENT_PERMISSIONS);

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
  feedKeyHash: true,
  enabled: true,
  disabledAt: true,
  disabledReason: true,
  lastFetchedAt: true,
  rotatedAt: true,
  updatedAt: true,
} satisfies Prisma.UserCalendarFeedSettingsSelect;

const ADMIN_CALENDAR_FEED_SETTINGS_SELECT = {
  feedKeyHash: true,
  enabled: true,
  disabledAt: true,
  disabledReason: true,
  lastFetchedAt: true,
  lastCheckedAt: true,
  rotatedAt: true,
  updatedAt: true,
} satisfies Prisma.UserAdminCalendarFeedSettingsSelect;

const SUPER_ADMIN_CALENDAR_FEED_SETTINGS_SELECT = {
  feedKeyHash: true,
  enabled: true,
  lastFetchedAt: true,
  rotatedAt: true,
  updatedAt: true,
} satisfies Prisma.SuperAdminCalendarFeedSettingsSelect;

const ADMIN_MAJOR_EVENT_SELECT = {
  id: true,
  name: true,
  startDate: true,
  endDate: true,
  description: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.MajorEventSelect;

function buildAdminEventGroupSelect(now: Date) {
  return {
    id: true,
    name: true,
    createdAt: true,
    updatedAt: true,
    events: {
      where: {
        deletedAt: null,
        endDate: {
          gte: now,
        },
      },
      orderBy: {
        startDate: 'asc',
      },
      select: {
        startDate: true,
        endDate: true,
      },
      take: ADMIN_EVENT_GROUP_RANGE_EVENT_TAKE,
    },
  } satisfies Prisma.EventGroupSelect;
}

const ADMIN_CALENDAR_GRANT_SELECT = {
  permission: true,
  scope: true,
  eventId: true,
  majorEventId: true,
  eventGroupId: true,
} satisfies Prisma.EventManagerPermissionGrantSelect;

type CalendarEventRecord = Prisma.EventGetPayload<{ select: typeof CALENDAR_EVENT_SELECT }>;
type CalendarFeedSettingsRecord = Prisma.UserCalendarFeedSettingsGetPayload<{
  select: typeof CALENDAR_FEED_SETTINGS_SELECT;
}>;
type AdminCalendarFeedSettingsRecord = Prisma.UserAdminCalendarFeedSettingsGetPayload<{
  select: typeof ADMIN_CALENDAR_FEED_SETTINGS_SELECT;
}>;
type SuperAdminCalendarFeedSettingsRecord = Prisma.SuperAdminCalendarFeedSettingsGetPayload<{
  select: typeof SUPER_ADMIN_CALENDAR_FEED_SETTINGS_SELECT;
}>;
type AdminMajorEventRecord = Prisma.MajorEventGetPayload<{ select: typeof ADMIN_MAJOR_EVENT_SELECT }>;
type AdminEventGroupRecord = Prisma.EventGroupGetPayload<{ select: ReturnType<typeof buildAdminEventGroupSelect> }>;
type AdminCalendarGrantRecord = Prisma.EventManagerPermissionGrantGetPayload<{
  select: typeof ADMIN_CALENDAR_GRANT_SELECT;
}>;

type CalendarEntry = {
  id: string;
  summary: string;
  start: Date;
  end: Date;
  description: string | null;
  location: ICalLocation | string | null;
  created: Date;
  lastModified: Date;
  url: string | null;
};

type AdminFeedTargetPlan = {
  globalEvents: boolean;
  globalEventGroups: boolean;
  globalMajorEvents: boolean;
  eventIds: Set<string>;
  eventMajorEventIds: Set<string>;
  eventGroupIdsForEvents: Set<string>;
  eventGroupIds: Set<string>;
  majorEventIds: Set<string>;
};

@Injectable()
export class CalendarService {
  private readonly calendarFeedKeyPepper = this.readCalendarFeedKeyPepper();

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

    const { feedKey, settings } = await this.enableCurrentUserCalendarFeed(userId);
    return this.mapSettings(settings, feedKey);
  }

  async rotateCurrentUserCalendarFeedKey(userId: string): Promise<CurrentUserCalendarFeedSettings> {
    const now = new Date();
    const currentSettings = await this.prisma.userCalendarFeedSettings.findUnique({
      where: {
        userId,
      },
      select: {
        rotatedAt: true,
      },
    });
    this.assertFeedKeyRotationAllowed(currentSettings?.rotatedAt ?? null, now);

    const feedKey = this.generateFeedKey();
    const feedKeyHash = this.hashFeedKey(feedKey);
    const settings = await this.prisma.userCalendarFeedSettings.upsert({
      where: {
        userId,
      },
      create: {
        userId,
        feedKeyHash,
        enabled: false,
        rotatedAt: now,
      },
      update: {
        feedKeyHash,
        rotatedAt: now,
        lastFetchedAt: null,
      },
      select: CALENDAR_FEED_SETTINGS_SELECT,
    });

    return this.mapSettings(settings, feedKey);
  }

  async getCurrentUserAdminCalendarFeedSettings(userId: string): Promise<CurrentUserAdminCalendarFeedSettings> {
    const now = new Date();
    const settings = await this.prisma.userAdminCalendarFeedSettings.findUnique({
      where: {
        userId,
      },
      select: ADMIN_CALENDAR_FEED_SETTINGS_SELECT,
    });

    if (!settings) {
      return this.mapAdminSettings(null);
    }

    const refreshedSettings = await this.prisma.userAdminCalendarFeedSettings.update({
      where: {
        userId,
      },
      data: {
        lastCheckedAt: now,
      },
      select: ADMIN_CALENDAR_FEED_SETTINGS_SELECT,
    });

    return this.mapAdminSettings(refreshedSettings);
  }

  async setCurrentUserAdminCalendarFeedEnabled(
    userId: string,
    enabled: boolean,
  ): Promise<CurrentUserAdminCalendarFeedSettings> {
    const now = new Date();

    if (!enabled) {
      const settings = await this.prisma.userAdminCalendarFeedSettings.updateManyAndReturn({
        where: {
          userId,
        },
        data: {
          enabled: false,
          disabledAt: now,
          disabledReason: CALENDAR_FEED_DISABLED_BY_USER,
          lastCheckedAt: now,
        },
        select: ADMIN_CALENDAR_FEED_SETTINGS_SELECT,
      });

      return this.mapAdminSettings(settings[0] ?? null);
    }

    if (!(await this.hasCurrentAdminFeedTargets(userId, now))) {
      throw new BadRequestException('Não há eventos administrativos atuais ou futuros para este usuário.');
    }

    const feedKey = this.generateFeedKey();
    const feedKeyHash = this.hashFeedKey(feedKey);
    const settings = await this.prisma.userAdminCalendarFeedSettings.upsert({
      where: {
        userId,
      },
      create: {
        userId,
        feedKeyHash,
        enabled: true,
        rotatedAt: now,
        lastCheckedAt: now,
      },
      update: {
        feedKeyHash,
        enabled: true,
        disabledAt: null,
        disabledReason: null,
        lastFetchedAt: null,
        lastCheckedAt: now,
        rotatedAt: now,
      },
      select: ADMIN_CALENDAR_FEED_SETTINGS_SELECT,
    });

    return this.mapAdminSettings(settings, feedKey);
  }

  async rotateCurrentUserAdminCalendarFeedKey(userId: string): Promise<CurrentUserAdminCalendarFeedSettings> {
    const now = new Date();
    const currentSettings = await this.prisma.userAdminCalendarFeedSettings.findUnique({
      where: {
        userId,
      },
      select: {
        rotatedAt: true,
      },
    });
    this.assertFeedKeyRotationAllowed(currentSettings?.rotatedAt ?? null, now);

    const feedKey = this.generateFeedKey();
    const feedKeyHash = this.hashFeedKey(feedKey);
    const settings = await this.prisma.userAdminCalendarFeedSettings.upsert({
      where: {
        userId,
      },
      create: {
        userId,
        feedKeyHash,
        enabled: false,
        rotatedAt: now,
        lastCheckedAt: now,
      },
      update: {
        feedKeyHash,
        rotatedAt: now,
        lastFetchedAt: null,
        lastCheckedAt: now,
      },
      select: ADMIN_CALENDAR_FEED_SETTINGS_SELECT,
    });

    return this.mapAdminSettings(settings, feedKey);
  }

  async getSuperAdminCalendarFeedSettings(): Promise<SuperAdminCalendarFeedSettings> {
    const { feedKey, settings } = await this.getOrCreateSuperAdminCalendarFeedSettings();
    return this.mapSuperAdminSettings(settings, feedKey);
  }

  async rotateSuperAdminCalendarFeedKey(): Promise<SuperAdminCalendarFeedSettings> {
    const now = new Date();
    const currentSettings = await this.prisma.superAdminCalendarFeedSettings.findUnique({
      where: {
        id: SUPER_ADMIN_CALENDAR_FEED_ID,
      },
      select: {
        rotatedAt: true,
      },
    });
    this.assertFeedKeyRotationAllowed(currentSettings?.rotatedAt ?? null, now);

    const feedKey = this.generateFeedKey();
    const feedKeyHash = this.hashFeedKey(feedKey);
    const settings = await this.prisma.superAdminCalendarFeedSettings.upsert({
      where: {
        id: SUPER_ADMIN_CALENDAR_FEED_ID,
      },
      create: {
        id: SUPER_ADMIN_CALENDAR_FEED_ID,
        feedKeyHash,
        enabled: true,
        rotatedAt: now,
      },
      update: {
        feedKeyHash,
        enabled: true,
        lastFetchedAt: null,
        rotatedAt: now,
      },
      select: SUPER_ADMIN_CALENDAR_FEED_SETTINGS_SELECT,
    });

    return this.mapSuperAdminSettings(settings, feedKey);
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
        entries: [this.mapEventToCalendarEntry(event, this.buildPublicEventUrl(publicAppOrigin, event.id))],
        eventClass: ICalEventClass.PUBLIC,
        ttlSeconds: 60 * 60,
      }),
      fileName: `${this.slugifyFileName(event.name) || 'evento'}.ics`,
    };
  }

  async buildPrivateUserCalendarFeed(feedKey: string, publicAppOrigin: string): Promise<CalendarDownload> {
    const feedKeyHash = this.hashFeedKey(feedKey);
    const settings = await this.prisma.userCalendarFeedSettings.findUnique({
      where: {
        feedKeyHash,
      },
      select: {
        userId: true,
        enabled: true,
        feedKeyHash: true,
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

    await this.sampleLastFetchedAt(settings.userId, settings.feedKeyHash, settings.lastFetchedAt, now);

    return {
      content: this.buildCalendar({
        name: `CACiC Eventos - ${settings.user.name}`,
        description: 'Eventos vinculados a sua conta CACiC Eventos.',
        entries: events.map((event) =>
          this.mapEventToCalendarEntry(event, this.buildPublicEventUrl(publicAppOrigin, event.id)),
        ),
        eventClass: ICalEventClass.PRIVATE,
        ttlSeconds: 60 * 60,
      }),
      fileName: 'calendario-cacic-eventos.ics',
    };
  }

  async buildPrivateAdminCalendarFeed(feedKey: string, publicAppOrigin: string): Promise<CalendarDownload> {
    const feedKeyHash = this.hashFeedKey(feedKey);
    const settings = await this.prisma.userAdminCalendarFeedSettings.findUnique({
      where: {
        feedKeyHash,
      },
      select: {
        userId: true,
        enabled: true,
        feedKeyHash: true,
        lastFetchedAt: true,
        lastCheckedAt: true,
        user: {
          select: {
            name: true,
          },
        },
      },
    });

    if (!settings?.enabled) {
      throw new NotFoundException('Calendar feed was not found.');
    }

    const now = new Date();
    if (this.isStaleAdminAccessCheck(settings.lastCheckedAt, now)) {
      await this.disableAdminCalendarFeedForStaleAccess(settings.userId, now);
      throw new NotFoundException('Calendar feed was not found.');
    }

    const entries = await this.getAdminCalendarEntriesForUser(settings.userId, now, publicAppOrigin);
    if (entries.length === 0) {
      await this.disableAdminCalendarFeedWithoutTargets(settings.userId, now);
      throw new NotFoundException('Calendar feed was not found.');
    }

    await this.sampleAdminLastFetchedAt(settings.userId, settings.feedKeyHash, settings.lastFetchedAt, now);

    return {
      content: this.buildCalendar({
        name: `CACiC Eventos Admin - ${settings.user.name}`,
        description: 'Eventos, grupos e grandes eventos administrados por este usuário.',
        entries,
        eventClass: ICalEventClass.PRIVATE,
        ttlSeconds: 60 * 60,
      }),
      fileName: 'calendario-admin-cacic-eventos.ics',
    };
  }

  async buildSuperAdminCalendarFeed(feedKey: string, publicAppOrigin: string): Promise<CalendarDownload> {
    const feedKeyHash = this.hashFeedKey(feedKey);
    const settings = await this.prisma.superAdminCalendarFeedSettings.findUnique({
      where: {
        feedKeyHash,
      },
      select: {
        id: true,
        enabled: true,
        feedKeyHash: true,
        lastFetchedAt: true,
      },
    });

    if (!settings?.enabled) {
      throw new NotFoundException('Calendar feed was not found.');
    }

    const now = new Date();
    const entries = await this.getSuperAdminCalendarEntries(now, publicAppOrigin);
    await this.sampleSuperAdminLastFetchedAt(settings.feedKeyHash, settings.lastFetchedAt, now);

    return {
      content: this.buildCalendar({
        name: 'CACiC Eventos Admin - Super-admins',
        description: 'Feed compartilhado de todos os eventos, grupos e grandes eventos administráveis.',
        entries,
        eventClass: ICalEventClass.PRIVATE,
        ttlSeconds: 60 * 60,
      }),
      fileName: 'calendario-super-admin-cacic-eventos.ics',
    };
  }

  async runAdminCalendarFeedMaintenance(): Promise<number> {
    return this.disableStaleAdminCalendarFeeds(new Date());
  }

  private async enableCurrentUserCalendarFeed(
    userId: string,
  ): Promise<{ feedKey: string; settings: CalendarFeedSettingsRecord }> {
    const now = new Date();
    const feedKey = this.generateFeedKey();
    const feedKeyHash = this.hashFeedKey(feedKey);

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
          feedKeyHash,
          enabled: true,
          rotatedAt: now,
        },
        update: {
          feedKeyHash,
          enabled: true,
          disabledAt: null,
          disabledReason: null,
          lastFetchedAt: null,
          rotatedAt: now,
        },
        select: CALENDAR_FEED_SETTINGS_SELECT,
      }),
    ]);

    return { feedKey, settings };
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

  private async getAdminCalendarEntriesForUser(
    userId: string,
    now: Date,
    publicAppOrigin: string,
    take = ADMIN_FEED_ITEM_TAKE,
  ): Promise<CalendarEntry[]> {
    const grants = await this.findActiveAdminCalendarGrants(userId, now);
    const targetPlan = this.buildAdminFeedTargetPlan(grants);
    return this.getAdminCalendarEntriesFromPlan(targetPlan, now, publicAppOrigin, take);
  }

  private async getSuperAdminCalendarEntries(
    now: Date,
    publicAppOrigin: string,
    take = ADMIN_FEED_ITEM_TAKE,
  ): Promise<CalendarEntry[]> {
    return this.getAdminCalendarEntriesFromPlan(
      {
        globalEvents: true,
        globalEventGroups: true,
        globalMajorEvents: true,
        eventIds: new Set(),
        eventMajorEventIds: new Set(),
        eventGroupIdsForEvents: new Set(),
        eventGroupIds: new Set(),
        majorEventIds: new Set(),
      },
      now,
      publicAppOrigin,
      take,
    );
  }

  private async getAdminCalendarEntriesFromPlan(
    targetPlan: AdminFeedTargetPlan,
    now: Date,
    publicAppOrigin: string,
    take: number,
  ): Promise<CalendarEntry[]> {
    const [events, eventGroups, majorEvents] = await Promise.all([
      this.getAdminFeedEvents(targetPlan, now, take),
      this.getAdminFeedEventGroups(targetPlan, now, take),
      this.getAdminFeedMajorEvents(targetPlan, now, take),
    ]);

    return [
      ...events.map((event) => this.mapEventToCalendarEntry(event, this.buildAdminEventUrl(publicAppOrigin, event.id))),
      ...eventGroups
        .map((eventGroup) => this.mapEventGroupToCalendarEntry(eventGroup, publicAppOrigin, now))
        .filter((entry): entry is CalendarEntry => Boolean(entry)),
      ...majorEvents.map((majorEvent) => this.mapMajorEventToCalendarEntry(majorEvent, publicAppOrigin)),
    ].sort((left, right) => left.start.getTime() - right.start.getTime() || left.summary.localeCompare(right.summary));
  }

  private async getAdminFeedEvents(
    targetPlan: AdminFeedTargetPlan,
    now: Date,
    take: number,
  ): Promise<CalendarEventRecord[]> {
    const where = this.buildAdminFeedEventWhere(targetPlan, now);
    if (!where) {
      return [];
    }

    return this.prisma.event.findMany({
      where,
      select: CALENDAR_EVENT_SELECT,
      orderBy: {
        startDate: 'asc',
      },
      take,
    });
  }

  private async getAdminFeedEventGroups(
    targetPlan: AdminFeedTargetPlan,
    now: Date,
    take: number,
  ): Promise<AdminEventGroupRecord[]> {
    const where = this.buildAdminFeedEventGroupWhere(targetPlan, now);
    if (!where) {
      return [];
    }

    return this.prisma.eventGroup.findMany({
      where,
      select: buildAdminEventGroupSelect(now),
      orderBy: {
        name: 'asc',
      },
      take,
    });
  }

  private async getAdminFeedMajorEvents(
    targetPlan: AdminFeedTargetPlan,
    now: Date,
    take: number,
  ): Promise<AdminMajorEventRecord[]> {
    const where = this.buildAdminFeedMajorEventWhere(targetPlan, now);
    if (!where) {
      return [];
    }

    return this.prisma.majorEvent.findMany({
      where,
      select: ADMIN_MAJOR_EVENT_SELECT,
      orderBy: {
        startDate: 'asc',
      },
      take,
    });
  }

  private buildAdminFeedEventWhere(targetPlan: AdminFeedTargetPlan, now: Date): Prisma.EventWhereInput | null {
    const where: Prisma.EventWhereInput = {
      deletedAt: null,
      endDate: {
        gte: now,
      },
    };

    if (targetPlan.globalEvents) {
      return where;
    }

    const scopedTargets: Prisma.EventWhereInput[] = [];
    if (targetPlan.eventIds.size > 0) {
      scopedTargets.push({
        id: {
          in: [...targetPlan.eventIds],
        },
      });
    }
    if (targetPlan.eventMajorEventIds.size > 0) {
      scopedTargets.push({
        majorEventId: {
          in: [...targetPlan.eventMajorEventIds],
        },
      });
    }
    if (targetPlan.eventGroupIdsForEvents.size > 0) {
      scopedTargets.push({
        eventGroupId: {
          in: [...targetPlan.eventGroupIdsForEvents],
        },
      });
    }

    if (scopedTargets.length === 0) {
      return null;
    }

    return {
      ...where,
      OR: scopedTargets,
    };
  }

  private buildAdminFeedEventGroupWhere(
    targetPlan: AdminFeedTargetPlan,
    now: Date,
  ): Prisma.EventGroupWhereInput | null {
    const where: Prisma.EventGroupWhereInput = {
      deletedAt: null,
      events: {
        some: {
          deletedAt: null,
          endDate: {
            gte: now,
          },
        },
      },
    };

    if (targetPlan.globalEventGroups) {
      return where;
    }

    if (targetPlan.eventGroupIds.size === 0) {
      return null;
    }

    return {
      ...where,
      id: {
        in: [...targetPlan.eventGroupIds],
      },
    };
  }

  private buildAdminFeedMajorEventWhere(
    targetPlan: AdminFeedTargetPlan,
    now: Date,
  ): Prisma.MajorEventWhereInput | null {
    const where: Prisma.MajorEventWhereInput = {
      deletedAt: null,
      endDate: {
        gte: now,
      },
    };

    if (targetPlan.globalMajorEvents) {
      return where;
    }

    if (targetPlan.majorEventIds.size === 0) {
      return null;
    }

    return {
      ...where,
      id: {
        in: [...targetPlan.majorEventIds],
      },
    };
  }

  private async findActiveAdminCalendarGrants(userId: string, now: Date): Promise<AdminCalendarGrantRecord[]> {
    return this.prisma.eventManagerPermissionGrant.findMany({
      where: {
        userId,
        deletedAt: null,
        permission: {
          in: [...ADMIN_CALENDAR_FEED_PERMISSIONS],
        },
        OR: [{ validFrom: null }, { validFrom: { lte: now } }],
        AND: [{ OR: [{ validUntil: null }, { validUntil: { gt: now } }] }],
      },
      select: ADMIN_CALENDAR_GRANT_SELECT,
    });
  }

  private buildAdminFeedTargetPlan(grants: AdminCalendarGrantRecord[]): AdminFeedTargetPlan {
    const targetPlan: AdminFeedTargetPlan = {
      globalEvents: false,
      globalEventGroups: false,
      globalMajorEvents: false,
      eventIds: new Set(),
      eventMajorEventIds: new Set(),
      eventGroupIdsForEvents: new Set(),
      eventGroupIds: new Set(),
      majorEventIds: new Set(),
    };

    for (const grant of grants) {
      const grantsEvents = ADMIN_CALENDAR_EVENT_PERMISSION_SET.has(grant.permission);
      const grantsEventGroups = ADMIN_CALENDAR_EVENT_GROUP_PERMISSION_SET.has(grant.permission);
      const grantsMajorEvents = ADMIN_CALENDAR_MAJOR_EVENT_PERMISSION_SET.has(grant.permission);

      if (grant.scope === EventManagerPermissionGrantScope.GLOBAL) {
        targetPlan.globalEvents ||= grantsEvents;
        targetPlan.globalEventGroups ||= grantsEventGroups;
        targetPlan.globalMajorEvents ||= grantsMajorEvents;
        continue;
      }

      if (grant.scope === EventManagerPermissionGrantScope.EVENT && grant.eventId && grantsEvents) {
        targetPlan.eventIds.add(grant.eventId);
        continue;
      }

      if (grant.scope === EventManagerPermissionGrantScope.EVENT_GROUP && grant.eventGroupId) {
        if (grantsEvents) {
          targetPlan.eventGroupIdsForEvents.add(grant.eventGroupId);
        }
        if (grantsEventGroups) {
          targetPlan.eventGroupIds.add(grant.eventGroupId);
        }
        continue;
      }

      if (grant.scope === EventManagerPermissionGrantScope.MAJOR_EVENT && grant.majorEventId) {
        if (grantsEvents) {
          targetPlan.eventMajorEventIds.add(grant.majorEventId);
        }
        if (grantsMajorEvents) {
          targetPlan.majorEventIds.add(grant.majorEventId);
        }
      }
    }

    return targetPlan;
  }

  private async hasCurrentAdminFeedTargets(userId: string, now: Date): Promise<boolean> {
    const entries = await this.getAdminCalendarEntriesForUser(userId, now, 'https://eventos.cacic.dev.br', 1);
    return entries.length > 0;
  }

  private buildCalendar(input: {
    name: string;
    description: string | null;
    entries: CalendarEntry[];
    eventClass: ICalEventClass;
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

    for (const entry of input.entries) {
      calendar.createEvent({
        id: entry.id,
        summary: entry.summary,
        start: entry.start,
        end: entry.end,
        description: entry.description,
        location: entry.location,
        created: entry.created,
        lastModified: entry.lastModified,
        status: ICalEventStatus.CONFIRMED,
        class: input.eventClass,
        url: entry.url ?? undefined,
      });
    }

    return calendar.toString();
  }

  private mapEventToCalendarEntry(event: CalendarEventRecord, url: string): CalendarEntry {
    return {
      id: `event-${event.id}@eventos.cacic.dev.br`,
      summary: event.name,
      start: event.startDate,
      end: event.endDate,
      description: this.buildEventDescription(event),
      location: this.buildEventLocation(event),
      created: event.createdAt,
      lastModified: event.updatedAt,
      url,
    };
  }

  private mapEventGroupToCalendarEntry(
    eventGroup: AdminEventGroupRecord,
    publicAppOrigin: string,
    now: Date,
  ): CalendarEntry | null {
    const events = eventGroup.events.filter((event) => event.endDate >= now);
    if (events.length === 0) {
      return null;
    }

    const start = events[0].startDate;
    const end = events.reduce(
      (latest, event) => (event.endDate > latest ? event.endDate : latest),
      events[0].endDate,
    );

    return {
      id: `event-group-${eventGroup.id}@eventos.cacic.dev.br`,
      summary: eventGroup.name,
      start,
      end,
      description: `Grupo de eventos com ${events.length} evento(s).`,
      location: null,
      created: eventGroup.createdAt,
      lastModified: eventGroup.updatedAt,
      url: this.buildAdminEventGroupUrl(publicAppOrigin, eventGroup.id),
    };
  }

  private mapMajorEventToCalendarEntry(majorEvent: AdminMajorEventRecord, publicAppOrigin: string): CalendarEntry {
    return {
      id: `major-event-${majorEvent.id}@eventos.cacic.dev.br`,
      summary: majorEvent.name,
      start: majorEvent.startDate,
      end: majorEvent.endDate,
      description: majorEvent.description?.trim() || 'Grande evento.',
      location: null,
      created: majorEvent.createdAt,
      lastModified: majorEvent.updatedAt,
      url: this.buildAdminMajorEventUrl(publicAppOrigin, majorEvent.id),
    };
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

  private buildAdminEventUrl(publicAppOrigin: string, eventId: string): string {
    return new URL(`/admin/events/${encodeURIComponent(eventId)}`, publicAppOrigin).toString();
  }

  private buildAdminEventGroupUrl(publicAppOrigin: string, eventGroupId: string): string {
    return new URL(`/admin/groups/${encodeURIComponent(eventGroupId)}`, publicAppOrigin).toString();
  }

  private buildAdminMajorEventUrl(publicAppOrigin: string, majorEventId: string): string {
    return new URL(`/admin/major-events/${encodeURIComponent(majorEventId)}`, publicAppOrigin).toString();
  }

  private mapSettings(settings: CalendarFeedSettingsRecord | null, feedKey?: string): CurrentUserCalendarFeedSettings {
    return {
      enabled: settings?.enabled ?? false,
      feedPath: settings?.enabled && feedKey ? `/api/calendar/feeds/${encodeURIComponent(feedKey)}.ics` : null,
      disabledAt: settings?.disabledAt ?? null,
      disabledReason: settings?.disabledReason ?? null,
      lastFetchedAt: settings?.lastFetchedAt ?? null,
      rotatedAt: settings?.rotatedAt ?? null,
      updatedAt: settings?.updatedAt ?? null,
    };
  }

  private mapAdminSettings(
    settings: AdminCalendarFeedSettingsRecord | null,
    feedKey?: string,
  ): CurrentUserAdminCalendarFeedSettings {
    return {
      enabled: settings?.enabled ?? false,
      feedPath: settings?.enabled && feedKey ? `/api/calendar/admin/feeds/${encodeURIComponent(feedKey)}.ics` : null,
      disabledAt: settings?.disabledAt ?? null,
      disabledReason: settings?.disabledReason ?? null,
      lastFetchedAt: settings?.lastFetchedAt ?? null,
      lastCheckedAt: settings?.lastCheckedAt ?? null,
      rotatedAt: settings?.rotatedAt ?? null,
      updatedAt: settings?.updatedAt ?? null,
    };
  }

  private mapSuperAdminSettings(
    settings: SuperAdminCalendarFeedSettingsRecord | null,
    feedKey?: string,
  ): SuperAdminCalendarFeedSettings {
    return {
      enabled: settings?.enabled ?? false,
      feedPath: settings?.enabled && feedKey ? `/api/calendar/admin/super-admin/${encodeURIComponent(feedKey)}.ics` : null,
      lastFetchedAt: settings?.lastFetchedAt ?? null,
      rotatedAt: settings?.rotatedAt ?? null,
      updatedAt: settings?.updatedAt ?? null,
    };
  }

  private async getOrCreateSuperAdminCalendarFeedSettings(): Promise<{
    feedKey?: string;
    settings: SuperAdminCalendarFeedSettingsRecord;
  }> {
    const feedKey = this.generateFeedKey();
    const feedKeyHash = this.hashFeedKey(feedKey);
    const settings = await this.prisma.superAdminCalendarFeedSettings.upsert({
      where: {
        id: SUPER_ADMIN_CALENDAR_FEED_ID,
      },
      create: {
        id: SUPER_ADMIN_CALENDAR_FEED_ID,
        feedKeyHash,
        enabled: true,
      },
      update: {
        enabled: true,
      },
      select: SUPER_ADMIN_CALENDAR_FEED_SETTINGS_SELECT,
    });

    return {
      feedKey: settings.feedKeyHash === feedKeyHash ? feedKey : undefined,
      settings,
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

  private async disableAdminCalendarFeedWithoutTargets(userId: string, now: Date): Promise<void> {
    await this.prisma.userAdminCalendarFeedSettings.updateMany({
      where: {
        userId,
        enabled: true,
      },
      data: {
        enabled: false,
        disabledAt: now,
        disabledReason: ADMIN_CALENDAR_FEED_DISABLED_NO_CURRENT_TARGETS,
        lastCheckedAt: now,
      },
    });
  }

  private async disableAdminCalendarFeedForStaleAccess(userId: string, now: Date): Promise<void> {
    await this.prisma.userAdminCalendarFeedSettings.updateMany({
      where: {
        userId,
        enabled: true,
      },
      data: {
        enabled: false,
        disabledAt: now,
        disabledReason: ADMIN_CALENDAR_FEED_DISABLED_STALE_ACCESS,
        lastCheckedAt: now,
      },
    });
  }

  private async disableStaleAdminCalendarFeeds(now: Date): Promise<number> {
    const settings = await this.prisma.userAdminCalendarFeedSettings.findMany({
      where: {
        enabled: true,
      },
      select: {
        userId: true,
      },
      orderBy: {
        userId: 'asc',
      },
    });

    let disabledCount = 0;
    for (const setting of settings) {
      if (await this.hasCurrentAdminFeedTargets(setting.userId, now)) {
        continue;
      }

      await this.disableAdminCalendarFeedWithoutTargets(setting.userId, now);
      disabledCount += 1;
    }

    return disabledCount;
  }

  private async sampleLastFetchedAt(
    userId: string,
    feedKeyHash: string,
    lastFetchedAt: Date | null,
    now: Date,
  ): Promise<void> {
    if (lastFetchedAt && lastFetchedAt > subHours(now, PRIVATE_FEED_LAST_FETCH_WRITE_INTERVAL_HOURS)) {
      return;
    }

    await this.prisma.userCalendarFeedSettings.updateMany({
      where: {
        userId,
        feedKeyHash,
        enabled: true,
      },
      data: {
        lastFetchedAt: now,
      },
    });
  }

  private async sampleAdminLastFetchedAt(
    userId: string,
    feedKeyHash: string,
    lastFetchedAt: Date | null,
    now: Date,
  ): Promise<void> {
    if (lastFetchedAt && lastFetchedAt > subHours(now, PRIVATE_FEED_LAST_FETCH_WRITE_INTERVAL_HOURS)) {
      return;
    }

    await this.prisma.userAdminCalendarFeedSettings.updateMany({
      where: {
        userId,
        feedKeyHash,
        enabled: true,
      },
      data: {
        lastFetchedAt: now,
      },
    });
  }

  private async sampleSuperAdminLastFetchedAt(
    feedKeyHash: string,
    lastFetchedAt: Date | null,
    now: Date,
  ): Promise<void> {
    if (lastFetchedAt && lastFetchedAt > subHours(now, PRIVATE_FEED_LAST_FETCH_WRITE_INTERVAL_HOURS)) {
      return;
    }

    await this.prisma.superAdminCalendarFeedSettings.updateMany({
      where: {
        id: SUPER_ADMIN_CALENDAR_FEED_ID,
        feedKeyHash,
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

  private isStaleAdminAccessCheck(lastCheckedAt: Date | null, now: Date): boolean {
    return !lastCheckedAt || lastCheckedAt < subHours(now, ADMIN_FEED_ACCESS_CHECK_MAX_AGE_HOURS);
  }

  private assertFeedKeyRotationAllowed(rotatedAt: Date | null, now: Date): void {
    if (rotatedAt && rotatedAt > subHours(now, CALENDAR_FEED_KEY_ROTATION_COOLDOWN_HOURS)) {
      throw new BadRequestException('A chave do feed só pode ser rotacionada uma vez a cada 24 horas.');
    }
  }

  private generateFeedKey(): string {
    return randomBytes(CALENDAR_FEED_KEY_BYTES).toString('base64url');
  }

  private hashFeedKey(feedKey: string): string {
    return createHmac('sha256', this.calendarFeedKeyPepper).update(feedKey, 'utf8').digest('base64url');
  }

  private readCalendarFeedKeyPepper(): string {
    const pepper = process.env.CALENDAR_FEED_KEY_PEPPER?.trim();
    if (pepper) {
      return pepper;
    }

    if (process.env.NODE_ENV === 'production') {
      throw new Error('CALENDAR_FEED_KEY_PEPPER must be configured in production.');
    }

    return 'development-calendar-feed-key-pepper';
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
