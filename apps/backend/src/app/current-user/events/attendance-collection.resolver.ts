import {
  EventAttendance,
  EventAttendanceManualInput,
  EventAttendanceScannerCodeInput,
  EventAttendanceScannerFeedItem,
} from '@cacic-fct/shared-data-types';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Args, Context, Mutation, Query, Resolver } from '@nestjs/graphql';
import { AttendanceCreationMethod, Prisma } from '@prisma/client';
import { CurrentUserAttendanceCollectionEvent } from '../models';
import { CurrentUserContextService } from '../context.service';
import { GraphqlContext } from '../selects';
import { PrismaService } from '../../prisma/prisma.service';
import { PUBLIC_EVENT_SELECT } from '../../public-events/models';
import { AttendanceCategoryService } from '../../events/attendance-category.service';
import { FrozenResourceService } from '../../common/frozen-resource.service';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';

const MAX_LOCATION_ACCURACY_METERS = 200;

@Resolver(() => CurrentUserAttendanceCollectionEvent)
export class CurrentUserAttendanceCollectionResolver {
  constructor(
    private readonly prisma: PrismaService,
    private readonly currentUserContext: CurrentUserContextService,
    private readonly attendanceCategories: AttendanceCategoryService,
    private readonly frozenResources: FrozenResourceService = {
      assertEventMutable: async () => undefined,
    } as unknown as FrozenResourceService,
  ) {}

  @Query(() => [CurrentUserAttendanceCollectionEvent], {
    name: 'currentUserAttendanceCollectionEvents',
  })
  async currentUserAttendanceCollectionEvents(
    @Context() context: GraphqlContext,
  ): Promise<CurrentUserAttendanceCollectionEvent[]> {
    const person = await this.currentUserContext.requireCurrentPerson(context);
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const visibleFrom = new Date(startOfToday.getTime() - 6 * 60 * 60_000);
    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);

    const collectors = await this.prisma.eventAttendanceCollector.findMany({
      where: {
        personId: person.id,
        event: {
          deletedAt: null,
          publiclyVisible: true,
          shouldCollectAttendance: true,
          startDate: {
            gte: visibleFrom,
            lte: endOfToday,
          },
        },
      },
      select: {
        eventId: true,
        event: {
          select: PUBLIC_EVENT_SELECT,
        },
      },
      orderBy: {
        event: {
          startDate: 'asc',
        },
      },
    });

