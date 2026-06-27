import { ICalEventClass } from 'ical-generator';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { subHours, subYears } from 'date-fns';
import { PrismaService } from '../prisma/prisma.service';
import { PUBLIC_EVENT_WHERE } from '../public-events/models';
import {
  ADMIN_FEED_ACCESS_CHECK_MAX_AGE_HOURS,
  ADMIN_FEED_ITEM_TAKE,
  PRIVATE_FEED_LAST_FETCH_WRITE_INTERVAL_HOURS,
} from './calendar-feed.constants';
import {
  assertFeedKeyRotationAllowed,
  deriveFeedKey,
  generateFeedKeyNonce,
  hashFeedKey,
  readCalendarFeedKeyPepper,
} from './calendar-feed-keys';
import {
  mapAdminSettings,
  mapSettings,
  mapSuperAdminSettings,
} from './calendar-feed-settings.mapper';
import {
  buildCalendar,
  buildPublicEventUrl,
  mapEventToCalendarEntry,
  mapPublicEventGroupToCalendarEntry,
  slugifyFileName,
} from './calendar-ical.builder';
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
import {
  getAdminCalendarEntriesForUser,
  getSuperAdminCalendarEntries,
  hasCurrentAdminFeedTargets,
} from './calendar-admin-feed.repository';
import { getPrivateFeedEvents } from './calendar-private-feed.repository';
import {
  ADMIN_CALENDAR_FEED_SETTINGS_SELECT,
  CALENDAR_FEED_SETTINGS_SELECT,
  CalendarFeedSettingsRecord,
  PUBLIC_EVENT_CALENDAR_SELECT,
  SUPER_ADMIN_CALENDAR_FEED_SETTINGS_SELECT,
  SuperAdminCalendarFeedSettingsRecord,
} from './calendar-records';

@Injectable()
export class CalendarService {
  private readonly calendarFeedKeyPepper = readCalendarFeedKeyPepper();

  constructor(private readonly prisma: PrismaService) {}

  async getCurrentUserCalendarFeedSettings(userId: string): Promise<CurrentUserCalendarFeedSettings> {
    const settings = await this.prisma.userCalendarFeedSettings.findUnique({
      where: {
        userId,
      },
      select: CALENDAR_FEED_SETTINGS_SELECT,
    });

    return mapSettings(settings, this.calendarFeedKeyPepper);
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

      return mapSettings(settings[0] ?? null, this.calendarFeedKeyPepper);
    }

    const { feedKey, settings } = await this.enableCurrentUserCalendarFeed(userId);
    return mapSettings(settings, this.calendarFeedKeyPepper, feedKey);
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
    assertFeedKeyRotationAllowed(currentSettings?.rotatedAt ?? null, now);

    const feedKeyNonce = generateFeedKeyNonce();
    const feedKey = deriveFeedKey(feedKeyNonce, this.calendarFeedKeyPepper);
    const feedKeyHash = hashFeedKey(feedKey, this.calendarFeedKeyPepper);
    const settings = await this.prisma.userCalendarFeedSettings.upsert({
      where: {
        userId,
      },
      create: {
        userId,
        feedKeyNonce,
        feedKeyHash,
        enabled: false,
        rotatedAt: now,
      },
      update: {
        feedKeyNonce,
        feedKeyHash,
        rotatedAt: now,
        lastFetchedAt: null,
      },
      select: CALENDAR_FEED_SETTINGS_SELECT,
    });

    return mapSettings(settings, this.calendarFeedKeyPepper, feedKey);
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
      return mapAdminSettings(null, this.calendarFeedKeyPepper);
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

    return mapAdminSettings(refreshedSettings, this.calendarFeedKeyPepper);
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

