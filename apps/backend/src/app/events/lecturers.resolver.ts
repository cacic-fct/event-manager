import {
  DeletionResult,
  EventLecturer,
  EventLecturerCreateInput,
  EventLecturerUpdateInput,
} from '@cacic-fct/shared-data-types';
import { NotFoundException } from '@nestjs/common';
import { Args, Context, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Prisma } from '@prisma/client';
import { Permission } from '@cacic-fct/shared-permissions';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { AuthorizationPolicyService } from '../authorization/authorization-policy.service';
import { FrozenResourceService } from '../common/frozen-resource.service';
import { resolvePagination } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';

type GraphqlContext = {
  req?: { user?: AuthenticatedUser };
  request?: { user?: AuthenticatedUser };
};

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
  shouldIssueCertificateForNonPayingAttendees: true,
  shouldIssueCertificateForNonSubscribedAttendees: true,
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
  shouldIssueCertificateForNonPayingAttendees: true,
  shouldIssueCertificateForNonSubscribedAttendees: true,
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
  shouldIssueCertificateForNonPayingAttendees: true,
  shouldIssueCertificateForNonSubscribedAttendees: true,
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly frozenResources: FrozenResourceService,
    private readonly authorizationPolicy: AuthorizationPolicyService,
  ) {}

  @Query(() => [EventLecturer], { name: 'eventLecturers' })
  @RequirePermissions(Permission.EventLecturer.Read)
  eventLecturers(
    @Args('eventId', { type: () => String, nullable: true }) eventId?: string,
    @Args('personId', { type: () => String, nullable: true }) personId?: string,
    @Args('skip', { type: () => Int, nullable: true }) skip?: number,
    @Args('take', { type: () => Int, nullable: true }) take?: number,
  ) {
    const pagination = resolvePagination(skip, take);
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
      skip: pagination.skip,
      take: pagination.take,
    });
  }

  @Query(() => EventLecturer, { name: 'eventLecturer' })
  @RequirePermissions(Permission.EventLecturer.Read)
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
      throw new NotFoundException(`Event lecturer ${eventId}/${personId} was not found.`);
    }

    return eventLecturer;
  }

  @Mutation(() => EventLecturer, { name: 'createEventLecturer' })
  @RequirePermissions(Permission.EventLecturer.Create)
  async createEventLecturer(
    @Args('input', { type: () => EventLecturerCreateInput })
    input: EventLecturerCreateInput,
    @Context() context: GraphqlContext,
  ) {
    await this.frozenResources.assertEventMutable(input.eventId, this.getUser(context), 'edit');
    return this.prisma.eventLecturer.create({
      data: {
        eventId: input.eventId,
        personId: input.personId,
        createdById: this.getActorId(context),
      },
    });
  }

  @Mutation(() => EventLecturer, { name: 'updateEventLecturer' })
  @RequirePermissions(Permission.EventLecturer.Update)
  async updateEventLecturer(
    @Args('eventId', { type: () => String }) eventId: string,
    @Args('personId', { type: () => String }) personId: string,
    @Args('input', { type: () => EventLecturerUpdateInput })
    input: EventLecturerUpdateInput,
    @Context() context: GraphqlContext,
  ) {
    await this.frozenResources.assertEventMutable(eventId, this.getUser(context), 'edit');
    if (input.eventId && input.eventId !== eventId) {
      const user = this.getUser(context);
      await this.frozenResources.assertEventMutable(input.eventId, user, 'edit');
      await this.authorizationPolicy.assertPermissions(user, [Permission.EventLecturer.Update], {
        eventId: input.eventId,
      });
    }
    const nextEventId = input.eventId ?? eventId;
    const nextPersonId = input.personId ?? personId;
    const { count } = await this.prisma.eventLecturer.updateMany({
      where: {
        eventId,
        personId,
      },
      data: this.buildEventLecturerUpdateData(input),
    });

    if (count === 0) {
      throw new NotFoundException(`Event lecturer ${eventId}/${personId} was not found.`);
    }

    return this.prisma.eventLecturer.findUnique({
      where: {
        eventId_personId: {
          eventId: nextEventId,
          personId: nextPersonId,
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
  @RequirePermissions(Permission.EventLecturer.Delete)
  async deleteEventLecturer(
    @Args('eventId', { type: () => String }) eventId: string,
    @Args('personId', { type: () => String }) personId: string,
    @Context() context: GraphqlContext,
  ) {
    await this.frozenResources.assertEventMutable(eventId, this.getUser(context), 'delete');
    const { count } = await this.prisma.eventLecturer.deleteMany({
      where: {
        eventId,
        personId,
      },
    });

    if (count === 0) {
      throw new NotFoundException(`Event lecturer ${eventId}/${personId} was not found.`);
    }

    return {
      deleted: true,
      eventId,
      personId,
    };
  }

  private buildEventLecturerUpdateData(input: EventLecturerUpdateInput): Prisma.EventLecturerUncheckedUpdateManyInput {
    const data: Prisma.EventLecturerUncheckedUpdateManyInput = {};

    if (input.eventId !== undefined) data.eventId = input.eventId;
    if (input.personId !== undefined) data.personId = input.personId;

    return data;
  }

  private getActorId(context: GraphqlContext): string | undefined {
    return context.req?.user?.sub ?? context.request?.user?.sub ?? undefined;
  }

  private getUser(context: GraphqlContext): AuthenticatedUser | undefined {
    return context.req?.user ?? context.request?.user;
  }
}
