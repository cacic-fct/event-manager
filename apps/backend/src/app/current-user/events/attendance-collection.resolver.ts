import {
  CommitOfflineEventAttendancesInput,
  EventAttendance,
  EventAttendanceManualInput,
  EventAttendanceScannerCodeInput,
  EventAttendanceScannerFeedItem,
  OfflineEventAttendanceCommitResult,
  OfflineEventAttendanceSubmission,
} from '@cacic-fct/shared-data-types';
import { Permission } from '@cacic-fct/shared-permissions';
import { BadRequestException, ConflictException, ForbiddenException, HttpException, NotFoundException } from '@nestjs/common';
import { Args, Context, Mutation, Query, Resolver } from '@nestjs/graphql';
import { AttendanceCreationMethod, AuditLogEntityType, AuditLogOperation, Prisma } from '@prisma/client';
import { CurrentUserAttendanceCollectionEvent } from '../models';
import { CurrentUserContextService } from '../context.service';
import { GraphqlContext } from '../selects';
import { PrismaService } from '../../prisma/prisma.service';
import { PUBLIC_EVENT_SELECT } from '../../public-events/models';
import { AttendanceCategoryService } from '../../events/attendance-category.service';
import { FrozenResourceService } from '../../common/frozen-resource.service';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { AuthorizationPolicyService } from '../../authorization/authorization-policy.service';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { DashboardInsightsService } from '../../dashboard/insights.service';

const MAX_LOCATION_ACCURACY_METERS = 200;
const MAX_OFFLINE_ATTENDANCE_COMMIT_BATCH_SIZE = 150;

@Resolver(() => CurrentUserAttendanceCollectionEvent)
export class CurrentUserAttendanceCollectionResolver {
  constructor(
    private readonly prisma: PrismaService,
    private readonly currentUserContext: CurrentUserContextService,
    private readonly attendanceCategories: AttendanceCategoryService,
    private readonly frozenResources: FrozenResourceService = {
      assertEventMutable: async () => undefined,
    } as unknown as FrozenResourceService,
    private readonly authorizationPolicy: AuthorizationPolicyService = {
      assertAttendanceCollectorForEvent: async () => undefined,
      assertPermissions: async () => undefined,
    } as unknown as AuthorizationPolicyService,
    private readonly auditLog: AuditLogService = {
      record: async () => undefined,
      buildCompositeEntityId: (parts: readonly string[]) => parts.join(':'),
    } as unknown as AuditLogService,
    private readonly dashboardInsights: DashboardInsightsService = {
      invalidateCachedInsights: async () => undefined,
    } as unknown as DashboardInsightsService,
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
    const collector = await this.requireCollector(input.eventId, context, true);
    const authenticatedUser = this.getAuthenticatedUser(context);
    await this.frozenResources.assertEventMutable(input.eventId, authenticatedUser, 'edit');
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

    return this.createAttendance(
      {
        eventId: input.eventId,
        personId: person.id,
        createdByMethod: AttendanceCreationMethod.SCANNER,
        createdById: this.getActorId(context) ?? collector.userId ?? undefined,
        committedById: this.getActorId(context) ?? collector.userId ?? undefined,
        location: input.location,
      },
      (attendance, tx) =>
        this.recordAttendanceCreate(attendance, context, 'Presença registrada pelo coletor via scanner.', tx),
    );
  }

  @Mutation(() => EventAttendance, { name: 'collectCurrentUserManualAttendance' })
  async collectCurrentUserManualAttendance(
    @Args('input', { type: () => EventAttendanceManualInput })
    input: EventAttendanceManualInput,
    @Context() context: GraphqlContext,
  ) {
    const collector = await this.requireCollector(input.eventId, context, true);
    const authenticatedUser = this.getAuthenticatedUser(context);
    await this.frozenResources.assertEventMutable(input.eventId, authenticatedUser, 'edit');
    const person = await this.findSinglePersonForManualInput(input.value);
    return this.createAttendance(
      {
        eventId: input.eventId,
        personId: person.id,
        createdByMethod: AttendanceCreationMethod.MANUAL_INPUT,
        createdById: this.getActorId(context) ?? collector.userId ?? undefined,
        committedById: this.getActorId(context) ?? collector.userId ?? undefined,
        location: input.location,
      },
      (attendance, tx) =>
        this.recordAttendanceCreate(attendance, context, 'Presença registrada pelo coletor manualmente.', tx),
    );
  }