      return mapAdminSettings(settings[0] ?? null, this.calendarFeedKeyPepper);
    }

    if (!(await hasCurrentAdminFeedTargets(this.prisma, userId, now, 1))) {
      throw new BadRequestException('Não há eventos administrativos atuais ou futuros para este usuário.');
    }

    const currentSettings = await this.prisma.userAdminCalendarFeedSettings.findUnique({
      where: {
        userId,
      },
      select: {
        feedKeyNonce: true,
        feedKeyHash: true,
      },
    });

    if (currentSettings) {
      const feedKeyNonce = currentSettings.feedKeyNonce ?? generateFeedKeyNonce();
      const feedKey = deriveFeedKey(feedKeyNonce, this.calendarFeedKeyPepper);
      const shouldRecoverMissingFeedKey = !currentSettings.feedKeyNonce;
      const settings = await this.prisma.userAdminCalendarFeedSettings.update({
        where: {
          userId,
        },
        data: {
          enabled: true,
          disabledAt: null,
          disabledReason: null,
          lastCheckedAt: now,
          ...(shouldRecoverMissingFeedKey
            ? {
                feedKeyNonce,
                feedKeyHash: hashFeedKey(feedKey, this.calendarFeedKeyPepper),
                rotatedAt: now,
                lastFetchedAt: null,
              }
            : {}),
        },
        select: ADMIN_CALENDAR_FEED_SETTINGS_SELECT,
      });

      return mapAdminSettings(settings, this.calendarFeedKeyPepper, feedKey);
    }

    const feedKeyNonce = generateFeedKeyNonce();
    const feedKey = deriveFeedKey(feedKeyNonce, this.calendarFeedKeyPepper);
    const feedKeyHash = hashFeedKey(feedKey, this.calendarFeedKeyPepper);
    const settings = await this.prisma.userAdminCalendarFeedSettings.create({
      data: {
        userId,
        feedKeyNonce,
        feedKeyHash,
        enabled: true,
        rotatedAt: now,
        lastCheckedAt: now,
      },
      select: ADMIN_CALENDAR_FEED_SETTINGS_SELECT,
    });

    return mapAdminSettings(settings, this.calendarFeedKeyPepper, feedKey);
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
    assertFeedKeyRotationAllowed(currentSettings?.rotatedAt ?? null, now);

    const feedKeyNonce = generateFeedKeyNonce();
    const feedKey = deriveFeedKey(feedKeyNonce, this.calendarFeedKeyPepper);
    const feedKeyHash = hashFeedKey(feedKey, this.calendarFeedKeyPepper);
    const settings = await this.prisma.userAdminCalendarFeedSettings.upsert({
      where: {
        userId,
      },
      create: {
        userId,
        feedKeyNonce,
        feedKeyHash,
        enabled: false,
        rotatedAt: now,
        lastCheckedAt: now,
      },
      update: {
        feedKeyNonce,
        feedKeyHash,
        rotatedAt: now,
        lastFetchedAt: null,
        lastCheckedAt: now,
      },
      select: ADMIN_CALENDAR_FEED_SETTINGS_SELECT,
    });

    return mapAdminSettings(settings, this.calendarFeedKeyPepper, feedKey);
  }

  async getSuperAdminCalendarFeedSettings(): Promise<SuperAdminCalendarFeedSettings> {
    const { feedKey, settings } = await this.getOrCreateSuperAdminCalendarFeedSettings();
    return mapSuperAdminSettings(settings, this.calendarFeedKeyPepper, feedKey);
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
    assertFeedKeyRotationAllowed(currentSettings?.rotatedAt ?? null, now);

    const feedKeyNonce = generateFeedKeyNonce();
    const feedKey = deriveFeedKey(feedKeyNonce, this.calendarFeedKeyPepper);
    const feedKeyHash = hashFeedKey(feedKey, this.calendarFeedKeyPepper);
    const settings = await this.prisma.superAdminCalendarFeedSettings.upsert({
      where: {
        id: SUPER_ADMIN_CALENDAR_FEED_ID,
      },
      create: {
        id: SUPER_ADMIN_CALENDAR_FEED_ID,
        feedKeyNonce,
        feedKeyHash,
        enabled: true,
        rotatedAt: now,
      },
      update: {
        feedKeyNonce,
        feedKeyHash,
        enabled: true,
        lastFetchedAt: null,
        rotatedAt: now,
      },
      select: SUPER_ADMIN_CALENDAR_FEED_SETTINGS_SELECT,
    });

    return mapSuperAdminSettings(settings, this.calendarFeedKeyPepper, feedKey);
  }

  async buildPublicEventCalendar(eventId: string, publicAppOrigin: string): Promise<CalendarDownload> {
    const event = await this.prisma.event.findFirst({
      where: {
        AND: [PUBLIC_EVENT_WHERE, { id: eventId }],
      },
      select: PUBLIC_EVENT_CALENDAR_SELECT,
    });

    if (!event) {
      throw new NotFoundException(`Event ${eventId} was not found.`);
    }

    const groupedEntry = event.eventGroup
      ? mapPublicEventGroupToCalendarEntry(event.eventGroup, buildPublicEventUrl(publicAppOrigin, event.id))
      : null;
    const entry = groupedEntry ?? mapEventToCalendarEntry(event, buildPublicEventUrl(publicAppOrigin, event.id));
    const calendarName = groupedEntry ? event.eventGroup?.name : event.name;

    return {
      content: buildCalendar({
        name: calendarName ?? event.name,
        description: groupedEntry ? groupedEntry.description : (event.shortDescription ?? event.description ?? null),
        entries: [entry],
        eventClass: ICalEventClass.PUBLIC,
        ttlSeconds: 60 * 60,
      }),
      fileName: `${slugifyFileName(calendarName ?? event.name) || 'evento'}.ics`,
    };
  }

  async buildPrivateUserCalendarFeed(feedKey: string, publicAppOrigin: string): Promise<CalendarDownload> {
    const feedKeyHash = hashFeedKey(feedKey, this.calendarFeedKeyPepper);
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
    const events = await getPrivateFeedEvents(this.prisma, personIds);

    await this.sampleLastFetchedAt(settings.userId, settings.feedKeyHash, settings.lastFetchedAt, now);

    return {
      content: buildCalendar({
        name: `CACiC Eventos - ${settings.user.name}`,
        description: 'Eventos vinculados a sua conta CACiC Eventos.',
        entries: events.map((event) =>
          mapEventToCalendarEntry(event, buildPublicEventUrl(publicAppOrigin, event.id)),
        ),
        eventClass: ICalEventClass.PRIVATE,
        ttlSeconds: 60 * 60,
      }),
      fileName: 'calendario-cacic-eventos.ics',
    };
  }

  async buildPrivateAdminCalendarFeed(feedKey: string, publicAppOrigin: string): Promise<CalendarDownload> {
    const feedKeyHash = hashFeedKey(feedKey, this.calendarFeedKeyPepper);
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

    const entries = await getAdminCalendarEntriesForUser(
      this.prisma,
      settings.userId,
      now,
      publicAppOrigin,
      ADMIN_FEED_ITEM_TAKE,
    );
    if (entries.length === 0) {
      await this.disableAdminCalendarFeedWithoutTargets(settings.userId, now);
      throw new NotFoundException('Calendar feed was not found.');
    }

    await this.sampleAdminLastFetchedAt(settings.userId, settings.feedKeyHash, settings.lastFetchedAt, now);

    return {
      content: buildCalendar({
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
    const feedKeyHash = hashFeedKey(feedKey, this.calendarFeedKeyPepper);
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
    const entries = await getSuperAdminCalendarEntries(this.prisma, publicAppOrigin, ADMIN_FEED_ITEM_TAKE);
    await this.sampleSuperAdminLastFetchedAt(settings.feedKeyHash, settings.lastFetchedAt, now);

    return {
      content: buildCalendar({
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
  ): Promise<{ feedKey?: string; settings: CalendarFeedSettingsRecord }> {
    const now = new Date();
    const currentSettings = await this.prisma.userCalendarFeedSettings.findUnique({
      where: {
        userId,
      },
      select: {
        feedKeyNonce: true,
        feedKeyHash: true,
      },
    });

    if (currentSettings) {
      const feedKeyNonce = currentSettings.feedKeyNonce ?? generateFeedKeyNonce();
      const feedKey = deriveFeedKey(feedKeyNonce, this.calendarFeedKeyPepper);
      const shouldRecoverMissingFeedKey = !currentSettings.feedKeyNonce;
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
        this.prisma.userCalendarFeedSettings.update({
          where: {
            userId,
          },
          data: {
            enabled: true,
            disabledAt: null,
            disabledReason: null,
            ...(shouldRecoverMissingFeedKey
              ? {
                  feedKeyNonce,
                  feedKeyHash: hashFeedKey(feedKey, this.calendarFeedKeyPepper),
                  rotatedAt: now,
                  lastFetchedAt: null,
                }
              : {}),
          },
          select: CALENDAR_FEED_SETTINGS_SELECT,
        }),
      ]);

      return { feedKey, settings };
    }

    const feedKeyNonce = generateFeedKeyNonce();
    const feedKey = deriveFeedKey(feedKeyNonce, this.calendarFeedKeyPepper);
    const feedKeyHash = hashFeedKey(feedKey, this.calendarFeedKeyPepper);

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
      this.prisma.userCalendarFeedSettings.create({
        data: {
          userId,
          feedKeyNonce,
          feedKeyHash,
          enabled: true,
          rotatedAt: now,
        },
        select: CALENDAR_FEED_SETTINGS_SELECT,
      }),
    ]);

    return { feedKey, settings };
  }

  private async getOrCreateSuperAdminCalendarFeedSettings(): Promise<{
    feedKey?: string;
    settings: SuperAdminCalendarFeedSettingsRecord;
  }> {
    const feedKeyNonce = generateFeedKeyNonce();
    const feedKey = deriveFeedKey(feedKeyNonce, this.calendarFeedKeyPepper);
    const feedKeyHash = hashFeedKey(feedKey, this.calendarFeedKeyPepper);
    const settings = await this.prisma.superAdminCalendarFeedSettings.upsert({
      where: {
        id: SUPER_ADMIN_CALENDAR_FEED_ID,
      },
      create: {
        id: SUPER_ADMIN_CALENDAR_FEED_ID,
        feedKeyNonce,
        feedKeyHash,
        enabled: true,
      },
      update: {
        enabled: true,
      },
      select: SUPER_ADMIN_CALENDAR_FEED_SETTINGS_SELECT,
    });

    if (settings.feedKeyNonce) {
      return {
        feedKey: deriveFeedKey(settings.feedKeyNonce, this.calendarFeedKeyPepper),
        settings,
      };
    }

    const recoveredSettings = await this.prisma.superAdminCalendarFeedSettings.upsert({
      where: {
        id: SUPER_ADMIN_CALENDAR_FEED_ID,
      },
      create: {
        id: SUPER_ADMIN_CALENDAR_FEED_ID,
        feedKeyNonce,
        feedKeyHash,
        enabled: true,
      },
      update: {
        feedKeyNonce,
        feedKeyHash,
        enabled: true,
        lastFetchedAt: null,
        rotatedAt: new Date(),
      },
      select: SUPER_ADMIN_CALENDAR_FEED_SETTINGS_SELECT,
    });

    return {
      feedKey,
      settings: recoveredSettings,
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
      if (await hasCurrentAdminFeedTargets(this.prisma, setting.userId, now, 1)) {
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

}
