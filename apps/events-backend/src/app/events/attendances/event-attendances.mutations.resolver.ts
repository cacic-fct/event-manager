import {
  DeletionResult,
  EventAttendance,
  EventAttendanceCreateInput,
  EventAttendanceManualInput,
  EventAttendanceScannerCodeInput,
  EventAttendanceUpdateInput,
} from '@cacic-fct/shared-data-types';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Args, Context, Mutation, Resolver } from '@nestjs/graphql';
import { AttendanceCreationMethod, Prisma } from '@prisma/client';
import { RequireScopes } from '../../auth/decorators/require-scopes.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { AttendanceCategoryService } from '../attendance-category.service';
import { EventAttendancesResolverBase, EVENT_RELATION_SELECT, GraphqlContext } from './event-attendances.shared';

@Resolver(() => EventAttendance)
export class EventAttendancesMutationsResolver extends EventAttendancesResolverBase {
  constructor(prisma: PrismaService, attendanceCategories: AttendanceCategoryService) {
    super(prisma, attendanceCategories);
  }

  @Mutation(() => EventAttendance, { name: 'createEventAttendance' })
  @RequireScopes('event-attendance#edit')
  async createEventAttendance(
    @Args('input', { type: () => EventAttendanceCreateInput })
    input: EventAttendanceCreateInput,
    @Context() context: GraphqlContext,
  ) {
    const createdById = context.req?.user?.sub ?? context.request?.user?.sub ?? undefined;

    return this.prisma.$transaction(async (tx) => {
      await tx.eventAttendance.create({
        data: {
          ...input,
          createdById,
          createdByMethod: AttendanceCreationMethod.MANUAL_INPUT,
        },
      });
      await this.attendanceCategories.refreshForAttendance(input.personId, input.eventId, tx);
      return tx.eventAttendance.findUniqueOrThrow({
        where: {
          personId_eventId: {
            personId: input.personId,
            eventId: input.eventId,
          },
        },
        select: {
          personId: true,
          eventId: true,
          attendedAt: true,
          createdAt: true,
          createdById: true,
          createdByMethod: true,
          category: true,
        },
      });
    });
  }

  @Mutation(() => EventAttendance, {
    name: 'createEventAttendanceFromAztecCode',
  })
  @RequireScopes('event-attendance#edit')
  async createEventAttendanceFromAztecCode(
    @Args('eventId', { type: () => String }) eventId: string,
    @Args('code', { type: () => String }) code: string,
    @Context() context: GraphqlContext,
  ) {
    const userId = this.parseUserAztecCode(code);
    if (!userId) {
      throw new BadRequestException('Código Aztec incompatível.');
    }

    const event = await this.prisma.event.findFirst({
      where: {
        id: eventId,
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });
    if (!event) {
      throw new NotFoundException(`Event ${eventId} was not found.`);
    }

    const person = await this.prisma.people.findFirst({
      where: {
        userId,
        deletedAt: null,
        mergedIntoId: null,
      },
      select: {
        id: true,
      },
    });
    if (!person) {
      throw new NotFoundException(`Person for user ${userId} was not found.`);
    }

    const createdById = context.req?.user?.sub ?? context.request?.user?.sub ?? undefined;

    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.eventAttendance.create({
          data: {
            eventId,
            personId: person.id,
            createdById,
            createdByMethod: AttendanceCreationMethod.SCANNER,
          },
        });
        await this.attendanceCategories.refreshForAttendance(person.id, eventId, tx);
        return tx.eventAttendance.findUniqueOrThrow({
          where: {
            personId_eventId: {
              personId: person.id,
              eventId,
            },
          },
          select: {
            personId: true,
            eventId: true,
            attendedAt: true,
            createdAt: true,
            createdById: true,
            createdByMethod: true,
            category: true,
          },
        });
      });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Presença já registrada para este evento.');
      }

      throw error;
    }
  }

  @Mutation(() => EventAttendance, {
    name: 'createEventAttendanceFromScannerCode',
  })
  @RequireScopes('event-attendance#edit')
  async createEventAttendanceFromScannerCode(
    @Args('input', { type: () => EventAttendanceScannerCodeInput })
    input: EventAttendanceScannerCodeInput,
    @Context() context: GraphqlContext,
  ) {
    const userId = this.parseUserAztecCode(input.code);
    if (!userId) {
      throw new BadRequestException('Código Aztec incompatível.');
    }

    const person = await this.prisma.people.findFirst({
      where: {
        userId,
        deletedAt: null,
        mergedIntoId: null,
      },
      select: {
        id: true,
      },
    });
    if (!person) {
      throw new NotFoundException(`Person for user ${userId} was not found.`);
    }

    return this.createAttendanceWithMetadata({
      eventId: input.eventId,
      personId: person.id,
      createdByMethod: AttendanceCreationMethod.SCANNER,
      createdById: this.getActorId(context),
      location: input.location,
    });
  }

  @Mutation(() => EventAttendance, {
    name: 'createEventAttendanceFromManualInput',
  })
  @RequireScopes('event-attendance#edit')
  async createEventAttendanceFromManualInput(
    @Args('input', { type: () => EventAttendanceManualInput })
    input: EventAttendanceManualInput,
    @Context() context: GraphqlContext,
  ) {
    const person = await this.findSinglePersonForManualInput(input.value);
    return this.createAttendanceWithMetadata({
      eventId: input.eventId,
      personId: person.id,
      createdByMethod: AttendanceCreationMethod.MANUAL_INPUT,
      createdById: this.getActorId(context),
      location: input.location,
    });
  }


  @Mutation(() => EventAttendance, { name: 'updateEventAttendance' })
  @RequireScopes('event-attendance#edit')
  async updateEventAttendance(
    @Args('personId', { type: () => String }) personId: string,
    @Args('eventId', { type: () => String }) eventId: string,
    @Args('input', { type: () => EventAttendanceUpdateInput })
    input: EventAttendanceUpdateInput,
  ) {
    const { count } = await this.prisma.$transaction(async (tx) => {
      const result = await tx.eventAttendance.updateMany({
        where: {
          personId,
          eventId,
        },
        data: input,
      });

      await this.attendanceCategories.refreshForAttendance(personId, eventId, tx);

      return result;
    });

    if (count === 0) {
      throw new NotFoundException(`Attendance ${personId}/${eventId} was not found.`);
    }

    return this.prisma.eventAttendance.findUnique({
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
        createdByMethod: true,
        category: true,
        person: true,
        event: {
          select: EVENT_RELATION_SELECT,
        },
      },
    });
  }

  @Mutation(() => DeletionResult, { name: 'deleteEventAttendance' })
  @RequireScopes('event-attendance#delete')
  async deleteEventAttendance(
    @Args('personId', { type: () => String }) personId: string,
    @Args('eventId', { type: () => String }) eventId: string,
  ) {
    const { count } = await this.prisma.eventAttendance.deleteMany({
      where: {
        personId,
        eventId,
      },
    });

    if (count === 0) {
      throw new NotFoundException(`Attendance ${personId}/${eventId} was not found.`);
    }

    return {
      deleted: true,
      personId,
      eventId,
    };
  }
}