  @Mutation(() => [OfflineEventAttendanceCommitResult], { name: 'commitCurrentUserOfflineAttendances' })
  async commitCurrentUserOfflineAttendances(
    @Args('input', { type: () => CommitOfflineEventAttendancesInput })
    input: CommitOfflineEventAttendancesInput,
    @Context() context: GraphqlContext,
  ): Promise<OfflineEventAttendanceCommitResult[]> {
    if (input.attendances.length > MAX_OFFLINE_ATTENDANCE_COMMIT_BATCH_SIZE) {
      throw new BadRequestException(
        `Envie no máximo ${MAX_OFFLINE_ATTENDANCE_COMMIT_BATCH_SIZE} presenças off-line por sincronização.`,
      );
    }

    const results: OfflineEventAttendanceCommitResult[] = [];
    for (const item of input.attendances) {
      results.push(await this.commitOfflineAttendance(item, context));
    }

    return results;
  }

  private async requireCollector(eventId: string, context: GraphqlContext, enforceCollectionWindow: boolean) {
    const collectorPerson = await this.currentUserContext.requireCurrentPerson(context);
    await this.authorizationPolicy.assertAttendanceCollectorForEvent(eventId, collectorPerson.id, {
      enforceCollectionWindow,
    });

    return collectorPerson;
  }

