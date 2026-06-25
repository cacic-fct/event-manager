import {
  EventAttendance,
  EventAttendanceScannerFeedItem,
  MajorEventUserAttendance,
  OfflineEventAttendanceSubmission,
  OfflineEventAttendanceSubmissionStatus,
} from '@cacic-fct/shared-data-types';
import { Permission } from '@cacic-fct/shared-permissions';
import { NotFoundException } from '@nestjs/common';
import { Args, Int, Query, Resolver } from '@nestjs/graphql';
import { Prisma } from '@prisma/client';
import { RequirePermissions } from '../../auth/decorators/require-permissions.decorator';
import { resolvePagination } from '../../common/pagination';
import { PrismaService } from '../../prisma/prisma.service';
import { AttendanceCategoryService } from '../attendance-category.service';
import { EventAttendancesResolverBase, EVENT_RELATION_SELECT } from './event-attendances.shared';
import {
  mapOfflineSubmissionForResponse,
  offlineSubmissionActorIds,
  offlineSubmissionActorNameMap,
  OfflineSubmissionResponseSource,
} from './offline-submission-response';

const OFFLINE_ATTENDANCE_SUBMISSION_LIST_LIMIT = 1000;

@Resolver(() => EventAttendance)
export class EventAttendancesQueriesResolver extends EventAttendancesResolverBase {
  constructor(prisma: PrismaService, attendanceCategories: AttendanceCategoryService) {
    super(prisma, attendanceCategories);
  }

  @Query(() => [EventAttendance], { name: 'eventAttendances' })
  @RequirePermissions(Permission.EventAttendance.Read)
  async eventAttendances(
    @Args('personId', { type: () => String, nullable: true }) personId?: string,
    @Args('eventId', { type: () => String, nullable: true }) eventId?: string,
    @Args('skip', { type: () => Int, nullable: true }) skip?: number,
    @Args('take', { type: () => Int, nullable: true }) take?: number,
  ) {
    const pagination = resolvePagination(skip, take);
    const where: Prisma.EventAttendanceWhereInput = {};

    if (personId) {
      where.personId = personId;
    }

    if (eventId) {
      where.eventId = eventId;
    }

    const attendances = await this.prisma.eventAttendance.findMany({
      where,
      select: {
        personId: true,
        eventId: true,
        attendedAt: true,
        createdAt: true,
        createdById: true,
        committedById: true,
        createdByMethod: true,
        collectedLatitude: true,
        collectedLongitude: true,
        collectedAccuracyMeters: true,
        category: true,
        person: true,
        event: {
          select: EVENT_RELATION_SELECT,
        },
      },
      orderBy: {
        attendedAt: 'desc',
      },
      skip: pagination.skip,
      take: pagination.take,
    });

    const collectorIds = [
      ...new Set(attendances.map((attendance) => attendance.createdById).filter((id): id is string => Boolean(id))),
    ];
    const committerIds = [
      ...new Set(attendances.map((attendance) => attendance.committedById).filter((id): id is string => Boolean(id))),
    ];
    const actorIds = [...new Set([...collectorIds, ...committerIds])];
    const collectors = actorIds.length
      ? await this.prisma.user.findMany({
          where: {
            id: {
              in: actorIds,
            },
          },
          select: {
            id: true,
            name: true,
          },
        })
      : [];
    const collectorNameById = new Map(collectors.map((collector) => [collector.id, collector.name]));

    return attendances.map((attendance) => ({
      ...attendance,
      collectedByFullName: attendance.createdById ? (collectorNameById.get(attendance.createdById) ?? undefined) : undefined,
      committedByFullName:
        attendance.committedById && attendance.committedById !== attendance.createdById
          ? (collectorNameById.get(attendance.committedById) ?? undefined)
          : undefined,
    }));
  }

  @Query(() => [EventAttendanceScannerFeedItem], { name: 'eventAttendanceScannerFeed' })
  @RequirePermissions(Permission.EventAttendance.Read)
  eventAttendanceScannerFeed(@Args('eventId', { type: () => String }) eventId: string) {
    return this.getScannerFeed(eventId);
  }

  @Query(() => [OfflineEventAttendanceSubmission], { name: 'offlineEventAttendanceSubmissions' })
  @RequirePermissions(Permission.EventAttendance.Read)
  async offlineEventAttendanceSubmissions(
    @Args('eventId', { type: () => String }) eventId: string,
    @Args('status', { type: () => OfflineEventAttendanceSubmissionStatus, nullable: true })
    status?: OfflineEventAttendanceSubmissionStatus,
  ): Promise<OfflineEventAttendanceSubmission[]> {
    const submissions = await this.prisma.offlineEventAttendanceSubmission.findMany({
      where: {
        eventId,
        status: status ?? 'PENDING',
      },
      include: {
        event: true,
        person: true,
      },
      orderBy: {
        submittedAt: 'desc',
      },
      take: OFFLINE_ATTENDANCE_SUBMISSION_LIST_LIMIT,
    });

    return this.withOfflineSubmissionActorNames(submissions);
  }

