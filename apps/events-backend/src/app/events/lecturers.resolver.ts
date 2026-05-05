import {
  DeletionResult,
  EventLecturer,
  EventLecturerCreateInput,
  EventLecturerUpdateInput,
} from '@cacic-eventos/shared-data-types';
import { NotFoundException } from '@nestjs/common';
import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Prisma } from '@prisma/client';
import { RequireScopes } from '../auth/decorators/require-scopes.decorator';
import { PrismaService } from '../prisma/prisma.service';

const MAJOR_EVENT_SELECT = {
  id: true,
  name: true,
  emoji: true,
  startDate: true,
  endDate: true,
  description: true,
  subscriptionStartDate: true,
  subscriptionEndDate: true,
  maxCoursesPerAttendee: true,
  maxLecturesPerAttendee: true,
  buttonText: true,
  buttonLink: true,
  contactInfo: true,
  contactType: true,
  isPaymentRequired: true,
  additionalPaymentInfo: true,
  deletedAt: true,
  createdAt: true,
  createdById: true,
  updatedAt: true,
  updatedById: true,
} satisfies Prisma.MajorEventSelect;

const EVENT_GROUP_SELECT = {
  id: true,
  name: true,
  shouldIssueCertificateForEachEvent: true,
  shouldIssuePartialCertificate: true,
  deletedAt: true,
  createdAt: true,
  createdById: true,
  updatedAt: true,
  updatedById: true,
} satisfies Prisma.EventGroupSelect;

const EVENT_RELATION_SELECT = {
  id: true,
  name: true,
  creditMinutes: true,
  startDate: true,
  endDate: true,
  type: true,
  emoji: true,
  description: true,
  shortDescription: true,
  latitude: true,
  longitude: true,
  locationDescription: true,
  majorEventId: true,
  majorEvent: {
    select: MAJOR_EVENT_SELECT,
  },
  eventGroupId: true,
  eventGroup: {
    select: EVENT_GROUP_SELECT,
  },
  allowSubscription: true,
  slots: true,
  shouldIssueCertificate: true,
  shouldCollectAttendance: true,
  isOnlineAttendanceAllowed: true,
  onlineAttendanceCode: true,
  onlineAttendanceStartDate: true,
  onlineAttendanceEndDate: true,
  publiclyVisible: true,
  youtubeCode: true,
  buttonText: true,
  buttonLink: true,
  deletedAt: true,
  createdAt: true,
  createdById: true,
  updatedAt: true,
  updatedById: true,
} satisfies Prisma.EventSelect;

@Resolver(() => EventLecturer)
export class EventLecturersResolver {
  constructor(private readonly prisma: PrismaService) {}

  @Query(() => [EventLecturer], { name: 'eventLecturers' })
  @RequireScopes('event-lecturer#read')
  eventLecturers(
    @Args('eventId', { type: () => String, nullable: true }) eventId?: string,
    @Args('personId', { type: () => String, nullable: true }) personId?: string,
    @Args('skip', { type: () => Int, nullable: true }) skip?: number,
    @Args('take', { type: () => Int, nullable: true }) take?: number,
  ) {
    const where: Prisma.EventLecturerWhereInput = {};

    if (eventId) {
      where.eventId = eventId;
    }

    if (personId) {
      where.personId = personId;
    }

    return this.prisma.eventLecturer.findMany({
      where,
      select: {
        eventId: true,
        personId: true,
        createdAt: true,
        createdById: true,
        person: true,
        event: {
          select: EVENT_RELATION_SELECT,
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      skip,
      take,
    });
  }

  @Query(() => EventLecturer, { name: 'eventLecturer' })
  @RequireScopes('event-lecturer#read')
  async eventLecturer(
    @Args('eventId', { type: () => String }) eventId: string,
    @Args('personId', { type: () => String }) personId: string,
  ) {
    const eventLecturer = await this.prisma.eventLecturer.findUnique({
      where: {
        eventId_personId: {
          eventId,
          personId,
        },
      },
      select: {
        eventId: true,
        personId: true,
        createdAt: true,
        createdById: true,
        person: true,
        event: {
          select: EVENT_RELATION_SELECT,
        },
      },
    });

    if (!eventLecturer) {
      throw new NotFoundException(
        `Event lecturer ${eventId}/${personId} was not found.`,
      );
    }

    return eventLecturer;
  }

  @Mutation(() => EventLecturer, { name: 'createEventLecturer' })
  @RequireScopes('event-lecturer#edit')
  createEventLecturer(
    @Args('input', { type: () => EventLecturerCreateInput })
    input: EventLecturerCreateInput,
  ) {
    return this.prisma.eventLecturer.create({
      data: input,
    });
  }

  @Mutation(() => EventLecturer, { name: 'updateEventLecturer' })
  @RequireScopes('event-lecturer#edit')
  async updateEventLecturer(
    @Args('eventId', { type: () => String }) eventId: string,
    @Args('personId', { type: () => String }) personId: string,
    @Args('input', { type: () => EventLecturerUpdateInput })
    input: EventLecturerUpdateInput,
  ) {
    const { count } = await this.prisma.eventLecturer.updateMany({
      where: {
        eventId,
        personId,
      },
      data: input,
    });

    if (count === 0) {
      throw new NotFoundException(
        `Event lecturer ${eventId}/${personId} was not found.`,
      );
    }

    return this.prisma.eventLecturer.findUnique({
      where: {
        eventId_personId: {
          eventId,
          personId,
        },
      },
      select: {
        eventId: true,
        personId: true,
        createdAt: true,
        createdById: true,
        person: true,
        event: {
          select: EVENT_RELATION_SELECT,
        },
      },
    });
  }

  @Mutation(() => DeletionResult, { name: 'deleteEventLecturer' })
  @RequireScopes('event-lecturer#delete')
  async deleteEventLecturer(
    @Args('eventId', { type: () => String }) eventId: string,
    @Args('personId', { type: () => String }) personId: string,
  ) {
    const { count } = await this.prisma.eventLecturer.deleteMany({
      where: {
        eventId,
        personId,
      },
    });

    if (count === 0) {
      throw new NotFoundException(
        `Event lecturer ${eventId}/${personId} was not found.`,
      );
    }

    return {
      deleted: true,
      eventId,
      personId,
    };
  }
}