    return collectors.map((collector) => ({
      eventId: collector.eventId,
      event: collector.event,
    }));
  }

  @Query(() => [EventAttendanceScannerFeedItem], { name: 'currentUserAttendanceCollectionFeed' })
  async currentUserAttendanceCollectionFeed(
    @Args('eventId', { type: () => String }) eventId: string,
    @Context() context: GraphqlContext,
  ): Promise<EventAttendanceScannerFeedItem[]> {
    await this.requireCollector(eventId, context, true);
    return this.getScannerFeed(eventId);
  }

  @Mutation(() => EventAttendance, { name: 'collectCurrentUserAttendanceFromScannerCode' })
  async collectCurrentUserAttendanceFromScannerCode(
    @Args('input', { type: () => EventAttendanceScannerCodeInput })
    input: EventAttendanceScannerCodeInput,
    @Context() context: GraphqlContext,
  ) {
    const authenticatedUser = this.getAuthenticatedUser(context);
    await this.frozenResources.assertEventMutable(input.eventId, authenticatedUser, 'edit');
    const collector = await this.requireCollector(input.eventId, context, true);
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

    return this.createAttendance({
      eventId: input.eventId,
      personId: person.id,
      createdByMethod: AttendanceCreationMethod.SCANNER,
      createdById: this.getActorId(context) ?? collector.userId ?? undefined,
      location: input.location,
    });
  }

  @Mutation(() => EventAttendance, { name: 'collectCurrentUserManualAttendance' })
  async collectCurrentUserManualAttendance(
    @Args('input', { type: () => EventAttendanceManualInput })
    input: EventAttendanceManualInput,
    @Context() context: GraphqlContext,
  ) {
    const authenticatedUser = this.getAuthenticatedUser(context);
    await this.frozenResources.assertEventMutable(input.eventId, authenticatedUser, 'edit');
    const collector = await this.requireCollector(input.eventId, context, true);
    const person = await this.findSinglePersonForManualInput(input.value);
    return this.createAttendance({
      eventId: input.eventId,
      personId: person.id,
      createdByMethod: AttendanceCreationMethod.MANUAL_INPUT,
      createdById: this.getActorId(context) ?? collector.userId ?? undefined,
      location: input.location,
    });
  }

  private async requireCollector(eventId: string, context: GraphqlContext, enforceCollectionWindow: boolean) {
    const collectorPerson = await this.currentUserContext.requireCurrentPerson(context);
    const collector = await this.prisma.eventAttendanceCollector.findUnique({
      where: {
        eventId_personId: {
          eventId,
          personId: collectorPerson.id,
        },
      },
      select: {
        event: {
          select: {
            startDate: true,
            endDate: true,
            deletedAt: true,
            publiclyVisible: true,
            shouldCollectAttendance: true,
          },
        },
      },
    });

    if (
      !collector ||
      collector.event.deletedAt ||
      !collector.event.publiclyVisible ||
      !collector.event.shouldCollectAttendance
    ) {
      throw new ForbiddenException('Você não pode coletar presença para este evento.');
    }

    if (enforceCollectionWindow && !this.isCollectionOpen(collector.event.startDate, collector.event.endDate)) {
      throw new ForbiddenException('A coleta de presença não está aberta para este evento.');
    }

    return collectorPerson;
  }

  private getAuthenticatedUser(context: GraphqlContext): AuthenticatedUser | undefined {
    return (
      this.currentUserContext.getAuthenticatedUser?.(context) ??
      context.req?.user ??
      context.request?.user
    );
  }

  private isCollectionOpen(startDate: Date, endDate: Date): boolean {
    const now = Date.now();
    return now >= startDate.getTime() - 3 * 60 * 60_000 && now <= endDate.getTime() + 6 * 60 * 60_000;
  }

  private async getScannerFeed(eventId: string): Promise<EventAttendanceScannerFeedItem[]> {
    const attendances = await this.prisma.eventAttendance.findMany({
      where: {
        eventId,
      },
      select: {
        personId: true,
        eventId: true,
        attendedAt: true,
        createdById: true,
        createdByMethod: true,
        person: {
          select: {
            name: true,
            user: {
              select: {
                unespRole: true,
              },
            },
          },
        },
        event: {
          select: {
            allowSubscription: true,
            majorEventId: true,
          },
        },
      },
      orderBy: {
        attendedAt: 'desc',
      },
      take: 80,
    });

    const majorEventId = attendances.find((attendance) => attendance.event.majorEventId)?.event.majorEventId;
    const personIds = attendances.map((attendance) => attendance.personId);
    const collectorIds = [
      ...new Set(attendances.map((attendance) => attendance.createdById).filter((id): id is string => Boolean(id))),
    ];

    const standaloneEventIds = [
      ...new Set(
        attendances
          .filter((attendance) => attendance.event.allowSubscription && !attendance.event.majorEventId)
          .map((attendance) => attendance.eventId),
      ),
    ];

    const [majorEventSubscriptions, standaloneEventSubscriptions, collectors] = await Promise.all([
      majorEventId
        ? this.prisma.majorEventSubscription.findMany({
            where: {
              majorEventId,
              personId: {
                in: personIds,
              },
              deletedAt: null,
            },
            select: {
              personId: true,
              subscriptionStatus: true,
            },
          })
        : Promise.resolve([]),
      standaloneEventIds.length
        ? this.prisma.eventSubscription.findMany({
            where: {
              eventId: {
                in: standaloneEventIds,
              },
              personId: {
                in: personIds,
              },
              deletedAt: null,
            },
            select: {
              eventId: true,
              personId: true,
            },
          })
        : Promise.resolve([]),
      collectorIds.length
        ? this.prisma.user.findMany({
            where: {
              id: {
                in: collectorIds,
              },
            },
            select: {
              id: true,
              name: true,
            },
          })
        : Promise.resolve([]),
    ]);

    const majorEventSubscriptionStatusByPersonId = new Map(
      majorEventSubscriptions.map((subscription) => [subscription.personId, subscription.subscriptionStatus]),
    );
    const standaloneEventSubscriptionKeys = new Set(
      standaloneEventSubscriptions.map((subscription) => `${subscription.personId}:${subscription.eventId}`),
    );
    const collectorFirstNameById = new Map(
      collectors.map((collector) => [collector.id, this.getFirstName(collector.name)]),
    );

    return attendances.map((attendance) => ({
      personId: attendance.personId,
      eventId: attendance.eventId,
      fullName: attendance.person?.name ?? undefined,
      unespRole: this.formatUnespRole(attendance.person?.user?.unespRole),
      subscriptionStatus:
        majorEventSubscriptionStatusByPersonId.get(attendance.personId) ??
        (standaloneEventSubscriptionKeys.has(`${attendance.personId}:${attendance.eventId}`) ? 'CONFIRMED' : undefined),
      attendedAt: attendance.attendedAt,
      createdByMethod: attendance.createdByMethod,
      collectedByFirstName: attendance.createdById
        ? (collectorFirstNameById.get(attendance.createdById) ?? undefined)
        : undefined,
    }));
  }

  private formatUnespRole(role: readonly string[] | null | undefined): string | undefined {
    return role?.length ? role.join(', ') : undefined;
  }

  private async createAttendance(input: {
    eventId: string;
    personId: string;
    createdByMethod: AttendanceCreationMethod;
    createdById?: string;
    location?: { latitude: number; longitude: number; accuracyMeters: number };
  }) {
    const locationData = this.getRequiredLocationData(input.location);

    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.eventAttendance.create({
          data: {
            eventId: input.eventId,
            personId: input.personId,
            createdById: input.createdById,
            createdByMethod: input.createdByMethod,
            ...locationData,
          },
        });
        await this.attendanceCategories.refreshForAttendance(input.personId, input.eventId, tx);
        return tx.eventAttendance.findUniqueOrThrow({
          where: {
            personId_eventId: {
              eventId: input.eventId,
              personId: input.personId,
            },
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

  private async findSinglePersonForManualInput(rawValue: string): Promise<{ id: string }> {
    const value = rawValue.trim();
    if (!value) {
      throw new BadRequestException('Informe e-mail, telefone ou documento.');
    }

    const digits = value.replace(/\D/g, '');
    const phoneCandidates = this.getBrazilianPhoneCandidates(digits);
    const where: Prisma.PeopleWhereInput[] = [
      {
        email: {
          equals: value,
          mode: 'insensitive',
        },
      },
      {
        secondaryEmails: {
          has: value.toLowerCase(),
        },
      },
    ];

    if (digits) {
      where.push({
        identityDocument: {
          in: [value, digits],
        },
      });
    }

    if (phoneCandidates.length > 0) {
      where.push({
        phone: {
          in: phoneCandidates,
        },
      });
    }

    const people = await this.prisma.people.findMany({
      where: {
        deletedAt: null,
        OR: where,
      },
      select: {
        id: true,
        mergedIntoId: true,
      },
      take: 3,
    });

    const activePeople = people.filter((person) => !person.mergedIntoId);
    if (activePeople.length > 1) {
      throw new ConflictException(
        `Pessoa tem registros duplicados no banco de dados com o dado ${value}. Tire uma captura dessa tela e envie para o administrador do sistema, para correção.`,
      );
    }

    const person = activePeople[0] ?? people[0];
    if (!person) {
      throw new NotFoundException('Nenhuma pessoa encontrada para o dado informado.');
    }

    return { id: person.mergedIntoId ?? person.id };
  }

  private getRequiredLocationData(
    location: { latitude: number; longitude: number; accuracyMeters: number } | undefined,
  ) {
    if (
      location?.latitude == null ||
      location.longitude == null ||
      location.accuracyMeters == null ||
      !Number.isFinite(location.latitude) ||
      !Number.isFinite(location.longitude) ||
      !Number.isFinite(location.accuracyMeters)
    ) {
      throw new BadRequestException('Localização precisa é obrigatória para registrar presença.');
    }

    if (location.accuracyMeters > MAX_LOCATION_ACCURACY_METERS) {
      throw new BadRequestException('Ative a localização precisa para registrar presença.');
    }

    return {
      collectedLatitude: location.latitude,
      collectedLongitude: location.longitude,
      collectedAccuracyMeters: location.accuracyMeters,
    };
  }

  private getBrazilianPhoneCandidates(digits: string): string[] {
    if (!digits) {
      return [];
    }

    const withoutCountry = digits.startsWith('55') && digits.length > 11 ? digits.slice(2) : digits;
    const withCountry = withoutCountry.length >= 10 ? `55${withoutCountry}` : digits;
    return [...new Set([digits, withoutCountry, withCountry, `+${withCountry}`])];
  }

  private parseUserAztecCode(code: string): string | null {
    const [kind, userId, ...extraParts] = code.trim().split(':');
    if (kind !== 'user' || !userId || extraParts.length > 0) {
      return null;
    }

    return userId;
  }

  private getActorId(context: GraphqlContext): string | undefined {
    return context.req?.user?.sub ?? context.request?.user?.sub ?? undefined;
  }

  private getFirstName(name: string): string {
    return name.trim().split(/\s+/)[0] || name;
  }
}
