import { BadRequestException, ConflictException } from '@nestjs/common';
import { Args, Context, Mutation, Query, Resolver } from '@nestjs/graphql';
import { AttendanceCreationMethod } from '@prisma/client';
import {
  ConfirmCurrentUserOnlineAttendanceInput,
  CurrentUserEventAttendance,
  CurrentUserOrganizerInfo,
  CurrentUserPendingOnlineAttendanceEvent,
} from '../models';
import { CurrentUserContextService } from '../context.service';
import { CurrentUserEventMapperService } from '../mapper.service';
import { CURRENT_USER_EVENT_ATTENDANCE_SELECT, GraphqlContext } from '../selects';
import { PrismaService } from '../../prisma/prisma.service';
import { AttendanceCategoryService } from '../../events/attendance-category.service';
import { CurrentUserOnlineAttendanceRealtimeService } from './attendance-realtime.service';
import { PUBLIC_EVENT_SELECT } from '../../public-events/models';

@Resolver()
export class CurrentUserEventAttendanceResolver {
  constructor(
    private readonly prisma: PrismaService,
    private readonly currentUserContext: CurrentUserContextService,
    private readonly mapper: CurrentUserEventMapperService,
    private readonly attendanceCategories: AttendanceCategoryService,
    private readonly attendanceRealtime: CurrentUserOnlineAttendanceRealtimeService,
  ) {}

  @Query(() => [CurrentUserEventAttendance], {
    name: 'currentUserEventAttendances',
  })
  async currentUserEventAttendances(@Context() context: GraphqlContext): Promise<CurrentUserEventAttendance[]> {
    const authenticatedUser = this.currentUserContext.getAuthenticatedUser(context);
    const { person } = await this.currentUserContext.resolveCurrentUserContext(authenticatedUser);
    if (!person) {
      return [];
    }

    const attendances = await this.prisma.eventAttendance.findMany({
      where: {
        personId: person.id,
        event: {
          deletedAt: null,
        },
      },
      select: CURRENT_USER_EVENT_ATTENDANCE_SELECT,
      orderBy: {
        attendedAt: 'desc',
      },
    });

    return attendances.map((attendance) => this.mapper.mapCurrentUserEventAttendance(attendance));
  }

  @Query(() => CurrentUserEventAttendance, {
    name: 'currentUserEventAttendance',
    nullable: true,
  })
  async currentUserEventAttendance(
    @Args('eventId', { type: () => String }) eventId: string,
    @Context() context: GraphqlContext,
  ): Promise<CurrentUserEventAttendance | null> {
    const authenticatedUser = this.currentUserContext.getAuthenticatedUser(context);
    const { person } = await this.currentUserContext.resolveCurrentUserContext(authenticatedUser);
    if (!person) {
      return null;
    }

    const attendance = await this.prisma.eventAttendance.findFirst({
      where: {
        personId: person.id,
        eventId,
        event: {
          deletedAt: null,
        },
      },
      select: CURRENT_USER_EVENT_ATTENDANCE_SELECT,
    });

    if (!attendance) {
      return null;
    }

    return this.mapper.mapCurrentUserEventAttendance(attendance);
  }

  @Mutation(() => CurrentUserEventAttendance, {
    name: 'confirmCurrentUserOnlineAttendance',
  })
  async confirmCurrentUserOnlineAttendance(
    @Args('input', { type: () => ConfirmCurrentUserOnlineAttendanceInput })
    input: ConfirmCurrentUserOnlineAttendanceInput,
    @Context() context: GraphqlContext,
  ): Promise<CurrentUserEventAttendance> {
    const person = await this.currentUserContext.requireCurrentPerson(context);
    const normalizedCode = input.code.trim();
    if (!normalizedCode) {
      throw new BadRequestException('Attendance code cannot be empty.');
    }

    const event = await this.prisma.event.findFirst({
      where: {
        id: input.eventId,
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        allowSubscription: true,
        shouldCollectAttendance: true,
        isOnlineAttendanceAllowed: true,
        onlineAttendanceCode: true,
        onlineAttendanceStartDate: true,
        onlineAttendanceEndDate: true,
        majorEventId: true,
        majorEvent: {
          select: {
            id: true,
            isPaymentRequired: true,
          },
        },
      },
    });

    if (!event) {
      throw new BadRequestException(`Event ${input.eventId} was not found.`);
    }

    if (!event.shouldCollectAttendance || !event.isOnlineAttendanceAllowed) {
      throw new BadRequestException(`Event ${input.eventId} does not allow online attendance confirmation.`);
    }

    if (!event.onlineAttendanceCode) {
      throw new BadRequestException(`Event ${input.eventId} does not have an online attendance code configured.`);
    }

    if (event.onlineAttendanceCode.trim() !== normalizedCode) {
      throw new BadRequestException('Invalid attendance code.');
    }

    const now = new Date();
    if (event.onlineAttendanceStartDate && now < event.onlineAttendanceStartDate) {
      throw new BadRequestException(`Online attendance for event ${input.eventId} is not open yet.`);
    }

    if (event.onlineAttendanceEndDate && now > event.onlineAttendanceEndDate) {
      throw new BadRequestException(`Online attendance for event ${input.eventId} is already closed.`);
    }

    const existingAttendance = await this.prisma.eventAttendance.findUnique({
      where: {
        personId_eventId: {
          personId: person.id,
          eventId: event.id,
        },
      },
      select: {
        personId: true,
      },
    });

    if (existingAttendance) {
      throw new ConflictException(`Attendance is already confirmed for event ${input.eventId}.`);
    }

    const createdAttendance = await this.prisma.$transaction(async (tx) => {
      await tx.eventAttendance.create({
        data: {
          personId: person.id,
          eventId: event.id,
          createdByMethod: AttendanceCreationMethod.ONLINE_CODE,
        },
      });
      await this.attendanceCategories.refreshForAttendance(person.id, event.id, tx);
      return tx.eventAttendance.findUniqueOrThrow({
        where: {
          personId_eventId: {
            personId: person.id,
            eventId: event.id,
          },
        },
        select: CURRENT_USER_EVENT_ATTENDANCE_SELECT,
      });
    });

    await this.attendanceRealtime.notifyPerson(person.id);

    return this.mapper.mapCurrentUserEventAttendance(createdAttendance);
  }

