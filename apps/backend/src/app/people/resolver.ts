import {
  DeletionResult,
  Person,
  PersonCreateInput,
  PersonLinkedDataSummary,
  PersonLinkedResource,
  PersonLinkedResourceGroup,
  PersonUpdateInput,
} from '@cacic-fct/shared-data-types';
import { EventManagerKeycloakRole, Permission } from '@cacic-fct/shared-permissions';
import {
  ConflictException,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Args, Context, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { AuditLogEntityType, AuditLogOperation, Prisma } from '@prisma/client';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { RequireRoles } from '../auth/decorators/require-roles.decorator';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuthorizationPolicyService } from '../authorization/authorization-policy.service';
import { CertificateIssuingService } from '../certificate/certificate-issuing.service';
import { resolvePagination } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';
import { TypesenseSearchService } from '../search/typesense-search.service';

type GraphqlContext = {
  req?: { user?: AuthenticatedUser };
  request?: { user?: AuthenticatedUser };
};

type PersonLinkedResourceInput = Omit<PersonLinkedResource, 'description' | 'route' | 'status' | 'occurredAt'> & {
  description?: string | null;
  route?: string | null;
  status?: string | null;
  occurredAt?: Date | null;
};

type PersonLinkedResourceGroupInput = Omit<PersonLinkedResourceGroup, 'items' | 'totalCount'> & {
  items: PersonLinkedResourceInput[];
};

const PERSON_AUDIT_SELECT = {
  id: true,
  name: true,
  email: true,
  secondaryEmails: true,
  phone: true,
  identityDocument: true,
  academicId: true,
  userId: true,
  mergedIntoId: true,
  externalRef: true,
  deletedAt: true,
  createdById: true,
  updatedById: true,
} satisfies Prisma.PeopleSelect;

@Resolver(() => Person)
export class PeopleResolver {
  private readonly logger = new Logger(PeopleResolver.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly typesenseSearch: TypesenseSearchService,
    private readonly certificateIssuingService: CertificateIssuingService,
    private readonly auditLog: AuditLogService,
    private readonly authorizationPolicy: AuthorizationPolicyService,
  ) {}

  @Query(() => [Person], { name: 'people' })
  @RequirePermissions(Permission.Person.Read)
  async people(
    @Args('query', { type: () => String, nullable: true }) query?: string,
    @Args('userId', { type: () => String, nullable: true }) userId?: string,
    @Args('email', { type: () => String, nullable: true }) email?: string,
    @Args('phone', { type: () => String, nullable: true }) phone?: string,
    @Args('identityDocument', { type: () => String, nullable: true })
    identityDocument?: string,
    @Args('skip', { type: () => Int, nullable: true }) skip?: number,
    @Args('take', { type: () => Int, nullable: true }) take?: number,
  ) {
    const pagination = resolvePagination(skip, take);
    const where: Prisma.PeopleWhereInput = {
      deletedAt: null,
    };

    if (userId) {
      where.userId = userId;
    }

    if (email) {
      where.email = { equals: email, mode: 'insensitive' };
    }

    if (phone) {
      where.phone = { contains: phone, mode: 'insensitive' };
    }

    if (identityDocument) {
      where.identityDocument = identityDocument;
    }

    const normalizedQuery = query?.trim();
    let prioritizedIds: string[] = [];
    if (normalizedQuery) {
      if (this.typesenseSearch.isEnabled()) {
        const searchResult = await this.typesenseSearch.searchPeople(
          normalizedQuery,
          pagination.skip + pagination.take,
        );
        if (searchResult.available) {
          prioritizedIds = searchResult.ids;
          if (prioritizedIds.length === 0) {
            return [];
          }
          where.id = { in: prioritizedIds };
        } else {
          where.OR = [
            { name: { contains: normalizedQuery, mode: 'insensitive' } },
            { email: { contains: normalizedQuery, mode: 'insensitive' } },
            { phone: { contains: normalizedQuery, mode: 'insensitive' } },
            { identityDocument: { contains: normalizedQuery } },
            { academicId: { contains: normalizedQuery } },
          ];
        }
      } else {
        where.OR = [
          { name: { contains: normalizedQuery, mode: 'insensitive' } },
          { email: { contains: normalizedQuery, mode: 'insensitive' } },
          { phone: { contains: normalizedQuery, mode: 'insensitive' } },
          { identityDocument: { contains: normalizedQuery } },
          { academicId: { contains: normalizedQuery } },
        ];
      }
    }

    const people = await this.prisma.people.findMany({
      where,
      include: {
        user: true,
        lecturerProfile: true,
      },
      orderBy: {
        name: 'asc',
      },
      skip: prioritizedIds.length > 0 ? 0 : pagination.skip,
      take: prioritizedIds.length > 0 ? prioritizedIds.length : pagination.take,
    });

    if (prioritizedIds.length === 0) {
      return people;
    }

    const rank = new Map(prioritizedIds.map((id, index) => [id, index]));
    return [...people]
      .sort(
        (left, right) =>
          (rank.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(right.id) ?? Number.MAX_SAFE_INTEGER),
      )
      .slice(pagination.skip, pagination.skip + pagination.take);
  }

