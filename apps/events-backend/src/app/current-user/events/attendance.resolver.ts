import { BadRequestException, ConflictException } from '@nestjs/common';
import { Args, Context, Mutation, Query, Resolver } from '@nestjs/graphql';
import { AttendanceCreationMethod } from '@prisma/client';
import {
  ConfirmCurrentUserOnlineAttendanceInput,
  CurrentUserEventAttendance,
  CurrentUserPendingOnlineAttendanceEvent,
} from '../models';
import { CurrentUserContextService } from '../context.service';
import { CurrentUserEventMapperService } from '../mapper.service';
import {
  CURRENT_USER_EVENT_ATTENDANCE_SELECT,
  GraphqlContext,
} from '../selects';
import { PrismaService } from '../../prisma/prisma.service';
import { AttendanceCategoryService } from '../../events/attendance-category.service';
import { CurrentUserOnlineAttendanceRealtimeService } from './attendance-realtime.service';

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
  async currentUserEventAttendances(
    @Context() context: GraphqlContext,
  ): Promise<CurrentUserEventAttendance[]> {
    const authenticatedUser =
      this.currentUserContext.getAuthenticatedUser(context);
    const { person } =
      await this.currentUserContext.resolveCurrentUserContext(
        authenticatedUser,
      );
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

    return attendances.map((attendance) =>
      this.mapper.mapCurrentUserEventAttendance(attendance),
    );
  }

  @Query(() => CurrentUserEventAttendance, {
    name: 'currentUserEventAttendance',
    nullable: true,
  })
  async currentUserEventAttendance(
    @Args('eventId', { type: () => String }) eventId: string,
    @Context() context: GraphqlContext,
  ): Promise<CurrentUserEventAttendance | null> {
    const authenticatedUser =
      this.currentUserContext.getAuthenticatedUser(context);
    const { person } =
      await this.currentUserContext.resolveCurrentUserContext(
        authenticatedUser,
      );
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
      throw new BadRequestException(
        `Event ${input.eventId} does not allow online attendance confirmation.`,
      );
    }

    if (!event.onlineAttendanceCode) {
      throw new BadRequestException(
        `Event ${input.eventId} does not have an online attendance code configured.`,
      );
    }

    if (event.onlineAttendanceCode.trim() !== normalizedCode) {
      throw new BadRequestException('Invalid attendance code.');
    }

    const now = new Date();
    if (
      event.onlineAttendanceStartDate &&
      now < event.onlineAttendanceStartDate
    ) {
      throw new BadRequestException(
        `Online attendance for event ${input.eventId} is not open yet.`,
      );
    }

    if (event.onlineAttendanceEndDate && now > event.onlineAttendanceEndDate) {
      throw new BadRequestException(
        `Online attendance for event ${input.eventId} is already closed.`,
      );
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
      throw new ConflictException(
        `Attendance is already confirmed for event ${input.eventId}.`,
      );
    }

    const createdAttendance = await this.prisma.$transaction(async (tx) => {
      await tx.eventAttendance.create({
        data: {
          personId: person.id,
          eventId: event.id,
          createdByMethod: AttendanceCreationMethod.ONLINE_CODE,
        },
      });
      await this.attendanceCategories.refreshForAttendance(
        person.id,
        event.id,
        tx,
      );
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
}