  @Query(() => [MajorEventUserAttendance], {
    name: 'majorEventUserAttendances',
  })
  @RequirePermissions(Permission.EventAttendance.Read)
  async majorEventUserAttendances(
    @Args('majorEventId', { type: () => String }) majorEventId: string,
    @Args('personId', { type: () => String, nullable: true }) personId?: string,
    @Args('skip', { type: () => Int, nullable: true }) skip?: number,
    @Args('take', { type: () => Int, nullable: true }) take?: number,
  ) {
    const pagination = resolvePagination(skip, take);
    const majorEvent = await this.prisma.majorEvent.findFirst({
      where: {
        id: majorEventId,
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });

    if (!majorEvent) {
      throw new NotFoundException(`Major event ${majorEventId} was not found.`);
    }

    const events = await this.prisma.event.findMany({
      where: {
        majorEventId,
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        startDate: true,
      },
      orderBy: {
        startDate: 'asc',
      },
    });

    if (events.length === 0) {
      return [];
    }

    const eventIds = events.map((event) => event.id);
    const subscriptions = await this.prisma.majorEventSubscription.findMany({
      where: {
        majorEventId,
        deletedAt: null,
        ...(personId ? { personId } : {}),
      },
      include: {
        person: {
          include: {
            user: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      skip: pagination.skip,
      take: pagination.take,
    });

    const personIds = subscriptions.map((subscription) => subscription.personId);
    if (personIds.length === 0) {
      return [];
    }

    const attendances = await this.prisma.eventAttendance.findMany({
      where: {
        eventId: {
          in: eventIds,
        },
        personId: {
          in: personIds,
        },
      },
      select: {
        personId: true,
        eventId: true,
        attendedAt: true,
        category: true,
        person: {
          include: {
            user: true,
          },
        },
      },
    });

    const attendanceByKey = new Map(
      attendances.map((attendance) => [`${attendance.personId}:${attendance.eventId}`, attendance]),
    );

    const majorSubscriptionByPerson = new Map<string, (typeof subscriptions)[number]>();
    for (const subscription of subscriptions) {
      if (!majorSubscriptionByPerson.has(subscription.personId)) {
        majorSubscriptionByPerson.set(subscription.personId, subscription);
      }
    }

    return personIds.map((resolvedPersonId) => {
      const subscription = majorSubscriptionByPerson.get(resolvedPersonId);
      const person =
        subscription?.person ?? attendances.find((attendance) => attendance.personId === resolvedPersonId)?.person;

      return {
        majorEventId,
        subscriptionId: subscription?.id,
        personId: resolvedPersonId,
        person,
        subscriptionStatus: subscription?.subscriptionStatus ?? 'UNKNOWN',
        amountPaid: subscription?.amountPaid,
        paymentDate: subscription?.paymentDate,
        paymentTier: subscription?.paymentTier,
        attendances: events.map((event) => {
          const attendance = attendanceByKey.get(`${resolvedPersonId}:${event.id}`);
          return {
            eventId: event.id,
            eventName: event.name,
            eventStartDate: event.startDate,
            attended: attendance != null,
            attendedAt: attendance?.attendedAt,
            category: attendance?.category ?? 'UNKNOWN',
          };
        }),
      };
    });
  }

  @Query(() => EventAttendance, { name: 'eventAttendance' })
  @RequirePermissions(Permission.EventAttendance.Read)
  async eventAttendance(
    @Args('personId', { type: () => String }) personId: string,
    @Args('eventId', { type: () => String }) eventId: string,
  ) {
    const attendance = await this.prisma.eventAttendance.findUnique({
      where: {
        personId_eventId: {
          personId,
          eventId,
        },
      },
      select: {
        personId: true,
        eventId: true,
        attendedAt: true,
        createdAt: true,
        createdById: true,
        committedById: true,
        createdByMethod: true,
        category: true,
        person: true,
        event: {
          select: EVENT_RELATION_SELECT,
        },
      },
    });

    if (!attendance) {
      throw new NotFoundException(`Attendance ${personId}/${eventId} was not found.`);
    }

    return attendance;
  }

  private async withOfflineSubmissionActorNames(
    submissions: OfflineSubmissionResponseSource[],
  ): Promise<OfflineEventAttendanceSubmission[]> {
    const actorIds = offlineSubmissionActorIds(submissions);
    const actors = actorIds.length
      ? await this.prisma.user.findMany({
          where: {
            id: {
              in: actorIds,
            },
          },
          select: {
            id: true,
            name: true,
          },
        })
      : [];
    const actorNameById = offlineSubmissionActorNameMap(actors);

    return submissions.map((submission) => mapOfflineSubmissionForResponse(submission, actorNameById));
  }
}