  @Query(() => Person, { name: 'person' })
  @RequirePermissions(Permission.Person.Read)
  async person(@Args('id', { type: () => String }) id: string) {
    const person = await this.prisma.people.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: {
        user: true,
        attendances: true,
        lectures: true,
        lecturerProfile: true,
      },
    });

    if (!person) {
      throw new NotFoundException(`Person ${id} was not found.`);
    }

    return person;
  }

  @Query(() => PersonLinkedDataSummary, {
    name: 'personLinkedDataSummary',
    description: 'Lists app resources linked to a person. Restricted to Event Manager super-admin users.',
  })
  @RequireRoles(EventManagerKeycloakRole.SuperAdmin)
  async personLinkedDataSummary(
    @Args('id', { type: () => String }) id: string,
    @Context() context: GraphqlContext,
  ) {
    const grantedPermissions = await this.authorizationPolicy.evaluatePermissions(this.getUser(context), [
      Permission.Person.Delete,
    ]);
    return this.buildPersonLinkedDataSummary(id, grantedPermissions.includes(Permission.Person.Delete));
  }

  @Mutation(() => Person, { name: 'createPerson' })
  @RequirePermissions(Permission.Person.Create)
  async createPerson(
    @Args('input', { type: () => PersonCreateInput }) input: PersonCreateInput,
    @Context() context: GraphqlContext,
  ) {
    await this.ensureNoDuplicateIdentity(input);

    const person = await this.prisma.$transaction(async (tx) => {
      const created = await tx.people.create({
        data: this.buildPersonCreateData(input),
        include: { user: true, lecturerProfile: true },
      });
      const auditPerson = await tx.people.findUniqueOrThrow({
        where: { id: created.id },
        select: PERSON_AUDIT_SELECT,
      });
      await this.auditLog.record(
        {
          entityType: AuditLogEntityType.PERSON,
          entityId: created.id,
          entityLabel: created.name,
          operation: AuditLogOperation.CREATE,
          actor: this.getUser(context),
          after: auditPerson,
          scope: { permission: Permission.Person.Create },
          summary: 'Pessoa criada.',
        },
        tx,
      );
      return created;
    });
    await this.typesenseSearch.upsertPerson({
      id: person.id,
      name: person.name,
      email: person.email,
      secondaryEmails: person.secondaryEmails,
      phone: person.phone,
      identityDocument: person.identityDocument,
      academicId: person.academicId,
      userId: person.userId,
    });
    return person;
  }

  @Mutation(() => Person, { name: 'updatePerson' })
  @RequirePermissions(Permission.Person.Update)
  async updatePerson(
    @Args('id', { type: () => String }) id: string,
    @Args('input', { type: () => PersonUpdateInput }) input: PersonUpdateInput,
    @Context() context: GraphqlContext,
  ) {
    const existingPerson = await this.prisma.people.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      select: PERSON_AUDIT_SELECT,
    });

    if (!existingPerson) {
      throw new NotFoundException(`Person ${id} was not found.`);
    }

    this.ensureExternallyManagedFieldsAreUnchanged(input, existingPerson);
    await this.ensureNoDuplicateIdentity(input, id);

    const person = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.people.update({
        where: { id, deletedAt: null },
        data: this.buildPersonUpdateData(input),
        include: { user: true, lecturerProfile: true },
      });
      const auditPerson = await tx.people.findUniqueOrThrow({ where: { id: updated.id }, select: PERSON_AUDIT_SELECT });
      await this.auditLog.record(
        {
          entityType: AuditLogEntityType.PERSON,
          entityId: updated.id,
          entityLabel: updated.name,
          operation: AuditLogOperation.UPDATE,
          actor: this.getUser(context),
          before: existingPerson,
          after: auditPerson,
          scope: { permission: Permission.Person.Update },
          summary: 'Pessoa atualizada.',
        },
        tx,
      );
      return updated;
    });
    await this.typesenseSearch.upsertPerson({
      id: person.id,
      name: person.name,
      email: person.email,
      secondaryEmails: person.secondaryEmails,
      phone: person.phone,
      identityDocument: person.identityDocument,
      academicId: person.academicId,
      userId: person.userId,
    });
    if (this.shouldRefreshCertificates(existingPerson, person)) {
      try {
        await this.certificateIssuingService.refreshIssuedCertificatesForPerson(person.id);
      } catch (error) {
        this.logger.error(
          `Failed to refresh certificates after admin update for person ${person.id}.`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
    return person;
  }

  @Mutation(() => DeletionResult, { name: 'deletePerson' })
  @RequireRoles(EventManagerKeycloakRole.SuperAdmin)
  @RequirePermissions(Permission.Person.Delete)
  async deletePerson(@Args('id', { type: () => String }) id: string, @Context() context: GraphqlContext) {
    const deletedAt = new Date();
    await this.prisma.$transaction(async (tx) => {
      const existingPerson = await tx.people.findFirst({
        where: { id, deletedAt: null },
        select: PERSON_AUDIT_SELECT,
      });
      if (!existingPerson) throw new NotFoundException(`Person ${id} was not found.`);
      if (await this.personHasLinkedData(existingPerson, tx)) {
        throw new ConflictException(
          `Person ${id} has linked app data and cannot be deleted. Review linked resources before deleting.`,
        );
      }
      await tx.people.update({ where: { id, deletedAt: null }, data: { deletedAt } });
      await this.auditLog.record(
        {
          entityType: AuditLogEntityType.PERSON,
          entityId: id,
          entityLabel: existingPerson.name,
          operation: AuditLogOperation.DELETE,
          actor: this.getUser(context),
          before: existingPerson,
          after: { ...existingPerson, deletedAt },
          scope: { permission: Permission.Person.Delete },
          summary: 'Pessoa excluída.',
          force: true,
        },
        tx,
      );
    });
    await this.typesenseSearch.deletePerson(id);
    return {
      deleted: true,
      id,
    };
  }

  private async buildPersonLinkedDataSummary(
    personId: string,
    hasDeletePermission: boolean,
    prisma: PrismaService | Prisma.TransactionClient = this.prisma,
  ): Promise<PersonLinkedDataSummary> {
    const person = await prisma.people.findFirst({
      where: { id: personId, deletedAt: null },
      select: {
        id: true,
        name: true,
        userId: true,
        mergedIntoId: true,
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            updatedAt: true,
          },
        },
        mergedInto: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!person) {
      throw new NotFoundException(`Person ${personId} was not found.`);
    }

    const [
      certificates,
      eventSubscriptions,
      eventGroupSubscriptions,
      majorEventSubscriptions,
      attendances,
      lectures,
      attendanceCollectors,
      offlineAttendanceSubmissions,
      permissionGrants,
      lecturerProfile,
      mergedFrom,
      mergeCandidates,
      mergeOperationsAsTarget,
      mergeOperationsAsSource,
      receipts,
    ] = await Promise.all([
      prisma.certificate.findMany({
        where: { personId, deletedAt: null },
        include: {
          config: {
            select: {
              id: true,
              name: true,
              scope: true,
              eventId: true,
              eventGroupId: true,
              majorEventId: true,
              event: { select: { id: true, name: true } },
              eventGroup: { select: { id: true, name: true } },
              majorEvent: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: { issuedAt: 'desc' },
      }),
      prisma.eventSubscription.findMany({
        where: { personId, deletedAt: null },
        include: { event: { select: { id: true, name: true, startDate: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.eventGroupSubscription.findMany({
        where: { personId, deletedAt: null },
        include: { eventGroup: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.majorEventSubscription.findMany({
        where: { personId, deletedAt: null },
        include: { majorEvent: { select: { id: true, name: true, startDate: true } } },
        orderBy: { updatedAt: 'desc' },
      }),
      prisma.eventAttendance.findMany({
        where: { personId },
        include: { event: { select: { id: true, name: true, startDate: true } } },
        orderBy: { attendedAt: 'desc' },
      }),
      prisma.eventLecturer.findMany({
        where: { personId },
        include: { event: { select: { id: true, name: true, startDate: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.eventAttendanceCollector.findMany({
        where: { personId },
        include: { event: { select: { id: true, name: true, startDate: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.offlineEventAttendanceSubmission.findMany({
        where: { personId },
        include: { event: { select: { id: true, name: true, startDate: true } } },
        orderBy: { submittedAt: 'desc' },
      }),
      prisma.eventManagerPermissionGrant.findMany({
        where: { personId, deletedAt: null },
        include: {
          event: { select: { id: true, name: true } },
          eventGroup: { select: { id: true, name: true } },
          majorEvent: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.lecturerProfile.findUnique({
        where: { personId },
        select: { id: true, displayName: true, updatedAt: true },
      }),
      prisma.people.findMany({
        where: { mergedIntoId: personId, deletedAt: null },
        select: { id: true, name: true, updatedAt: true },
        orderBy: { updatedAt: 'desc' },
      }),
      prisma.mergeCandidate.findMany({
        where: { OR: [{ personAId: personId }, { personBId: personId }] },
        orderBy: { updatedAt: 'desc' },
      }),
      prisma.peopleMergeOperation.findMany({
        where: { targetPersonId: personId },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.peopleMergeOperation.findMany({
        where: { sourcePersonId: personId },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.majorEventReceipt.findMany({
        where: { personId },
        include: { subscription: { select: { majorEventId: true } } },
        orderBy: { uploadedAt: 'desc' },
      }),
    ]);

    const groups = this.normalizeLinkedResourceGroups([
      this.buildLinkedGroup('USER', 'Usuário vinculado', 'account_circle', [
        ...(person.user
          ? [
              {
                id: person.user.id,
                label: person.user.name,
                description: person.user.email,
                route: `/people/${person.id}`,
                occurredAt: person.user.updatedAt,
              },
            ]
          : []),
      ]),
      this.buildLinkedGroup(
        'CERTIFICATE',
        'Certificados',
        'workspace_premium',
        certificates.map((certificate) => ({
          id: certificate.id,
          label: certificate.config.name,
          description: this.getCertificateTargetLabel(certificate.config),
          route: this.getCertificateRoute(certificate.config),
          occurredAt: certificate.issuedAt,
        })),
      ),
      this.buildLinkedGroup(
        'SUBSCRIPTION',
        'Inscrições',
        'confirmation_number',
        [
          ...eventSubscriptions.map((subscription) => ({
            id: subscription.id,
            label: subscription.event.name,
            description: 'Inscrição em evento',
            route: `/subscriptions/event/${subscription.eventId}`,
            occurredAt: subscription.createdAt,
          })),
          ...eventGroupSubscriptions.map((subscription) => ({
            id: subscription.id,
            label: subscription.eventGroup.name,
            description: 'Inscrição em grupo de eventos',
            route: `/groups/${subscription.eventGroupId}`,
            occurredAt: subscription.createdAt,
          })),
          ...majorEventSubscriptions.map((subscription) => ({
            id: subscription.id,
            label: subscription.majorEvent.name,
            description: 'Inscrição em grande evento',
            route: `/subscriptions/major-event/${subscription.majorEventId}`,
            status: subscription.subscriptionStatus,
            occurredAt: subscription.updatedAt,
          })),
        ],
      ),
      this.buildLinkedGroup(
        'ATTENDANCE',
        'Presenças',
        'how_to_reg',
        attendances.map((attendance) => ({
          id: `${attendance.personId}:${attendance.eventId}`,
          label: attendance.event.name,
          description: 'Presença em evento',
          route: `/attendances/event/${attendance.eventId}`,
          status: attendance.category,
          occurredAt: attendance.attendedAt,
        })),
      ),
      this.buildLinkedGroup(
        'EVENT_RELATION',
        'Vínculos com eventos',
        'event_available',
        [
          ...lectures.map((lecture) => ({
            id: `${lecture.eventId}:${lecture.personId}:lecturer`,
            label: lecture.event.name,
            description: 'Ministrante',
            route: `/events/${lecture.eventId}`,
            occurredAt: lecture.createdAt,
          })),
          ...attendanceCollectors.map((collector) => ({
            id: `${collector.eventId}:${collector.personId}:collector`,
            label: collector.event.name,
            description: 'Coletor de presença',
            route: `/events/${collector.eventId}`,
            occurredAt: collector.createdAt,
          })),
        ],
      ),
      this.buildLinkedGroup(
        'OFFLINE_ATTENDANCE_SUBMISSION',
        'Coletas offline',
        'sync_problem',
        offlineAttendanceSubmissions.map((submission) => ({
          id: submission.id,
          label: submission.event.name,
          description: 'Submissão offline de presença',
          route: `/attendances/event/${submission.eventId}`,
          status: submission.status,
          occurredAt: submission.submittedAt,
        })),
      ),
      this.buildLinkedGroup(
        'RECEIPT',
        'Comprovantes',
        'receipt_long',
        receipts.map((receipt) => ({
          id: receipt.id,
          label: receipt.fileName,
          description: 'Comprovante de inscrição em grande evento',
          route: `/subscriptions/major-event/${receipt.subscription.majorEventId}/validate-receipts`,
          status: receipt.processingStatus,
          occurredAt: receipt.uploadedAt,
        })),
      ),
      this.buildLinkedGroup(
        'LECTURER_PROFILE',
        'Perfil de ministrante',
        'badge',
        lecturerProfile
          ? [
              {
                id: lecturerProfile.id,
                label: lecturerProfile.displayName,
                description: 'Perfil público de ministrante',
                route: `/people/${person.id}`,
                occurredAt: lecturerProfile.updatedAt,
              },
            ]
          : [],
      ),
      this.buildLinkedGroup(
        'PERMISSION_GRANT',
        'Permissões',
        'admin_panel_settings',
        permissionGrants.map((grant) => ({
          id: grant.id,
          label: grant.permission,
          description: this.getPermissionGrantTargetLabel(grant),
          route: `/people/${person.id}`,
          status: grant.scope,
          occurredAt: grant.createdAt,
        })),
      ),
      this.buildLinkedGroup(
        'MERGE',
        'Unificações',
        'call_merge',
        [
          ...(person.mergedInto
            ? [
                {
                  id: `${person.id}:merged-into:${person.mergedInto.id}`,
                  label: `Unificada em ${person.mergedInto.name}`,
                  description: 'Esta pessoa aponta para outro cadastro',
                  route: `/people/${person.mergedInto.id}`,
                },
              ]
            : []),
          ...mergedFrom.map((mergedPerson) => ({
            id: `${mergedPerson.id}:merged-from:${person.id}`,
            label: `${mergedPerson.name} foi unificada neste cadastro`,
            description: 'Outro cadastro aponta para esta pessoa',
            route: `/people/${mergedPerson.id}`,
            occurredAt: mergedPerson.updatedAt,
          })),
          ...mergeCandidates.map((candidate) => ({
            id: candidate.id,
            label: `Candidato de unificação ${candidate.status.toLocaleLowerCase('pt-BR')}`,
            description: candidate.matchValue ?? candidate.matchMethod ?? 'Candidato de unificação',
            route: '/merge-candidates',
            status: candidate.status,
            occurredAt: candidate.updatedAt,
          })),
          ...mergeOperationsAsTarget.map((operation) => ({
            id: `${operation.id}:target`,
            label: 'Operação de unificação como destino',
            description: operation.status,
            route: '/merge-candidates',
            status: operation.status,
            occurredAt: operation.createdAt,
          })),
          ...mergeOperationsAsSource.map((operation) => ({
            id: `${operation.id}:source`,
            label: 'Operação de unificação como origem',
            description: operation.status,
            route: '/merge-candidates',
            status: operation.status,
            occurredAt: operation.createdAt,
          })),
        ],
      ),
    ]);

    const totalCount = groups.reduce((sum, group) => sum + group.totalCount, 0);
    return {
      personId,
      groups,
      totalCount,
      hasLinkedData: totalCount > 0,
      canDelete: hasDeletePermission && totalCount === 0,
    };
  }

  private async personHasLinkedData(
    person: Pick<Prisma.PeopleGetPayload<{ select: typeof PERSON_AUDIT_SELECT }>, 'id' | 'userId' | 'mergedIntoId'>,
    prisma: PrismaService | Prisma.TransactionClient,
  ): Promise<boolean> {
    if (person.userId || person.mergedIntoId) {
      return true;
    }

    const [
      certificate,
      eventSubscription,
      eventGroupSubscription,
      majorEventSubscription,
      attendance,
      lecture,
      attendanceCollector,
      offlineAttendanceSubmission,
      permissionGrant,
      lecturerProfile,
      mergedFrom,
      mergeCandidate,
      mergeOperationAsTarget,
      mergeOperationAsSource,
      receipt,
    ] = await Promise.all([
      prisma.certificate.findFirst({ where: { personId: person.id, deletedAt: null }, select: { id: true } }),
      prisma.eventSubscription.findFirst({ where: { personId: person.id, deletedAt: null }, select: { id: true } }),
      prisma.eventGroupSubscription.findFirst({
        where: { personId: person.id, deletedAt: null },
        select: { id: true },
      }),
      prisma.majorEventSubscription.findFirst({
        where: { personId: person.id, deletedAt: null },
        select: { id: true },
      }),
      prisma.eventAttendance.findFirst({ where: { personId: person.id }, select: { personId: true } }),
      prisma.eventLecturer.findFirst({ where: { personId: person.id }, select: { personId: true } }),
      prisma.eventAttendanceCollector.findFirst({ where: { personId: person.id }, select: { personId: true } }),
      prisma.offlineEventAttendanceSubmission.findFirst({ where: { personId: person.id }, select: { id: true } }),
      prisma.eventManagerPermissionGrant.findFirst({
        where: { personId: person.id, deletedAt: null },
        select: { id: true },
      }),
      prisma.lecturerProfile.findUnique({ where: { personId: person.id }, select: { id: true } }),
      prisma.people.findFirst({
        where: { mergedIntoId: person.id, deletedAt: null },
        select: { id: true },
      }),
      prisma.mergeCandidate.findFirst({
        where: { OR: [{ personAId: person.id }, { personBId: person.id }] },
        select: { id: true },
      }),
      prisma.peopleMergeOperation.findFirst({ where: { targetPersonId: person.id }, select: { id: true } }),
      prisma.peopleMergeOperation.findFirst({ where: { sourcePersonId: person.id }, select: { id: true } }),
      prisma.majorEventReceipt.findFirst({ where: { personId: person.id }, select: { id: true } }),
    ]);

    return Boolean(
      certificate ||
        eventSubscription ||
        eventGroupSubscription ||
        majorEventSubscription ||
        attendance ||
        lecture ||
        attendanceCollector ||
        offlineAttendanceSubmission ||
        permissionGrant ||
        lecturerProfile ||
        mergedFrom ||
        mergeCandidate ||
        mergeOperationAsTarget ||
        mergeOperationAsSource ||
        receipt,
    );
  }

  private buildLinkedGroup(
    type: string,
    label: string,
    icon: string,
    items: PersonLinkedResourceInput[],
  ): PersonLinkedResourceGroupInput {
    return { type, label, icon, items };
  }

  private normalizeLinkedResourceGroups(
    groups: PersonLinkedResourceGroupInput[],
  ): PersonLinkedResourceGroup[] {
    return groups
      .filter((group) => group.items.length > 0)
      .map((group) => ({
        type: group.type,
        label: group.label,
        icon: group.icon,
        items: group.items,
        totalCount: group.items.length,
      }));
  }

  private getCertificateTargetLabel(config: {
    scope: string;
    event?: { name: string } | null;
    eventGroup?: { name: string } | null;
    majorEvent?: { name: string } | null;
  }): string | null {
    if (config.event) {
      return `Evento: ${config.event.name}`;
    }

    if (config.eventGroup) {
      return `Grupo de eventos: ${config.eventGroup.name}`;
    }

    if (config.majorEvent) {
      return `Grande evento: ${config.majorEvent.name}`;
    }

    return config.scope;
  }

  private getCertificateRoute(config: {
    id: string;
    eventId?: string | null;
    eventGroupId?: string | null;
    majorEventId?: string | null;
  }): string | null {
    if (config.eventId) {
      return `/certificates/event/${config.eventId}/${config.id}`;
    }

    if (config.eventGroupId) {
      return `/certificates/event-group/${config.eventGroupId}/${config.id}`;
    }

    if (config.majorEventId) {
      return `/certificates/major-event/${config.majorEventId}/${config.id}`;
    }

    return '/certificates';
  }

  private getPermissionGrantTargetLabel(grant: {
    event?: { name: string } | null;
    eventGroup?: { name: string } | null;
    majorEvent?: { name: string } | null;
  }): string {
    return grant.event?.name ?? grant.eventGroup?.name ?? grant.majorEvent?.name ?? 'Escopo global';
  }

  private async ensureNoDuplicateIdentity(
    input: PersonCreateInput | PersonUpdateInput,
    excludeId?: string,
  ): Promise<void> {
    if (!input.identityDocument?.trim() && !input.email?.trim() && !input.name?.trim()) {
      throw new UnprocessableEntityException(
        'A person must include at least one of: identityDocument, email, or name.',
      );
    }

    const normalizedIdentityDocument = input.identityDocument?.trim();
    const normalizedEmail = input.email?.trim();
    const normalizedName = input.name?.trim();

    const duplicateFilters: Prisma.PeopleWhereInput[] = [];
    if (normalizedIdentityDocument) {
      duplicateFilters.push({ identityDocument: normalizedIdentityDocument });
    }
    if (normalizedEmail) {
      duplicateFilters.push({
        email: { equals: normalizedEmail, mode: 'insensitive' },
      });
    }
    if (normalizedName) {
      duplicateFilters.push({
        name: { equals: normalizedName, mode: 'insensitive' },
      });
    }

    if (duplicateFilters.length === 0) {
      return;
    }

    const duplicate = await this.prisma.people.findFirst({
      where: {
        deletedAt: null,
        OR: duplicateFilters,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: {
        id: true,
        name: true,
        email: true,
        identityDocument: true,
      },
    });

    if (duplicate) {
      throw new ConflictException(
        `Person ${duplicate.id} already exists with matching identity document, email, or name.`,
      );
    }
  }

  private shouldRefreshCertificates(
    before: Pick<Person, 'name' | 'identityDocument'>,
    after: Pick<Person, 'name' | 'identityDocument'>,
  ): boolean {
    return before.name !== after.name || before.identityDocument !== after.identityDocument;
  }

  private ensureExternallyManagedFieldsAreUnchanged(
    input: PersonUpdateInput,
    existingPerson: {
      name: string;
      email: string | null;
      phone: string | null;
      identityDocument: string | null;
      academicId: string | null;
      userId: string | null;
    },
  ): void {
    if (!existingPerson.userId) {
      return;
    }

    const lockedFields = [
      ['name', input.name, existingPerson.name],
      ['email', input.email, existingPerson.email],
      ['phone', input.phone, existingPerson.phone],
      ['identityDocument', input.identityDocument, existingPerson.identityDocument],
      ['academicId', input.academicId, existingPerson.academicId],
    ] as const;

    const changedFields = lockedFields
      .filter(([, nextValue, currentValue]) => nextValue !== undefined && nextValue !== currentValue)
      .map(([field]) => field);

    if (changedFields.length > 0) {
      throw new UnprocessableEntityException(
        `Person is linked to a Keycloak account. Externally managed fields cannot be edited: ${changedFields.join(', ')}.`,
      );
    }
  }

  private buildPersonCreateData(input: PersonCreateInput): Prisma.PeopleUncheckedCreateInput {
    return {
      ...(input.id !== undefined ? { id: input.id } : {}),
      name: input.name,
      ...(input.email !== undefined ? { email: input.email } : {}),
      ...(input.secondaryEmails !== undefined ? { secondaryEmails: input.secondaryEmails } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.identityDocument !== undefined ? { identityDocument: input.identityDocument } : {}),
      ...(input.academicId !== undefined ? { academicId: input.academicId } : {}),
      ...(input.userId !== undefined ? { userId: input.userId } : {}),
      ...(input.mergedIntoId !== undefined ? { mergedIntoId: input.mergedIntoId } : {}),
      ...(input.externalRef !== undefined ? { externalRef: input.externalRef } : {}),
    };
  }

  private buildPersonUpdateData(input: PersonUpdateInput): Prisma.PeopleUncheckedUpdateManyInput {
    const data: Prisma.PeopleUncheckedUpdateManyInput = {};

    if (input.id !== undefined) data.id = input.id;
    if (input.name !== undefined) data.name = input.name;
    if (input.email !== undefined) data.email = input.email;
    if (input.secondaryEmails !== undefined) data.secondaryEmails = input.secondaryEmails;
    if (input.phone !== undefined) data.phone = input.phone;
    if (input.identityDocument !== undefined) data.identityDocument = input.identityDocument;
    if (input.academicId !== undefined) data.academicId = input.academicId;
    if (input.userId !== undefined) data.userId = input.userId;
    if (input.mergedIntoId !== undefined) data.mergedIntoId = input.mergedIntoId;
    if (input.externalRef !== undefined) data.externalRef = input.externalRef;

    return data;
  }

  private getUser(context: GraphqlContext): AuthenticatedUser | undefined {
    return context.req?.user ?? context.request?.user;
  }
}