  @Query(() => [CurrentUserPendingOnlineAttendanceEvent], {
    name: 'currentUserPendingOnlineAttendanceEvents',
  })
  async currentUserPendingOnlineAttendanceEvents(
    @Context() context: GraphqlContext,
  ): Promise<CurrentUserPendingOnlineAttendanceEvent[]> {
    const person = await this.currentUserContext.requireCurrentPerson(context);
    return this.attendanceRealtime.listPendingOnlineAttendanceEvents(person.id);
  }

  @Query(() => CurrentUserOrganizerInfo, {
    name: 'currentUserOrganizerInfo',
    nullable: true,
  })
  async currentUserOrganizerInfo(
    @Args('targetType', { type: () => String }) targetType: string,
    @Args('targetId', { type: () => String }) targetId: string,
    @Context() context: GraphqlContext,
  ): Promise<CurrentUserOrganizerInfo | null> {
    const authenticatedUser = this.currentUserContext.getAuthenticatedUser(context);
    const { person } = await this.currentUserContext.resolveCurrentUserContext(authenticatedUser);
    if (!person) {
      return null;
    }

    const events = await this.findLecturerEvents(person.id, targetType, targetId);
    if (events.length === 0) {
      return null;
    }

    const eventIds = events.map((event) => event.id);
    const [eventSubscriptionCounts, majorEventSelectionCounts, attendanceCounts] = await Promise.all([
      this.prisma.eventSubscription.groupBy({
        by: ['eventId'],
        where: {
          eventId: {
            in: eventIds,
          },
          deletedAt: null,
        },
        _count: {
          _all: true,
        },
      }),
      this.prisma.majorEventSubscriptionEventSelection.groupBy({
        by: ['eventId'],
        where: {
          eventId: {
            in: eventIds,
          },
          deletedAt: null,
          subscription: {
            deletedAt: null,
          },
        },
        _count: {
          _all: true,
        },
      }),
      this.prisma.eventAttendance.groupBy({
        by: ['eventId'],
        where: {
          eventId: {
            in: eventIds,
          },
        },
        _count: {
          _all: true,
        },
      }),
    ]);

    const subscriberCountByEventId = new Map(eventSubscriptionCounts.map((item) => [item.eventId, item._count._all]));
    for (const item of majorEventSelectionCounts) {
      subscriberCountByEventId.set(item.eventId, (subscriberCountByEventId.get(item.eventId) ?? 0) + item._count._all);
    }
    const attendanceCountByEventId = new Map(attendanceCounts.map((item) => [item.eventId, item._count._all]));

    return {
      targetType,
      targetId,
      title: this.resolveOrganizerTitle(targetType, events),
      events: events.map((event) => ({
        event: this.mapper.mapPublicEvent(event),
        subscriberCount: subscriberCountByEventId.get(event.id) ?? 0,
        attendanceCount: attendanceCountByEventId.get(event.id) ?? 0,
        onlineAttendanceCode: event.onlineAttendanceCode ?? undefined,
      })),
    };
  }

  private findLecturerEvents(personId: string, targetType: string, targetId: string) {
    const targetWhere = this.getOrganizerTargetWhere(targetType, targetId);
    if (!targetWhere) {
      throw new BadRequestException(`Unsupported organizer info target type ${targetType}.`);
    }

    return this.prisma.event.findMany({
      where: {
        ...targetWhere,
        deletedAt: null,
        lecturers: {
          some: {
            personId,
          },
        },
      },
      select: {
        ...PUBLIC_EVENT_SELECT,
        onlineAttendanceCode: true,
      },
      orderBy: {
        startDate: 'asc',
      },
    });
  }

  private getOrganizerTargetWhere(targetType: string, targetId: string) {
    switch (targetType) {
      case 'event':
        return { id: targetId };
      case 'event-group':
        return { eventGroupId: targetId };
      case 'major-event':
        return { majorEventId: targetId };
      default:
        return null;
    }
  }

  private resolveOrganizerTitle(
    targetType: string,
    events: Awaited<ReturnType<CurrentUserEventAttendanceResolver['findLecturerEvents']>>,
  ): string {
    const firstEvent = events[0];
    switch (targetType) {
      case 'event':
        return firstEvent.name;
      case 'event-group':
        return firstEvent.eventGroup?.name ?? firstEvent.name;
      case 'major-event':
        return firstEvent.majorEvent?.name ?? firstEvent.name;
      default:
        return firstEvent.name;
    }
  }
}