  private getAuthenticatedUser(context: GraphqlContext): AuthenticatedUser | undefined {
    return (
      this.currentUserContext.getAuthenticatedUser?.(context) ??
      context.req?.user ??
      context.request?.user
    );
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
        committedById: true,
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
      ...new Set(
        attendances
          .flatMap((attendance) => [attendance.createdById, attendance.committedById])
          .filter((id): id is string => Boolean(id)),
      ),
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
      committedByFirstName:
        attendance.committedById && attendance.committedById !== attendance.createdById
          ? (collectorFirstNameById.get(attendance.committedById) ?? undefined)
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
    committedById?: string;
    attendedAt?: Date;
    location?: { latitude: number; longitude: number; accuracyMeters: number };
  }, afterCreate?: (attendance: { personId: string; eventId: string }, tx: Prisma.TransactionClient) => Promise<void>) {
    const locationData = this.getRequiredLocationData(input.location);

    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.eventAttendance.create({
          data: {
            eventId: input.eventId,
            personId: input.personId,
            attendedAt: input.attendedAt,
            createdById: input.createdById,
            committedById: input.committedById,
            createdByMethod: input.createdByMethod,
            ...locationData,
          },
        });
        await this.attendanceCategories.refreshForAttendance(input.personId, input.eventId, tx);
        const attendance = await tx.eventAttendance.findUniqueOrThrow({
          where: {
            personId_eventId: {
              eventId: input.eventId,
              personId: input.personId,
            },
          },
        });
        await afterCreate?.(attendance, tx);
        return attendance;
      });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Presença já registrada para este evento.');
      }

      throw error;
    }
  }

  private async recordAttendanceCreate(
    attendance: {
      personId: string;
      eventId: string;
    },
    context: GraphqlContext,
    summary: string,
    prisma: PrismaService | Prisma.TransactionClient = this.prisma,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    await this.auditLog.record({
      entityType: AuditLogEntityType.EVENT_ATTENDANCE,
      entityId: this.auditLog.buildCompositeEntityId([attendance.personId, attendance.eventId]),
      entityLabel: attendance.personId,
      operation: AuditLogOperation.USER_CREATE,
      actor: this.getAuthenticatedUser(context),
      after: attendance,
      scope: {
        permission: Permission.EventAttendance.Collect,
        eventId: attendance.eventId,
      },
      summary,
      metadata,
    }, prisma);
  }

  private async commitOfflineAttendance(
    item: CommitOfflineEventAttendancesInput['attendances'][number],
    context: GraphqlContext,
  ): Promise<OfflineEventAttendanceCommitResult> {
    const sender = await this.currentUserContext.requireCurrentPerson(context);
    const submittedById = this.getActorId(context) ?? sender.userId;
    if (!submittedById) {
      throw new BadRequestException('Usuário autenticado sem identificador de conta.');
    }
    const createdById = this.normalizeOptionalString(item.authorUserId) ?? submittedById;
    const canCommitWithPermission = await this.canCommitOfflineAttendanceWithPermission(item.eventId, context);

    try {
      if (!canCommitWithPermission) {
        await this.authorizationPolicy.assertAttendanceCollectorForEvent(item.eventId, sender.id, {
          enforceCollectionWindow: true,
        });
      }
      const authenticatedUser = this.getAuthenticatedUser(context);
      await this.frozenResources.assertEventMutable(item.eventId, authenticatedUser, 'edit');

      const person = await this.resolveOfflineAttendancePerson(item);
      const attendance = await this.createAttendance(
        {
          eventId: item.eventId,
          personId: person.id,
          createdByMethod: item.createdByMethod,
          createdById,
          committedById: submittedById,
          attendedAt: item.collectedAt,
          location: item.location,
        },
        (attendance, tx) =>
          this.recordAttendanceCreate(
            attendance,
            context,
            'Presença coletada off-line e sincronizada depois.',
            tx,
            {
              offlineClientId: item.clientId,
              offlineAttendanceAuthor: {
                userId: createdById ?? null,
                name: this.normalizeOptionalString(item.authorName) ?? null,
                email: this.normalizeOptionalString(item.authorEmail) ?? null,
              },
              submittedById,
              committedById: submittedById,
            },
          ),
      );

      return {
        clientId: item.clientId,
        eventId: item.eventId,
        status: 'CREATED',
        attendance: this.toEventAttendance(attendance),
      };
    } catch (error: unknown) {
      if (
        !canCommitWithPermission &&
        await this.shouldStageOfflineAttendance(item.eventId, sender.id, error)
      ) {
        const stagedSubmission = await this.stageOfflineAttendance(item, context, {
          createdById,
          submittedById,
          stagedReason: this.errorMessage(error),
        });

        return {
          clientId: item.clientId,
          eventId: item.eventId,
          status: 'STAGED',
          message: 'Presença off-line enviada para revisão administrativa.',
          stagedSubmission,
        };
      }

      return {
        clientId: item.clientId,
        eventId: item.eventId,
        status: this.commitStatusForError(error),
        message: this.errorMessage(error),
      };
    }
  }

  private async canCommitOfflineAttendanceWithPermission(eventId: string, context: GraphqlContext): Promise<boolean> {
    const user = this.getAuthenticatedUser(context);
    if (!user) {
      return false;
    }

    try {
      await this.authorizationPolicy.assertPermissions(user, [Permission.EventAttendance.Collect], {
        eventId,
      });
      return true;
    } catch (error: unknown) {
      if (error instanceof ForbiddenException) {
        return false;
      }

      throw error;
    }
  }

  private async shouldStageOfflineAttendance(
    eventId: string,
    senderPersonId: string,
    error: unknown,
  ): Promise<boolean> {
    if (!(error instanceof HttpException)) {
      return false;
    }

    if (error instanceof ConflictException && this.errorMessage(error).includes('Presença já registrada')) {
      return false;
    }

    if (![400, 403, 404].includes(error.getStatus())) {
      return false;
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
      return false;
    }

    try {
      await this.authorizationPolicy.assertAttendanceCollectorForEvent(eventId, senderPersonId, {
        enforceCollectionWindow: false,
      });
      return true;
    } catch {
      return false;
    }
  }

  private async stageOfflineAttendance(
    item: CommitOfflineEventAttendancesInput['attendances'][number],
    context: GraphqlContext,
    metadata: {
      createdById: string;
      submittedById: string;
      stagedReason: string;
    },
  ) {
    const resolvedPerson = await this.tryResolveOfflineAttendancePerson(item);
    const locationData = this.getRequiredLocationData(item.location);
    const submission = await this.prisma.offlineEventAttendanceSubmission.upsert({
      where: {
        submittedById_clientId: {
          submittedById: metadata.submittedById,
          clientId: item.clientId,
        },
      },
      create: {
        clientId: item.clientId,
        eventId: item.eventId,
        personId: resolvedPerson.personId,
        createdByMethod: item.createdByMethod,
        scannerCode: this.normalizeOptionalString(item.code),
        manualValue: this.normalizeOptionalString(item.value),
        collectedAt: item.collectedAt,
        authorUserId: metadata.createdById,
        authorName: this.normalizeOptionalString(item.authorName),
        authorEmail: this.normalizeOptionalString(item.authorEmail),
        submittedById: metadata.submittedById,
        stagedReason: metadata.stagedReason,
        resolutionError: resolvedPerson.errorMessage,
        ...locationData,
      },
      update: {
        stagedReason: metadata.stagedReason,
        resolutionError: resolvedPerson.errorMessage,
        personId: resolvedPerson.personId,
        scannerCode: this.normalizeOptionalString(item.code),
        manualValue: this.normalizeOptionalString(item.value),
        collectedLatitude: locationData.collectedLatitude,
        collectedLongitude: locationData.collectedLongitude,
        collectedAccuracyMeters: locationData.collectedAccuracyMeters,
      },
      include: {
        event: true,
        person: true,
      },
    });

    await this.auditLog.record({
      entityType: AuditLogEntityType.EVENT_ATTENDANCE,
      entityId: submission.personId
        ? this.auditLog.buildCompositeEntityId([submission.personId, submission.eventId])
        : `offline:${submission.id}`,
      entityLabel: submission.person?.name ?? submission.manualValue ?? submission.scannerCode ?? submission.id,
      operation: AuditLogOperation.CREATE,
      actor: this.getAuthenticatedUser(context),
      after: {
        id: submission.id,
        clientId: submission.clientId,
        eventId: submission.eventId,
        personId: submission.personId,
        authorUserId: submission.authorUserId,
        submittedById: submission.submittedById,
        stagedReason: submission.stagedReason,
        resolutionError: submission.resolutionError,
      },
      scope: {
        permission: Permission.EventAttendance.Collect,
        eventId: submission.eventId,
      },
      summary: 'Presença off-line enviada para revisão administrativa.',
    });
    await this.dashboardInsights.invalidateCachedInsights();

    return this.toOfflineSubmission(submission);
  }

  private async tryResolveOfflineAttendancePerson(
    item: CommitOfflineEventAttendancesInput['attendances'][number],
  ): Promise<{ personId: string | null; errorMessage?: string }> {
    try {
      const person = await this.resolveOfflineAttendancePerson(item);
      return { personId: person.id };
    } catch (error: unknown) {
      return { personId: null, errorMessage: this.errorMessage(error) };
    }
  }

  private async resolveOfflineAttendancePerson(
    item: CommitOfflineEventAttendancesInput['attendances'][number],
  ): Promise<{ id: string }> {
    switch (item.createdByMethod) {
      case AttendanceCreationMethod.SCANNER: {
        const userId = item.code ? this.parseUserAztecCode(item.code) : null;
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

        return person;
      }
      case AttendanceCreationMethod.MANUAL_INPUT:
        return this.findSinglePersonForManualInput(item.value ?? '');
      default:
        throw new BadRequestException('Origem da presença off-line incompatível.');
    }
  }

  private toEventAttendance(attendance: {
    personId: string;
    eventId: string;
    category: EventAttendance['category'];
    attendedAt: Date;
    createdAt: Date;
    createdById: string | null;
    committedById: string | null;
    createdByMethod: EventAttendance['createdByMethod'];
    collectedLatitude: number | null;
    collectedLongitude: number | null;
    collectedAccuracyMeters: number | null;
  }): EventAttendance {
    return {
      ...attendance,
      createdById: attendance.createdById ?? undefined,
      committedById: attendance.committedById ?? undefined,
      collectedLatitude: attendance.collectedLatitude ?? undefined,
      collectedLongitude: attendance.collectedLongitude ?? undefined,
      collectedAccuracyMeters: attendance.collectedAccuracyMeters ?? undefined,
    };
  }

  private toOfflineSubmission(submission: {
    id: string;
    clientId: string;
    eventId: string;
    event?: OfflineEventAttendanceSubmission['event'] | null;
    personId: string | null;
    person?: OfflineEventAttendanceSubmission['person'] | null;
    status: OfflineEventAttendanceSubmission['status'];
    createdByMethod: EventAttendance['createdByMethod'];
    scannerCode: string | null;
    manualValue: string | null;
    collectedAt: Date;
    authorUserId: string | null;
    authorName: string | null;
    authorEmail: string | null;
    submittedById: string;
    submittedAt: Date;
    stagedReason: string | null;
    resolutionError: string | null;
    collectedLatitude: number | null;
    collectedLongitude: number | null;
    collectedAccuracyMeters: number | null;
    committedAt: Date | null;
    committedById: string | null;
    rejectedAt: Date | null;
    rejectedById: string | null;
    rejectionReason: string | null;
  }): OfflineEventAttendanceSubmission {
    return {
      ...submission,
      event: submission.event ?? undefined,
      personId: submission.personId ?? undefined,
      person: submission.person ?? undefined,
      scannerCode: submission.scannerCode ?? undefined,
      manualValue: submission.manualValue ?? undefined,
      authorUserId: submission.authorUserId ?? undefined,
      authorName: submission.authorName ?? undefined,
      authorEmail: submission.authorEmail ?? undefined,
      stagedReason: submission.stagedReason ?? undefined,
      resolutionError: submission.resolutionError ?? undefined,
      collectedLatitude: submission.collectedLatitude ?? undefined,
      collectedLongitude: submission.collectedLongitude ?? undefined,
      collectedAccuracyMeters: submission.collectedAccuracyMeters ?? undefined,
      committedAt: submission.committedAt ?? undefined,
      committedById: submission.committedById ?? undefined,
      rejectedAt: submission.rejectedAt ?? undefined,
      rejectedById: submission.rejectedById ?? undefined,
      rejectionReason: submission.rejectionReason ?? undefined,
    };
  }

  private commitStatusForError(error: unknown): OfflineEventAttendanceCommitResult['status'] {
    if (error instanceof ConflictException) {
      return this.errorMessage(error).includes('Presença já registrada') ? 'DUPLICATE' : 'CONFLICT';
    }

    if (error instanceof HttpException && [401, 403].includes(error.getStatus())) {
      return 'FORBIDDEN';
    }

    return 'FAILED';
  }

  private errorMessage(error: unknown): string {
    if (error instanceof HttpException) {
      const response = error.getResponse();
      if (typeof response === 'string') {
        return response;
      }

      if (typeof response === 'object' && response && 'message' in response) {
        const message = (response as { message?: unknown }).message;
        if (Array.isArray(message)) {
          return message.filter((item): item is string => typeof item === 'string').join('\n');
        }

        if (typeof message === 'string') {
          return message;
        }
      }
    }

    return error instanceof Error ? error.message : 'Não foi possível sincronizar a presença.';
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

  private normalizeOptionalString(value: string | null | undefined): string | undefined {
    const normalized = value?.trim();
    return normalized || undefined;
  }

  private getFirstName(name: string): string {
    return name.trim().split(/\s+/)[0] || name;
  }
}
