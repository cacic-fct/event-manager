import { TransferValidationException } from './transfer-validation.exception';
import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  TransferAdapterExportResult,
  TransferAdapterContext,
  DataTransferAdapter,
  ResolvedTransferResource,
  TransferWriteAction,
} from './data-transfer-adapter';
import type {
  ResolvedTransferDocument,
  TransferResource,
  TransferResourceKind,
  TransferTarget,
} from '@cacic-fct/shared-data-transfer';
import type { JsonValue, TransferExportRequest } from '@cacic-fct/shared-data-transfer';
import { AuditLogEntityType, AuditLogOperation, Prisma } from '@prisma/client';
import { Permission } from '@cacic-fct/shared-permissions';
import { TRANSFER_MAX_RESOURCES } from '@cacic-fct/shared-data-transfer';
import { normalizeEventCertificateSettings, type EventCertificateSettings } from '../events/event-certificate-settings';
import { normalizeTwitchChannel, normalizeYoutubeCode } from '@cacic-fct/shared-livestream';
import { applyAudienceSettings, type AudienceChange } from '../audiences/audience-input';
import { ANONYMOUS_AUDIENCE, audienceContext } from '../audiences/audience-context';
import { AudienceInvitationService } from '../audiences/audience-invitation.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuthorizationPolicyService } from '../authorization/authorization-policy.service';
import { AttendanceCategoryService } from '../events/attendance-category.service';
import { CurrentUserOnlineAttendanceRealtimeService } from '../current-user/events/attendance-realtime.service';
import { attendancePriceTierPolicyChanged } from '../events/attendance-price-tier-policy';
import { eventContentAuditSnapshot } from '../events/event-content-audit';
import { EventPostCommitEffectsService } from '../events/event-post-commit-effects.service';
import { syncEventGroupMajorEvent } from '../events/event-group-major-event';
import { EventSitemapService } from '../public-events/event-sitemap.service';
import { FrozenResourceService } from '../common/frozen-resource.service';
import { PrismaService } from '../prisma/prisma.service';
import { TypesenseSearchService } from '../search/typesense-search.service';
import { RealtimeInvalidationService } from '../realtime/realtime-invalidation.service';
import {
  PUBLIC_CATALOG_REALTIME_CHANNEL,
  createPublicCatalogInvalidation,
} from '../realtime/public-catalog-invalidation';
import { SportsBackingResourceLifecycleService } from '../sports/sports-backing-resource-lifecycle.service';
import { TicketIssuanceService } from '../tickets/ticket-issuance.service';

const EVENT_FIELDS = [
  'name',
  'emoji',
  'startDate',
  'endDate',
  'type',
  'creditMinutes',
  'description',
  'shortDescription',
  'latitude',
  'longitude',
  'locationDescription',
  'majorEventId',
  'eventGroupId',
  'audience',
  'audienceCourseCodes',
  'interestEnabled',
  'allowSubscription',
  'requiresImageLicenseAgreement',
  'subscriptionStartDate',
  'subscriptionEndDate',
  'slots',
  'autoSubscribe',
  'attendanceEligibility',
  'shouldIssueCertificate',
  'shouldIssueCertificateForNonPayingAttendees',
  'shouldIssueCertificateForNonSubscribedAttendees',
  'regularAttendancePriceTierIds',
  'shouldCollectAttendance',
  'shouldAllowOralAttendance',
  'isOnlineAttendanceAllowed',
  'onlineAttendanceStartDate',
  'onlineAttendanceEndDate',
  'shouldProvideSubscriberListToLecturer',
  'isPubliclyListed',
  'displayLecturerProfile',
  'youtubeCode',
  'twitchChannel',
  'buttonText',
  'buttonLink',
] as const;
const EVENT_GROUP_FIELDS = [
  'name',
  'emoji',
  'majorEventId',
  'audience',
  'audienceCourseCodes',
  'interestEnabled',
  'requiresImageLicenseAgreement',
  'attendanceEligibility',
  'shouldIssueCertificate',
  'shouldIssueCertificateForNonPayingAttendees',
  'shouldIssueCertificateForNonSubscribedAttendees',
  'shouldIssueCertificateForEachEvent',
  'shouldIssuePartialCertificate',
] as const;
const MAJOR_EVENT_FIELDS = [
  'name',
  'emoji',
  'startDate',
  'endDate',
  'description',
  'audience',
  'audienceCourseCodes',
  'interestEnabled',
  'requiresImageLicenseAgreement',
  'subscriptionStartDate',
  'subscriptionEndDate',
  'attendanceEligibility',
  'maxCoursesPerAttendee',
  'maxLecturesPerAttendee',
  'maxUncategorizedPerAttendee',
  'rankedSubscriptionEnabled',
  'buttonText',
  'buttonLink',
  'contactInfo',
  'contactType',
  'isPaymentRequired',
  'shouldIssueCertificateForNonPayingAttendees',
  'shouldIssueCertificateForNonSubscribedAttendees',
  'additionalPaymentInfo',
] as const;
const DATE_FIELDS = new Set([
  'startDate',
  'endDate',
  'subscriptionStartDate',
  'subscriptionEndDate',
  'onlineAttendanceStartDate',
  'onlineAttendanceEndDate',
]);
const ROOT_KIND: Readonly<Record<TransferTarget['kind'], TransferResourceKind>> = {
  event: 'event',
  group: 'group',
  'major-event': 'major-event',
};

const EVENT_SELECT = {
  id: true,
  updatedAt: true,
  deletedAt: true,
  audience: true,
  audienceCourseCodes: true,
  name: true,
  emoji: true,
  startDate: true,
  endDate: true,
  type: true,
  creditMinutes: true,
  description: true,
  shortDescription: true,
  latitude: true,
  longitude: true,
  locationDescription: true,
  majorEventId: true,
  eventGroupId: true,
  interestEnabled: true,
  allowSubscription: true,
  requiresImageLicenseAgreement: true,
  subscriptionStartDate: true,
  subscriptionEndDate: true,
  slots: true,
  autoSubscribe: true,
  attendanceEligibility: true,
  shouldIssueCertificate: true,
  shouldIssueCertificateForNonPayingAttendees: true,
  shouldIssueCertificateForNonSubscribedAttendees: true,
  regularAttendancePriceTierIds: true,
  shouldCollectAttendance: true,
  shouldAllowOralAttendance: true,
  isOnlineAttendanceAllowed: true,
  onlineAttendanceStartDate: true,
  onlineAttendanceEndDate: true,
  shouldProvideSubscriberListToLecturer: true,
  isPubliclyListed: true,
  displayLecturerProfile: true,
  youtubeCode: true,
  twitchChannel: true,
  buttonText: true,
  buttonLink: true,
  sportsMatch: { select: { id: true } },
  eventGroup: { select: { majorEventId: true } },
} satisfies Prisma.EventSelect;

const EVENT_GROUP_SELECT = {
  id: true,
  updatedAt: true,
  deletedAt: true,
  audience: true,
  audienceCourseCodes: true,
  name: true,
  emoji: true,
  majorEventId: true,
  interestEnabled: true,
  requiresImageLicenseAgreement: true,
  attendanceEligibility: true,
  shouldIssueCertificate: true,
  shouldIssueCertificateForNonPayingAttendees: true,
  shouldIssueCertificateForNonSubscribedAttendees: true,
  shouldIssueCertificateForEachEvent: true,
  shouldIssuePartialCertificate: true,
  sportsCategory: { select: { id: true } },
} satisfies Prisma.EventGroupSelect;

const MAJOR_EVENT_SELECT = {
  id: true,
  updatedAt: true,
  deletedAt: true,
  audience: true,
  audienceCourseCodes: true,
  name: true,
  emoji: true,
  startDate: true,
  endDate: true,
  description: true,
  interestEnabled: true,
  requiresImageLicenseAgreement: true,
  subscriptionStartDate: true,
  subscriptionEndDate: true,
  attendanceEligibility: true,
  maxCoursesPerAttendee: true,
  maxLecturesPerAttendee: true,
  maxUncategorizedPerAttendee: true,
  rankedSubscriptionEnabled: true,
  buttonText: true,
  buttonLink: true,
  contactInfo: true,
  contactType: true,
  isPaymentRequired: true,
  shouldIssueCertificateForNonPayingAttendees: true,
  shouldIssueCertificateForNonSubscribedAttendees: true,
  additionalPaymentInfo: true,
  publicationState: true,
  sportsTournament: { select: { id: true } },
} satisfies Prisma.MajorEventSelect;

type EventRecord = Prisma.EventGetPayload<{ select: typeof EVENT_SELECT }>;
type EventGroupRecord = Prisma.EventGroupGetPayload<{ select: typeof EVENT_GROUP_SELECT }>;
type MajorEventRecord = Prisma.MajorEventGetPayload<{ select: typeof MAJOR_EVENT_SELECT }>;

interface EventTreeSnapshot extends ResolvedTransferResource {
  certificateChildren?: ResolvedTransferResource[];
}

@Injectable()
export class EventTreeTransferAdapter implements DataTransferAdapter {
  readonly kinds = ['major-event', 'group', 'event'] as const;
  readonly dependencyOrder = 10;

  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationPolicyService,
    private readonly frozen: FrozenResourceService,
    private readonly audit: AuditLogService,
    private readonly invitations: AudienceInvitationService,
    private readonly postCommit: EventPostCommitEffectsService,
    private readonly attendanceCategories: AttendanceCategoryService,
    private readonly attendanceRealtime: CurrentUserOnlineAttendanceRealtimeService,
    private readonly sportsLifecycle: SportsBackingResourceLifecycleService,
    private readonly ticketIssuance: TicketIssuanceService,
    private readonly sitemap: EventSitemapService,
    private readonly typesense: TypesenseSearchService,
    private readonly realtime: RealtimeInvalidationService,
  ) {}

  async resolve(resource: TransferResource, context: TransferAdapterContext): Promise<EventTreeSnapshot> {
    if (resource.kind === 'event') {
      const current = await context.tx.event.findFirst({
        where: { id: resource.id, deletedAt: null },
        select: EVENT_SELECT,
      });
      if (current?.sportsMatch) {
        const ownedBy = this.matchOwner(resource.id, context.document);
        return this.snapshot(
          resource,
          eventResource(current),
          current.updatedAt,
          {
            eventId: resource.id,
            ...(current.eventGroupId ? { eventGroupId: current.eventGroupId } : {}),
            ...((current.majorEventId ?? current.eventGroup?.majorEventId)
              ? { majorEventId: current.majorEventId ?? current.eventGroup?.majorEventId ?? undefined }
              : {}),
          },
          {
            skip: { message: 'Esta partida é gerenciada pela configuração esportiva vinculada.' },
            ...(ownedBy ? { ownedBy } : {}),
          },
        );
      }
      const proposed = dataOf(resource);
      const parent = current ? {} : await this.resolveEventParent(proposed, context);
      const groupId = current ? current.eventGroupId : asId(proposed['eventGroupId']);
      const majorEventId = current
        ? (current.majorEventId ?? current.eventGroup?.majorEventId)
        : (asId(proposed['majorEventId']) ?? parent.majorEventId);
      let normalizedResource = normalizeEventResource(resource, current === null);
      if (groupId) {
        const group = await context.tx.eventGroup.findFirst({
          where: { id: groupId, deletedAt: null },
          select: EVENT_GROUP_SELECT,
        });
        const proposedGroup = context.document.resources.find(
          (entry) => entry.kind === 'group' && entry.id === groupId,
        );
        const effectiveGroup = { ...group, ...(proposedGroup ? dataOf(proposedGroup) : {}) };
        normalizedResource = {
          ...normalizedResource,
          data: normalizeEventCertificateSettings(normalizedResource.data as EventCertificateSettings, effectiveGroup),
        } as TransferResource;
      }
      if (!current && proposed['majorEventId'] === undefined && parent.majorEventId) {
        normalizedResource = {
          ...normalizedResource,
          data: { ...dataOf(normalizedResource), majorEventId: parent.majorEventId } as JsonValue,
        } as TransferResource;
      }
      const parentCanonicalization = current
        ? null
        : await this.proposedGroupCanonicalization(dataOf(normalizedResource), context);
      return this.snapshot(
        normalizedResource,
        current ? eventResource(current) : null,
        current?.updatedAt ?? null,
        {
          eventId: resource.id,
          ...(groupId ? { eventGroupId: groupId } : {}),
          ...(majorEventId ? { majorEventId } : {}),
        },
        {
          ...(groupId && context.document.resources.some((entry) => entry.kind === 'group' && entry.id === groupId)
            ? {
                dependencies: [{ kind: 'group' as const, id: groupId }],
                writeDependencies: [{ kind: 'group' as const, id: groupId }],
              }
            : {}),
          ...(parentCanonicalization
            ? {
                additionalChanges: [
                  {
                    field: 'Grande evento do grupo pai',
                    before: null,
                    after: parentCanonicalization.majorEventId,
                  },
                ],
              }
            : {}),
        },
      );
    }
    if (resource.kind === 'group') {
      const current = await context.tx.eventGroup.findFirst({
        where: { id: resource.id, deletedAt: null },
        select: EVENT_GROUP_SELECT,
      });
      if (current?.sportsCategory) {
        const ownedBy = this.categoryOwner(resource.id, context.document);
        return this.snapshot(
          resource,
          groupResource(current),
          current.updatedAt,
          {
            eventGroupId: resource.id,
            ...(current.majorEventId ? { majorEventId: current.majorEventId } : {}),
          },
          {
            skip: { message: 'Esta modalidade é gerenciada pela configuração esportiva vinculada.' },
            ...(ownedBy ? { ownedBy } : {}),
          },
        );
      }
      const proposed = dataOf(resource);
      const majorEventId = current ? current.majorEventId : asId(proposed['majorEventId']);
      return this.snapshot(
        normalizeGroupResource(resource),
        current ? groupResource(current) : null,
        current?.updatedAt ?? null,
        {
          eventGroupId: resource.id,
          ...(majorEventId ? { majorEventId } : {}),
        },
      );
    }
    if (resource.kind === 'major-event') {
      const current = await context.tx.majorEvent.findFirst({
        where: { id: resource.id, deletedAt: null },
        select: MAJOR_EVENT_SELECT,
      });
      return this.snapshot(
        normalizeMajorEventResource(resource),
        current ? majorEventResource(current) : null,
        current?.updatedAt ?? null,
        {
          majorEventId: resource.id,
        },
      );
    }
    throw new TransferValidationException('Tipo de recurso incompatível com o adaptador de eventos.');
  }

  async assertRead(snapshot: ResolvedTransferResource, context: TransferAdapterContext): Promise<void> {
    const resource = snapshot.resource;
    if (snapshot.current) {
      await this.authorization.assertPermissions(
        context.actor,
        [Permission.DataTransfer.Import, readPermission(resource.kind)],
        snapshot.scope,
      );
      return;
    }
    const parents = await this.parentReadRequirements(resource, context);
    if (parents.length > 0) {
      for (const parent of parents) {
        await this.authorization.assertPermissions(
          context.actor,
          [Permission.DataTransfer.Import, parent.permission],
          parent.scope,
        );
      }
      return;
    }
    await this.authorization.assertPermissions(
      context.actor,
      [Permission.DataTransfer.Import, readPermission(resource.kind)],
      {},
    );
  }

  async assertWrite(
    snapshot: ResolvedTransferResource,
    action: TransferWriteAction,
    context: TransferAdapterContext,
  ): Promise<void> {
    const permission =
      action === 'create' ? createPermission(snapshot.resource.kind) : updatePermission(snapshot.resource.kind);
    if (action === 'update') {
      await this.authorization.assertPermissions(
        context.actor,
        [Permission.DataTransfer.Import, permission],
        snapshot.scope,
      );
      return;
    }
    const parents = await this.parentWriteScopes(snapshot.resource, context);
    for (const parent of parents.length > 0 ? parents : [{}]) {
      await this.authorization.assertPermissions(context.actor, [Permission.DataTransfer.Import, permission], parent);
    }
    if (
      snapshot.resource.kind === 'event' &&
      snapshot.additionalChanges?.some((change) => change.field === 'Grande evento do grupo pai')
    ) {
      const groupId = asId(dataOf(snapshot.resource)['eventGroupId']);
      if (!groupId) throw new TransferValidationException('A atualização do grupo pai não pode ser autorizada.');
      await this.authorization.assertPermissions(
        context.actor,
        [Permission.EventGroup.Read, Permission.EventGroup.Update],
        { eventGroupId: groupId },
      );
    }
  }

  async assertMutable(
    snapshot: ResolvedTransferResource,
    _operation: 'edit' | 'delete',
    context: TransferAdapterContext,
  ): Promise<void> {
    const resource = snapshot.resource;
    if (resource.kind === 'event') {
      const input = dataOf(resource);
      if (snapshot.current) {
        await this.frozen.assertEventUpdateMutable(
          resource.id,
          {
            ...(input['eventGroupId'] === undefined ? {} : { eventGroupId: asId(input['eventGroupId']) }),
            ...(input['majorEventId'] === undefined ? {} : { majorEventId: asId(input['majorEventId']) }),
          },
          context.actor,
        );
      } else {
        const groupId = asId(input['eventGroupId']);
        const majorEventId = asId(input['majorEventId']);
        if (
          groupId &&
          (await context.tx.eventGroup.findFirst({ where: { id: groupId, deletedAt: null }, select: { id: true } }))
        ) {
          await this.frozen.assertEventGroupMutable(groupId, context.actor, 'edit');
        }
        if (
          majorEventId &&
          (await context.tx.majorEvent.findFirst({
            where: { id: majorEventId, deletedAt: null },
            select: { id: true },
          }))
        ) {
          await this.frozen.assertMajorEventMutable(majorEventId, context.actor, 'edit');
        }
      }
      return;
    }
    if (resource.kind === 'group') {
      const majorEventId = asId(dataOf(resource)['majorEventId']) ?? snapshot.scope.majorEventId;
      if (snapshot.current) {
        await this.frozen.assertEventGroupMutable(resource.id, context.actor, 'edit');
      } else if (
        majorEventId &&
        (await context.tx.majorEvent.findFirst({ where: { id: majorEventId, deletedAt: null }, select: { id: true } }))
      ) {
        await this.frozen.assertMajorEventMutable(majorEventId, context.actor, 'edit');
      }
      return;
    }
    if (resource.kind === 'major-event') {
      if (snapshot.current) {
        await this.frozen.assertMajorEventMutable(resource.id, context.actor, 'edit');
      }
    }
  }

  async validate(snapshot: ResolvedTransferResource, context: TransferAdapterContext): Promise<void> {
    const data = dataOf(snapshot.resource);
    if (snapshot.resource.kind === 'event') {
      requireNameIfCreating(snapshot, data);
      if (snapshot.current === null) {
        requireDate(data, 'startDate');
        requireDate(data, 'endDate');
      }
      validateDateRange(data, snapshot.current, 'startDate', 'endDate');
      validateDateRange(data, snapshot.current, 'subscriptionStartDate', 'subscriptionEndDate');
      validateDateRange(data, snapshot.current, 'onlineAttendanceStartDate', 'onlineAttendanceEndDate');
      if (snapshot.current) {
        const previous = dataOf(snapshot.current);
        assertImmutableParent(data, previous, 'eventGroupId');
        assertImmutableParent(data, previous, 'majorEventId');
      } else {
        await this.validateNewEventGroupMajorEvent(data, context);
      }
      if (data['majorEventId'] !== undefined || data['regularAttendancePriceTierIds'] !== undefined) {
        await this.validateAttendancePriceTierReferences(
          context,
          data['majorEventId'] === undefined ? undefined : asId(data['majorEventId']),
          data['regularAttendancePriceTierIds'] === undefined
            ? undefined
            : stringList(data['regularAttendancePriceTierIds']),
          snapshot.current ? dataOf(snapshot.current) : undefined,
        );
      }
      validateLivestream(data, 'youtubeCode', normalizeYoutubeCode);
      validateLivestream(data, 'twitchChannel', normalizeTwitchChannel);
    } else if (snapshot.resource.kind === 'group') {
      requireNameIfCreating(snapshot, data);
      if (snapshot.current) assertImmutableParent(data, dataOf(snapshot.current), 'majorEventId');
      await this.planCertificateChildren(snapshot as EventTreeSnapshot, context);
    } else if (snapshot.resource.kind === 'major-event') {
      requireNameIfCreating(snapshot, data);
      if (snapshot.current === null) {
        requireDate(data, 'startDate');
        requireDate(data, 'endDate');
      }
      validateDateRange(data, snapshot.current, 'startDate', 'endDate');
      validateDateRange(data, snapshot.current, 'subscriptionStartDate', 'subscriptionEndDate');
    }
  }

  private async planCertificateChildren(snapshot: EventTreeSnapshot, context: TransferAdapterContext): Promise<void> {
    const data = dataOf(snapshot.resource);
    const fields = [
      'shouldIssueCertificate',
      'shouldIssueCertificateForNonPayingAttendees',
      'shouldIssueCertificateForNonSubscribedAttendees',
    ] as const;
    const patch: Record<string, boolean> = Object.fromEntries(
      fields.filter((field) => data[field] === false).map((field) => [field, false]),
    );
    if (!snapshot.current || Object.keys(patch).length === 0) return;
    const children = await context.tx.event.findMany({
      where: {
        eventGroupId: snapshot.resource.id,
        deletedAt: null,
        OR: fields.filter((field) => patch[field] === false).map((field) => ({ [field]: true })),
      },
      select: EVENT_SELECT,
      orderBy: { id: 'asc' },
      take: TRANSFER_MAX_RESOURCES + 1,
    });
    if (children.length > TRANSFER_MAX_RESOURCES)
      throw new TransferValidationException(
        'Este grupo afeta mais de 500 eventos. Divida a alteração em contextos menores.',
      );
    const affected = children.filter((child) =>
      fields.some((field) => patch[field] === false && child[field] !== false),
    );
    const importedIds = new Set(
      context.document.resources.filter((entry) => entry.kind === 'event').map((entry) => entry.id),
    );
    snapshot.dependencies = affected
      .filter((child) => importedIds.has(child.id))
      .map((child) => ({ kind: 'event', id: child.id }));
    const cascades: ResolvedTransferResource[] = [];
    for (const child of affected) {
      if (importedIds.has(child.id)) continue;
      if (child.sportsMatch)
        throw new TransferValidationException(
          'O grupo contém uma partida gerenciada por esportes. Altere os certificados pelo contexto esportivo.',
        );
      const childSnapshot = await this.resolve({ kind: 'event', id: child.id, data: patch }, context);
      if (!childSnapshot.current)
        throw new ConflictException('Um evento filho mudou durante a revisão. Revise novamente.');
      await this.assertRead(childSnapshot, context);
      await this.assertWrite(childSnapshot, 'update', context);
      await this.assertMutable(childSnapshot, 'edit', context);
      await this.validate(childSnapshot, context);
      cascades.push(childSnapshot);
    }
    snapshot.certificateChildren = cascades;
    snapshot.relatedRevisions = cascades.map((child) => ({
      kind: 'event',
      id: child.resource.id,
      revision: child.revision,
    }));
    const childSettings = (child: ResolvedTransferResource, proposed: boolean): JsonValue => {
      const current = child.current;
      if (current?.kind !== 'event' || child.resource.kind !== 'event')
        throw new ConflictException('O evento filho não está disponível. Revise novamente.');
      const settings = proposed ? { ...current.data, ...child.resource.data } : current.data;
      return {
        id: current.id,
        nome: current.data.name ?? 'Evento',
        'Emitir certificados': settings.shouldIssueCertificate ?? false,
        'Participantes não pagantes': settings.shouldIssueCertificateForNonPayingAttendees ?? false,
        'Participantes sem inscrição': settings.shouldIssueCertificateForNonSubscribedAttendees ?? false,
      };
    };
    snapshot.additionalChanges = cascades.length
      ? [
          {
            field: 'Certificados dos eventos filhos',
            before: cascades.map((child) => childSettings(child, false)),
            after: cascades.map((child) => childSettings(child, true)),
          },
        ]
      : [];
  }

  private async validateAttendancePriceTierReferences(
    context: TransferAdapterContext,
    requestedMajorEventId: string | null | undefined,
    requestedTierIds: string[] | null | undefined,
    currentData?: Record<string, unknown>,
  ): Promise<void> {
    if (requestedTierIds === null) {
      throw new TransferValidationException(
        'Informe uma lista de faixas de preço; use uma lista vazia para aceitar todas.',
      );
    }
    const currentTierIds = currentData?.['regularAttendancePriceTierIds'];
    const ids = requestedTierIds ?? (currentTierIds === undefined ? [] : (stringList(currentTierIds) ?? []));
    if (ids.length === 0) return;
    const majorEventId =
      requestedMajorEventId === undefined ? asId(currentData?.['majorEventId']) : requestedMajorEventId;
    if (!majorEventId) {
      throw new TransferValidationException('Vincule o evento a um grande evento para selecionar faixas de preço.');
    }
    const existingPrice = await context.tx.majorEventPrice.findFirst({
      where: { majorEventId },
      select: { id: true },
    });
    const priceIds = new Set<string>(existingPrice ? [existingPrice.id] : []);
    for (const resource of context.document.resources) {
      if (resource.kind === 'major-event-price' && dataOf(resource)['majorEventId'] === majorEventId)
        priceIds.add(resource.id);
    }
    const existingTiers = await context.tx.priceTier.findMany({
      where: { id: { in: ids }, price: { majorEventId } },
      select: { id: true },
    });
    const availableIds = new Set(existingTiers.map(({ id }) => id));
    for (const resource of context.document.resources) {
      if (resource.kind === 'price-tier' && priceIds.has(String(dataOf(resource)['priceId'])))
        availableIds.add(resource.id);
    }
    if (ids.some((id) => !availableIds.has(id))) {
      throw new TransferValidationException('Selecione apenas faixas de preço do grande evento vinculado.');
    }
  }

  private async proposedGroupCanonicalization(
    data: Record<string, unknown>,
    context: TransferAdapterContext,
  ): Promise<{ eventGroupId: string; majorEventId: string } | null> {
    const eventGroupId = asId(data['eventGroupId']);
    const majorEventId = asId(data['majorEventId']);
    if (!eventGroupId || !majorEventId) return null;
    const group = await context.tx.eventGroup.findFirst({
      where: { id: eventGroupId, deletedAt: null },
      select: { id: true, majorEventId: true },
    });
    return group && group.majorEventId === null ? { eventGroupId, majorEventId } : null;
  }

  private async validateNewEventGroupMajorEvent(
    data: Record<string, unknown>,
    context: TransferAdapterContext,
  ): Promise<void> {
    const eventGroupId = asId(data['eventGroupId']);
    if (!eventGroupId) return;
    const eventMajorEventId = asId(data['majorEventId']) ?? null;
    const existingGroup = await context.tx.eventGroup.findFirst({
      where: { id: eventGroupId, deletedAt: null },
      select: { id: true, majorEventId: true },
    });
    if (existingGroup) {
      if (existingGroup.majorEventId !== null && existingGroup.majorEventId !== eventMajorEventId) {
        throw new TransferValidationException('O grande evento do evento deve corresponder ao grande evento do grupo.');
      }
      const siblings = await this.groupChildMajorEventIds(eventGroupId, context);
      const existingMajorEventIds = new Set(siblings.map(({ majorEventId }) => majorEventId));
      const siblingMajorEventId = siblings[0]?.majorEventId ?? null;
      if (
        existingMajorEventIds.size > 1 ||
        (siblings.length > 0 && siblingMajorEventId !== (existingGroup.majorEventId ?? eventMajorEventId))
      ) {
        throw new TransferValidationException('Os eventos deste grupo precisam pertencer ao mesmo grande evento.');
      }
      return;
    }
    const proposedGroup = context.document.resources.find(
      (resource) => resource.kind === 'group' && resource.id === eventGroupId,
    );
    if (!proposedGroup) {
      throw new TransferValidationException('O grupo pai do evento não existe no destino nem no arquivo.');
    }
    const groupMajorEventId = asId(dataOf(proposedGroup)['majorEventId']) ?? null;
    if (groupMajorEventId !== eventMajorEventId) {
      throw new TransferValidationException('Informe o mesmo grande evento no novo grupo e em seus eventos.');
    }
  }

  private async groupChildMajorEventIds(
    eventGroupId: string,
    context: TransferAdapterContext,
  ): Promise<Array<{ majorEventId: string | null }>> {
    return audienceContext.run({ ...ANONYMOUS_AUDIENCE, bypass: true }, () =>
      context.tx.event.findMany({
        where: { eventGroupId, deletedAt: null },
        select: { majorEventId: true },
        distinct: ['majorEventId'],
        take: 2,
      }),
    );
  }

  async apply(snapshot: ResolvedTransferResource, action: TransferWriteAction, context: TransferAdapterContext) {
    const resource = snapshot.resource;
    if (resource.kind === 'event') {
      return this.applyEvent(snapshot, action, context);
    }
    if (resource.kind === 'group') {
      return this.applyGroup(snapshot, action, context);
    }
    if (resource.kind === 'major-event') {
      return this.applyMajorEvent(snapshot, action, context);
    }
    throw new TransferValidationException('Tipo de recurso incompatível com o adaptador de eventos.');
  }

  async exportTarget(
    target: TransferTarget,
    options: Omit<TransferExportRequest, 'target'>,
    context: TransferAdapterContext,
  ): Promise<TransferAdapterExportResult> {
    const resources: TransferResource[] = [];
    const issues: TransferAdapterExportResult['issues'] = [];
    const eventGroups = new Map<string, EventGroupRecord>();
    const events = new Map<string, EventRecord>();
    let root: TransferResource | null = null;

    if (target.kind === 'event') {
      const event = await context.tx.event.findFirst({
        where: { id: target.id, deletedAt: null },
        select: EVENT_SELECT,
      });
      if (!event) {
        throw new NotFoundException('O recurso não está disponível para exportação.');
      }
      await this.authorization.assertPermissions(context.actor, [Permission.Event.Read], { eventId: event.id });
      if (!event.sportsMatch) {
        root = eventResource(event);
      }
      if (options.includeConfiguration && !event.sportsMatch) {
        events.set(event.id, event);
      }
    } else if (target.kind === 'group') {
      const group = await context.tx.eventGroup.findFirst({
        where: { id: target.id, deletedAt: null },
        select: EVENT_GROUP_SELECT,
      });
      if (!group) {
        throw new NotFoundException('O recurso não está disponível para exportação.');
      }
      await this.authorization.assertPermissions(context.actor, [Permission.EventGroup.Read], {
        eventGroupId: group.id,
      });
      if (!group.sportsCategory) {
        root = groupResource(group);
      }
      if (options.includeDescendants) {
        const children = await context.tx.event.findMany({
          where: { eventGroupId: group.id, deletedAt: null },
          select: EVENT_SELECT,
          orderBy: [{ startDate: 'asc' }, { id: 'asc' }],
        });
        for (const event of children) {
          events.set(event.id, event);
        }
      }
      if (!root && !group.sportsCategory) {
        root = groupResource(group);
      }
    } else {
      const majorEvent = await context.tx.majorEvent.findFirst({
        where: { id: target.id, deletedAt: null },
        select: MAJOR_EVENT_SELECT,
      });
      if (!majorEvent) {
        throw new NotFoundException('O recurso não está disponível para exportação.');
      }
      await this.authorization.assertPermissions(context.actor, [Permission.MajorEvent.Read], {
        majorEventId: majorEvent.id,
      });
      root = majorEventResource(majorEvent);
      if (options.includeDescendants) {
        const groups = await context.tx.eventGroup.findMany({
          where: {
            deletedAt: null,
            OR: [
              { majorEventId: majorEvent.id },
              { events: { some: { majorEventId: majorEvent.id, deletedAt: null } } },
            ],
          },
          select: EVENT_GROUP_SELECT,
          orderBy: [{ name: 'asc' }, { id: 'asc' }],
        });
        for (const group of groups) {
          eventGroups.set(group.id, group);
        }
        const children = await context.tx.event.findMany({
          where: {
            deletedAt: null,
            OR: [{ majorEventId: majorEvent.id }, { eventGroup: { majorEventId: majorEvent.id, deletedAt: null } }],
          },
          select: EVENT_SELECT,
          orderBy: [{ startDate: 'asc' }, { id: 'asc' }],
        });
        for (const event of children) {
          events.set(event.id, event);
        }
      }
    }

    if (root) {
      resources.push(root);
    } else if (!resources.some((resource) => resource.kind === ROOT_KIND[target.kind] && resource.id === target.id)) {
      const sportOwnedRoot =
        target.kind === 'event'
          ? await context.tx.sportsMatch.findFirst({
              where: { eventId: target.id, deletedAt: null },
              select: { id: true },
            })
          : target.kind === 'group'
            ? await context.tx.sportsCategory.findFirst({
                where: { eventGroupId: target.id, deletedAt: null },
                select: { id: true },
              })
            : null;
      if (!sportOwnedRoot) {
        throw new NotFoundException('O recurso não está disponível para exportação.');
      }
    }

    for (const group of eventGroups.values()) {
      if (group.sportsCategory) {
        continue;
      }
      try {
        await this.authorization.assertPermissions(context.actor, [Permission.EventGroup.Read], {
          eventGroupId: group.id,
        });
        resources.push(groupResource(group));
      } catch (error: unknown) {
        if (!(error instanceof ForbiddenException || error instanceof NotFoundException)) throw error;
        issues.push({ kind: 'group', message: 'Um grupo foi omitido por falta de acesso.' });
      }
    }
    for (const event of events.values()) {
      if (event.sportsMatch) {
        continue;
      }
      try {
        await this.authorization.assertPermissions(context.actor, [Permission.Event.Read], { eventId: event.id });
        resources.push(eventResource(event));
      } catch (error: unknown) {
        if (!(error instanceof ForbiddenException || error instanceof NotFoundException)) throw error;
        issues.push({ kind: 'event', message: 'Um evento foi omitido por falta de acesso.' });
      }
    }
    return { resources, issues };
  }

  private snapshot(
    resource: TransferResource,
    current: TransferResource | null,
    revision: Date | null | undefined,
    scope: ResolvedTransferResource['scope'],
    extra: Partial<
      Pick<ResolvedTransferResource, 'skip' | 'ownedBy' | 'additionalChanges' | 'dependencies' | 'writeDependencies'>
    > = {},
  ): ResolvedTransferResource {
    return {
      resource,
      current,
      revision: revision?.toISOString() ?? null,
      scope,
      dependencies: [],
      ...extra,
    };
  }

  private async resolveEventParent(
    data: Record<string, unknown>,
    context: TransferAdapterContext,
  ): Promise<{ majorEventId?: string | null }> {
    const groupId = asId(data['eventGroupId']);
    if (!groupId) {
      return {};
    }
    const group = await context.tx.eventGroup.findFirst({
      where: { id: groupId, deletedAt: null },
      select: { majorEventId: true },
    });
    if (group) {
      if (group.majorEventId !== null) return group;
      const siblings = await this.groupChildMajorEventIds(groupId, context);
      const majorEventIds = new Set(siblings.map(({ majorEventId }) => majorEventId));
      if (majorEventIds.size > 1) {
        throw new TransferValidationException('Os eventos deste grupo precisam pertencer ao mesmo grande evento.');
      }
      return { majorEventId: siblings[0]?.majorEventId ?? null };
    }
    const groupResource = context.document.resources.find(
      (resource) => resource.kind === 'group' && resource.id === groupId,
    );
    const majorEventId = groupResource ? asId(dataOf(groupResource)['majorEventId']) : null;
    return { majorEventId };
  }

  private matchOwner(eventId: string, document: ResolvedTransferDocument) {
    const match = document.resources.find(
      (resource) => resource.kind === 'sports-match' && dataOf(resource)['eventId'] === eventId,
    );
    return match ? { kind: 'sports-match' as const, id: match.id } : undefined;
  }

  private categoryOwner(eventGroupId: string, document: ResolvedTransferDocument) {
    const category = document.resources.find(
      (resource) => resource.kind === 'sports-category' && dataOf(resource)['eventGroupId'] === eventGroupId,
    );
    return category ? { kind: 'sports-category' as const, id: category.id } : undefined;
  }

  private async parentReadRequirements(
    resource: TransferResource,
    context: TransferAdapterContext,
  ): Promise<Array<{ permission: Permission; scope: Record<string, string> }>> {
    const data = dataOf(resource);
    if (resource.kind === 'event') {
      const groupId = asId(data['eventGroupId']);
      const majorEventId = asId(data['majorEventId']);
      const parents: Array<{ permission: Permission; scope: Record<string, string> }> = [];
      if (groupId) {
        const groupInDocument = context.document.resources.find((item) => item.kind === 'group' && item.id === groupId);
        const groupExists = await context.tx.eventGroup.findFirst({
          where: { id: groupId, deletedAt: null },
          select: { id: true },
        });
        if (groupExists) {
          parents.push({ permission: Permission.EventGroup.Read, scope: { eventGroupId: groupId } });
        } else {
          if (!groupInDocument)
            throw new TransferValidationException('O grupo pai do evento não existe no destino nem no arquivo.');
          const groupMajorEventId = asId(dataOf(groupInDocument)['majorEventId']) ?? majorEventId;
          if (groupMajorEventId) {
            const majorEventExists = await context.tx.majorEvent.findFirst({
              where: { id: groupMajorEventId, deletedAt: null },
              select: { id: true },
            });
            if (majorEventExists)
              parents.push({ permission: Permission.MajorEvent.Read, scope: { majorEventId: groupMajorEventId } });
            else if (
              !context.document.resources.some((item) => item.kind === 'major-event' && item.id === groupMajorEventId)
            ) {
              throw new TransferValidationException(
                'O grande evento pai do grupo não existe no destino nem no arquivo.',
              );
            }
          }
        }
      }
      if (majorEventId) {
        const majorEventExists = await context.tx.majorEvent.findFirst({
          where: { id: majorEventId, deletedAt: null },
          select: { id: true },
        });
        if (majorEventExists) parents.push({ permission: Permission.MajorEvent.Read, scope: { majorEventId } });
        else {
          const majorEventInDocument = context.document.resources.some(
            (item) => item.kind === 'major-event' && item.id === majorEventId,
          );
          if (!majorEventInDocument)
            throw new TransferValidationException(
              'O grande evento pai do evento não existe no destino nem no arquivo.',
            );
          parents.push({ permission: readPermission(resource.kind), scope: {} });
        }
      }
      if (parents.length > 0) return uniqueParentReads(parents);
      if (groupId || majorEventId) return [{ permission: readPermission(resource.kind), scope: {} }];
      return [];
    }
    if (resource.kind === 'group') {
      const majorEventId = asId(data['majorEventId']);
      if (!majorEventId) return [];
      const majorEventExists = await context.tx.majorEvent.findFirst({
        where: { id: majorEventId, deletedAt: null },
        select: { id: true },
      });
      if (majorEventExists) return [{ permission: Permission.MajorEvent.Read, scope: { majorEventId } }];
      const majorEventInDocument = context.document.resources.some(
        (item) => item.kind === 'major-event' && item.id === majorEventId,
      );
      if (!majorEventInDocument)
        throw new TransferValidationException('O grande evento pai do grupo não existe no destino nem no arquivo.');
      return [{ permission: readPermission(resource.kind), scope: {} }];
    }
    return [];
  }

  private async parentWriteScopes(
    resource: TransferResource,
    context: TransferAdapterContext,
  ): Promise<Array<Record<string, string>>> {
    const data = dataOf(resource);
    if (resource.kind === 'event') {
      const groupId = asId(data['eventGroupId']);
      const majorEventId = asId(data['majorEventId']);
      const scopes: Array<Record<string, string>> = [];
      if (groupId) {
        const groupInDocument = context.document.resources.find((item) => item.kind === 'group' && item.id === groupId);
        const groupExists = await context.tx.eventGroup.findFirst({
          where: { id: groupId, deletedAt: null },
          select: { id: true },
        });
        if (groupInDocument && !groupExists) {
          const groupMajorEventId = asId(dataOf(groupInDocument)['majorEventId']) ?? majorEventId;
          if (groupMajorEventId) {
            const majorEventExists = await context.tx.majorEvent.findFirst({
              where: { id: groupMajorEventId, deletedAt: null },
              select: { id: true },
            });
            if (majorEventExists) scopes.push({ majorEventId: groupMajorEventId });
            else if (
              !context.document.resources.some((item) => item.kind === 'major-event' && item.id === groupMajorEventId)
            ) {
              throw new TransferValidationException(
                'O grande evento pai do grupo não existe no destino nem no arquivo.',
              );
            }
          }
        } else if (groupExists) {
          scopes.push({ eventGroupId: groupId });
        } else {
          throw new TransferValidationException('O grupo pai do evento não existe no destino nem no arquivo.');
        }
      }
      if (majorEventId) {
        const majorEventExists = await context.tx.majorEvent.findFirst({
          where: { id: majorEventId, deletedAt: null },
          select: { id: true },
        });
        if (majorEventExists) scopes.push({ majorEventId });
        else if (!context.document.resources.some((item) => item.kind === 'major-event' && item.id === majorEventId)) {
          throw new TransferValidationException('O grande evento pai do evento não existe no destino nem no arquivo.');
        }
      }
      return uniqueScopes(scopes);
    }
    if (resource.kind === 'group') {
      const majorEventId = asId(data['majorEventId']);
      if (!majorEventId) return [];
      const majorEventExists = await context.tx.majorEvent.findFirst({
        where: { id: majorEventId, deletedAt: null },
        select: { id: true },
      });
      if (majorEventExists) return [{ majorEventId }];
      if (context.document.resources.some((item) => item.kind === 'major-event' && item.id === majorEventId)) return [];
      throw new TransferValidationException('O grande evento pai do grupo não existe no destino nem no arquivo.');
    }
    return [];
  }

  private async applyEvent(
    snapshot: ResolvedTransferResource,
    action: TransferWriteAction,
    context: TransferAdapterContext,
  ) {
    const resource = snapshot.resource;
    const raw = dataOf(resource);
    const input = omitAudience(raw);
    const actorId = context.actor.sub;
    if (action === 'create') {
      const createData = mapPrismaData(input, EVENT_FIELDS, DATE_FIELDS);
      const normalized = normalizeEventData(createData, true);
      await this.validateAttendancePriceTierReferences(
        context,
        input['majorEventId'] === undefined ? undefined : asId(input['majorEventId']),
        input['regularAttendancePriceTierIds'] === undefined
          ? undefined
          : stringList(input['regularAttendancePriceTierIds']),
      );
      const actor = actorId;
      const event = await context.tx.event.create({
        data: {
          id: resource.id,
          ...normalized,
          createdById: actor,
          updatedById: actor,
        } as Prisma.EventUncheckedCreateInput,
        select: EVENT_SELECT,
      });
      const audienceChange: AudienceChange | undefined = await applyAudienceSettings(
        context.tx,
        this.invitations,
        { targetType: 'EVENT', targetId: event.id },
        raw as never,
        undefined,
        actor,
      );
      const created = audienceChange
        ? await context.tx.event.findUniqueOrThrow({ where: { id: event.id }, select: EVENT_SELECT })
        : event;
      await syncEventGroupMajorEvent(context.tx, [created.eventGroupId]);
      await this.audit.record(
        {
          entityType: AuditLogEntityType.EVENT,
          entityId: created.id,
          entityLabel: created.name,
          operation: AuditLogOperation.CREATE,
          actor: context.actor,
          after: eventContentAuditSnapshot(created),
          scope: {
            permission: Permission.Event.Create,
            eventId: created.id,
            majorEventId: created.majorEventId,
            eventGroupId: created.eventGroupId,
          },
          summary: 'Evento criado por transferência de dados.',
        },
        context.tx,
      );
      return { postCommitEffects: [() => this.postCommit.syncEvent(created.id)] };
    }

    const before = await context.tx.event.findFirst({
      where: { id: resource.id, deletedAt: null },
      select: EVENT_SELECT,
    });
    if (!before || !snapshot.revision || before.updatedAt.toISOString() !== snapshot.revision) {
      throw new ConflictException('O evento mudou desde a prévia. Gere uma nova prévia.');
    }
    const createData = mapPrismaData(input, EVENT_FIELDS, DATE_FIELDS);
    const normalized = normalizeEventData(createData, false);
    const previousAudit = eventContentAuditSnapshot(before);
    if (normalized['endDate'] instanceof Date) {
      await this.ticketIssuance.lockEventExpirationAlignment(context.tx, resource.id, 'UPDATE');
    }
    await this.sportsLifecycle.assertEventUpdateAllowed(context.tx, resource.id, input as never);
    await this.validateAttendancePriceTierReferences(
      context,
      input['majorEventId'] === undefined ? undefined : asId(input['majorEventId']),
      input['regularAttendancePriceTierIds'] === undefined
        ? undefined
        : stringList(input['regularAttendancePriceTierIds']),
      eventResource(before).data as unknown as Record<string, unknown>,
    );
    const updatedCount = await context.tx.event.updateMany({
      where: { id: resource.id, deletedAt: null, updatedAt: new Date(snapshot.revision) },
      data: {
        ...normalized,
        updatedById: actorId,
      } as Prisma.EventUpdateManyMutationInput,
    });
    if (updatedCount.count !== 1) {
      throw new ConflictException('O evento mudou desde a prévia. Gere uma nova prévia.');
    }
    const audienceChange: AudienceChange | undefined =
      raw['audience'] !== undefined || raw['audienceCourseCodes'] !== undefined
        ? await applyAudienceSettings(
            context.tx,
            this.invitations,
            { targetType: 'EVENT', targetId: resource.id },
            raw as never,
            before,
            actorId,
          )
        : undefined;
    const changedEndDate =
      normalized['endDate'] instanceof Date && normalized['endDate'].getTime() !== before.endDate.getTime();
    if (changedEndDate) {
      await this.ticketIssuance.alignActiveTicketExpirations(context.tx, resource.id, {
        scope: 'EVENT_END_ONLY',
        actorUserId: actorId ?? null,
        permission: Permission.Event.Update,
      });
    }
    const updated = await context.tx.event.findUniqueOrThrow({ where: { id: resource.id }, select: EVENT_SELECT });
    const previousData = {
      attendanceEligibility: before.attendanceEligibility,
      majorEventId: before.majorEventId,
      eventGroupId: before.eventGroupId,
      regularAttendancePriceTierIds: before.regularAttendancePriceTierIds,
    };
    const updateData = {
      attendanceEligibility: updated.attendanceEligibility,
      majorEventId: updated.majorEventId,
      eventGroupId: updated.eventGroupId,
      regularAttendancePriceTierIds: updated.regularAttendancePriceTierIds,
    };
    if (
      audienceChange ||
      normalized['attendanceEligibility'] !== undefined ||
      normalized['eventGroupId'] !== undefined ||
      normalized['majorEventId'] !== undefined ||
      attendancePriceTierPolicyChanged(updateData, previousData)
    ) {
      await this.attendanceCategories.refreshForEvent(resource.id, context.tx);
    }
    await this.audit.record(
      {
        entityType: AuditLogEntityType.EVENT,
        entityId: updated.id,
        entityLabel: updated.name,
        operation: AuditLogOperation.UPDATE,
        actor: context.actor,
        before: previousAudit,
        after: eventContentAuditSnapshot(updated),
        scope: {
          permission: Permission.Event.Update,
          eventId: updated.id,
          majorEventId: updated.majorEventId,
          eventGroupId: updated.eventGroupId,
        },
        summary: 'Evento atualizado por transferência de dados.',
      },
      context.tx,
    );
    return {
      postCommitEffects: [
        () => this.postCommit.syncEvent(updated.id),
        ...(normalized['shouldCollectAttendance'] !== undefined ||
        normalized['isOnlineAttendanceAllowed'] !== undefined ||
        normalized['onlineAttendanceStartDate'] !== undefined ||
        normalized['onlineAttendanceEndDate'] !== undefined ||
        audienceChange?.invitationsChanged
          ? [() => this.attendanceRealtime.notifyAllConnectedPeople()]
          : []),
      ],
    };
  }

  private async applyGroup(
    snapshot: ResolvedTransferResource,
    action: TransferWriteAction,
    context: TransferAdapterContext,
  ) {
    const resource = snapshot.resource;
    const raw = dataOf(resource);
    const input = omitAudience(raw);
    const actorId = context.actor.sub;
    const normalized = normalizeGroupData(mapPrismaData(input, EVENT_GROUP_FIELDS, DATE_FIELDS));
    if (action === 'create') {
      let group = await context.tx.eventGroup.create({
        data: {
          id: resource.id,
          ...normalized,
          createdById: actorId,
          updatedById: actorId,
        } as Prisma.EventGroupUncheckedCreateInput,
      });
      const audienceChange: AudienceChange | undefined =
        raw['audience'] !== undefined || raw['audienceCourseCodes'] !== undefined
          ? await applyAudienceSettings(
              context.tx,
              this.invitations,
              { targetType: 'EVENT_GROUP', targetId: group.id },
              raw as never,
              undefined,
              actorId,
            )
          : undefined;
      if (audienceChange) {
        group = await context.tx.eventGroup.findUniqueOrThrow({ where: { id: group.id } });
      }
      await this.audit.record(
        {
          entityType: AuditLogEntityType.EVENT_GROUP,
          entityId: group.id,
          entityLabel: group.name,
          operation: AuditLogOperation.CREATE,
          actor: context.actor,
          after: eventContentAuditSnapshot(group),
          scope: {
            permission: Permission.EventGroup.Create,
            eventGroupId: group.id,
            ...(group.majorEventId ? { majorEventId: group.majorEventId } : {}),
          },
          summary: 'Grupo de eventos criado por transferência de dados.',
        },
        context.tx,
      );
      return { postCommitEffects: [() => this.postCommit.syncEventGroup(group.id)] };
    }

    const previous = await context.tx.eventGroup.findFirst({ where: { id: resource.id, deletedAt: null } });
    if (!previous || !snapshot.revision || previous.updatedAt.toISOString() !== snapshot.revision) {
      throw new ConflictException('O grupo mudou desde a prévia. Gere uma nova prévia.');
    }
    const previousGroup = previous;
    await this.sportsLifecycle.synchronizeEventGroupUpdate(context.tx, resource.id, input as never);
    const previousAudit = eventContentAuditSnapshot(previousGroup);
    const updatedCount = await context.tx.eventGroup.updateMany({
      where: { id: resource.id, deletedAt: null, updatedAt: new Date(snapshot.revision) },
      data: { ...normalized, updatedById: actorId } as Prisma.EventGroupUpdateManyMutationInput,
    });
    if (updatedCount.count !== 1) {
      throw new ConflictException('O grupo mudou desde a prévia. Gere uma nova prévia.');
    }
    const audienceChange: AudienceChange | undefined =
      raw['audience'] !== undefined || raw['audienceCourseCodes'] !== undefined
        ? await applyAudienceSettings(
            context.tx,
            this.invitations,
            { targetType: 'EVENT_GROUP', targetId: resource.id },
            raw as never,
            previousGroup,
            actorId,
          )
        : undefined;
    const childEffects: Array<() => Promise<void>> = [];
    for (const child of (snapshot as EventTreeSnapshot).certificateChildren ?? []) {
      const result = await this.applyEvent(child, 'update', context);
      childEffects.push(...(result.postCommitEffects ?? []));
    }
    const updated = await context.tx.eventGroup.findUniqueOrThrow({ where: { id: resource.id, deletedAt: null } });
    if (normalized['attendanceEligibility'] !== undefined || audienceChange?.invitationsChanged) {
      const events = await context.tx.event.findMany({
        where: { eventGroupId: resource.id, deletedAt: null },
        select: { id: true },
      });
      for (const event of events) {
        await this.attendanceCategories.refreshForEvent(event.id, context.tx);
      }
    }
    await this.audit.record(
      {
        entityType: AuditLogEntityType.EVENT_GROUP,
        entityId: updated.id,
        entityLabel: updated.name,
        operation: AuditLogOperation.UPDATE,
        actor: context.actor,
        before: previousAudit,
        after: eventContentAuditSnapshot(updated),
        scope: { permission: Permission.EventGroup.Update, eventGroupId: updated.id },
        summary: 'Grupo de eventos atualizado por transferência de dados.',
      },
      context.tx,
    );
    return {
      postCommitEffects: [
        () => this.postCommit.syncEventGroup(updated.id),
        ...childEffects,
        ...(normalized['attendanceEligibility'] !== undefined || audienceChange?.invitationsChanged
          ? [() => this.attendanceRealtime.notifyAllConnectedPeople()]
          : []),
      ],
    };
  }

  private async applyMajorEvent(
    snapshot: ResolvedTransferResource,
    action: TransferWriteAction,
    context: TransferAdapterContext,
  ) {
    const resource = snapshot.resource;
    const raw = dataOf(resource);
    const input = omitAudience(raw);
    const actorId = context.actor.sub;
    const normalized = normalizeMajorEventData(mapPrismaData(input, MAJOR_EVENT_FIELDS, DATE_FIELDS));
    let before: MajorEventRecord | null = null;
    if (action === 'update') {
      before = await context.tx.majorEvent.findFirst({
        where: { id: resource.id, deletedAt: null },
        select: MAJOR_EVENT_SELECT,
      });
      if (!before || !snapshot.revision || before.updatedAt.toISOString() !== snapshot.revision) {
        throw new ConflictException('O grande evento mudou desde a prévia. Gere uma nova prévia.');
      }
    }
    if (action === 'create') {
      let created = await context.tx.majorEvent.create({
        data: {
          id: resource.id,
          ...normalized,
          ...(normalized['isPaymentRequired'] === true ? { shouldIssueCertificateForNonPayingAttendees: false } : {}),
          createdById: actorId,
          updatedById: actorId,
        } as Prisma.MajorEventUncheckedCreateInput,
        select: MAJOR_EVENT_SELECT,
      });
      if (raw['audience'] !== undefined || raw['audienceCourseCodes'] !== undefined) {
        await applyAudienceSettings(
          context.tx,
          this.invitations,
          { targetType: 'MAJOR_EVENT', targetId: resource.id },
          raw as never,
          undefined,
          actorId,
        );
        created = await context.tx.majorEvent.findUniqueOrThrow({
          where: { id: resource.id, deletedAt: null },
          select: MAJOR_EVENT_SELECT,
        });
      }
      await this.audit.record(
        {
          entityType: AuditLogEntityType.MAJOR_EVENT,
          entityId: created.id,
          entityLabel: created.name,
          operation: AuditLogOperation.CREATE,
          actor: context.actor,
          after: eventContentAuditSnapshot(created),
          scope: { permission: Permission.MajorEvent.Create, majorEventId: created.id },
          summary: 'Grande evento criado por transferência de dados.',
        },
        context.tx,
      );
      return {
        postCommitEffects: [() => this.syncMajorEvent(created.id)],
      };
    }
    if (!before) {
      throw new ConflictException('O grande evento mudou desde a prévia. Gere uma nova prévia.');
    }
    if (!snapshot.revision) {
      throw new ConflictException('O grande evento mudou desde a prévia. Gere uma nova prévia.');
    }
    const previous = before;
    const updatedCount = await context.tx.majorEvent.updateMany({
      where: { id: resource.id, deletedAt: null, updatedAt: new Date(snapshot.revision) },
      data: {
        ...normalized,
        ...(normalized['isPaymentRequired'] === true ? { shouldIssueCertificateForNonPayingAttendees: false } : {}),
        updatedById: actorId,
      } as Prisma.MajorEventUpdateManyMutationInput,
    });
    if (updatedCount.count !== 1) {
      throw new ConflictException('O grande evento mudou desde a prévia. Gere uma nova prévia.');
    }
    const audienceChange: AudienceChange | undefined =
      raw['audience'] !== undefined || raw['audienceCourseCodes'] !== undefined
        ? await applyAudienceSettings(
            context.tx,
            this.invitations,
            { targetType: 'MAJOR_EVENT', targetId: resource.id },
            raw as never,
            previous,
            actorId,
          )
        : undefined;
    const updated = await context.tx.majorEvent.findUniqueOrThrow({
      where: { id: resource.id, deletedAt: null },
      select: MAJOR_EVENT_SELECT,
    });
    if (normalized['attendanceEligibility'] !== undefined || audienceChange?.invitationsChanged) {
      const events = await context.tx.event.findMany({
        where: { majorEventId: resource.id, deletedAt: null },
        select: { id: true },
      });
      for (const event of events) {
        await this.attendanceCategories.refreshForEvent(event.id, context.tx);
      }
    }
    await this.audit.record(
      {
        entityType: AuditLogEntityType.MAJOR_EVENT,
        entityId: updated.id,
        entityLabel: updated.name,
        operation: AuditLogOperation.UPDATE,
        actor: context.actor,
        before: eventContentAuditSnapshot(previous),
        after: eventContentAuditSnapshot(updated),
        scope: { permission: Permission.MajorEvent.Update, majorEventId: updated.id },
        summary: 'Grande evento atualizado por transferência de dados.',
      },
      context.tx,
    );
    return {
      postCommitEffects: [
        () => this.syncMajorEvent(updated.id),
        ...(normalized['attendanceEligibility'] !== undefined || audienceChange?.invitationsChanged
          ? [() => this.attendanceRealtime.notifyAllConnectedPeople()]
          : []),
      ],
    };
  }

  private async syncMajorEvent(id: string): Promise<void> {
    const majorEvent = await this.prisma.majorEvent.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, name: true, description: true, startDate: true, endDate: true, publicationState: true },
    });
    if (!majorEvent) {
      return;
    }
    await Promise.all([
      this.sitemap.refresh(),
      this.typesense.upsertMajorEvent(majorEvent),
      this.realtime.publish(this.realtime.scope('admin-workspace'), {
        type: 'CATALOG_INVALIDATED',
        domain: 'major-event',
        occurredAt: new Date().toISOString(),
      }),
      this.realtime.publish(this.realtime.scope(PUBLIC_CATALOG_REALTIME_CHANNEL), createPublicCatalogInvalidation()),
    ]);
  }
}

function dataOf(resource: TransferResource): Record<string, unknown> {
  return resource.data as Record<string, unknown>;
}

function uniqueParentReads(
  values: readonly { permission: Permission; scope: Record<string, string> }[],
): Array<{ permission: Permission; scope: Record<string, string> }> {
  const unique = new Map(values.map((value) => [`${value.permission}:${JSON.stringify(value.scope)}`, value]));
  return [...unique.values()];
}

function uniqueScopes(values: readonly Record<string, string>[]): Array<Record<string, string>> {
  const unique = new Map(values.map((value) => [JSON.stringify(value), value]));
  return [...unique.values()];
}

function eventResource(record: EventRecord): TransferResource {
  return makeResource('event', record.id, record.updatedAt, record, EVENT_FIELDS);
}

function groupResource(record: EventGroupRecord): TransferResource {
  return makeResource('group', record.id, record.updatedAt, record, EVENT_GROUP_FIELDS);
}

function majorEventResource(record: MajorEventRecord): TransferResource {
  return makeResource('major-event', record.id, record.updatedAt, record, MAJOR_EVENT_FIELDS);
}

function makeResource<K extends 'event' | 'group' | 'major-event'>(
  kind: K,
  id: string,
  updatedAt: Date,
  record: Record<string, unknown>,
  fields: readonly string[],
): TransferResource {
  const data: Record<string, JsonValue> = {};
  for (const field of fields) {
    const value = record[field];
    if (value !== undefined) {
      data[field] = serializeJsonValue(value);
    }
  }
  return { kind, id, revision: updatedAt.toISOString(), data } as TransferResource;
}

function serializeJsonValue(value: unknown): JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number') {
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map(serializeJsonValue);
  }
  if (typeof value === 'object') {
    const result: Record<string, JsonValue> = {};
    for (const [key, child] of Object.entries(value)) {
      result[key] = serializeJsonValue(child);
    }
    return result;
  }
  throw new TransferValidationException('Este recurso contém um valor não portável.');
}

function mapPrismaData(
  data: Record<string, unknown>,
  allowedFields: readonly string[],
  dateFields: ReadonlySet<string>,
): Record<string, unknown> {
  const mapped: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (!Object.prototype.hasOwnProperty.call(data, field)) {
      continue;
    }
    const value = data[field];
    mapped[field] = dateFields.has(field) ? nullableDate(value, field) : value;
  }
  return mapped;
}

function omitAudience(data: Record<string, unknown>): Record<string, unknown> {
  const result = { ...data };
  delete result['audience'];
  delete result['audienceCourseCodes'];
  delete result['invitationPersonIds'];
  return result;
}

function normalizeEventData(data: Record<string, unknown>, applyCreateDefaults: boolean): Record<string, unknown> {
  const normalized = { ...data };
  if (normalized['name'] !== undefined) normalized['name'] = requiredName(normalized['name'], 'Evento');
  if (normalized['emoji'] !== undefined) normalized['emoji'] = stringValue(normalized['emoji'], 'emoji').trim() || '❔';
  if (applyCreateDefaults && normalized['type'] === undefined) normalized['type'] = 'OTHER';
  for (const key of ['youtubeCode', 'twitchChannel'] as const) {
    if (normalized[key] === undefined || normalized[key] === null) continue;
    const normalize = key === 'youtubeCode' ? normalizeYoutubeCode : normalizeTwitchChannel;
    const cleaned = normalize(String(normalized[key]));
    if (String(normalized[key]).trim() && !cleaned) {
      throw new TransferValidationException(`O campo ${key} não contém um link válido.`);
    }
    normalized[key] = cleaned;
  }
  if (normalized['shouldIssueCertificate'] === false) {
    normalized['shouldIssueCertificateForNonPayingAttendees'] = false;
    normalized['shouldIssueCertificateForNonSubscribedAttendees'] = false;
  }
  return normalized;
}

function normalizeEventResource(resource: TransferResource, creating: boolean): TransferResource {
  const data = dataOf(resource);
  return resourceWithNormalizedFields(
    resource,
    data,
    normalizeEventData(mapPrismaData(omitAudience(data), EVENT_FIELDS, DATE_FIELDS), creating),
  );
}

function normalizeGroupResource(resource: TransferResource): TransferResource {
  const data = dataOf(resource);
  return resourceWithNormalizedFields(
    resource,
    data,
    normalizeGroupData(mapPrismaData(omitAudience(data), EVENT_GROUP_FIELDS, DATE_FIELDS)),
  );
}

function normalizeMajorEventResource(resource: TransferResource): TransferResource {
  const data = dataOf(resource);
  return resourceWithNormalizedFields(
    resource,
    data,
    normalizeMajorEventData(mapPrismaData(omitAudience(data), MAJOR_EVENT_FIELDS, DATE_FIELDS)),
  );
}

function resourceWithNormalizedFields(
  resource: TransferResource,
  originalData: Record<string, unknown>,
  normalizedFields: Record<string, unknown>,
): TransferResource {
  const data = { ...originalData };
  for (const [field, value] of Object.entries(normalizedFields)) {
    data[field] = value instanceof Date ? value.toISOString() : value;
  }
  return { ...resource, data: data as JsonValue } as TransferResource;
}

function normalizeGroupData(data: Record<string, unknown>): Record<string, unknown> {
  const normalized = { ...data };
  if (normalized['name'] !== undefined) normalized['name'] = requiredName(normalized['name'], 'Grupo de eventos');
  if (normalized['emoji'] !== undefined) normalized['emoji'] = stringValue(normalized['emoji'], 'emoji').trim() || '❔';
  if (normalized['shouldIssueCertificate'] === false) {
    normalized['shouldIssueCertificateForNonPayingAttendees'] = false;
    normalized['shouldIssueCertificateForNonSubscribedAttendees'] = false;
    normalized['shouldIssueCertificateForEachEvent'] = false;
    normalized['shouldIssuePartialCertificate'] = false;
  }
  return normalized;
}

function normalizeMajorEventData(data: Record<string, unknown>): Record<string, unknown> {
  const normalized = { ...data };
  if (normalized['name'] !== undefined) normalized['name'] = requiredName(normalized['name'], 'Grande evento');
  if (normalized['emoji'] !== undefined) normalized['emoji'] = stringValue(normalized['emoji'], 'emoji').trim() || '📌';
  if (normalized['isPaymentRequired'] === true) normalized['shouldIssueCertificateForNonPayingAttendees'] = false;
  return normalized;
}

function requiredName(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new TransferValidationException(`${label}: informe um nome válido.`);
  }
  return value.trim();
}

function stringValue(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new TransferValidationException(`O campo ${field} deve ser um texto.`);
  }
  return value;
}

function nullableDate(value: unknown, field: string): Date | null {
  if (value === null) return null;
  if (typeof value !== 'string')
    throw new TransferValidationException(`O campo ${field} deve ser uma data ISO válida.`);
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()))
    throw new TransferValidationException(`O campo ${field} deve ser uma data ISO válida.`);
  return date;
}

function requireNameIfCreating(snapshot: ResolvedTransferResource, data: Record<string, unknown>): void {
  if (snapshot.current === null) requiredName(data['name'], 'Este recurso');
}

function requireDate(data: Record<string, unknown>, field: string): void {
  nullableDate(data[field], field);
  if (data[field] === null || data[field] === undefined) {
    throw new TransferValidationException(`Informe o campo obrigatório ${field}.`);
  }
}

function validateDateRange(
  data: Record<string, unknown>,
  current: TransferResource | null,
  startField: string,
  endField: string,
): void {
  const previous = current ? dataOf(current) : {};
  const start = nullableDate(
    data[startField] === undefined ? (previous[startField] ?? null) : data[startField],
    startField,
  );
  const end = nullableDate(data[endField] === undefined ? (previous[endField] ?? null) : data[endField], endField);
  if (start && end && start.getTime() >= end.getTime()) {
    const window =
      startField === 'subscriptionStartDate'
        ? 'das inscrições'
        : startField === 'onlineAttendanceStartDate'
          ? 'da presença online'
          : 'do evento';
    throw new TransferValidationException(
      `O término ${window} precisa ser posterior ao início. Corrija ${startField} e ${endField}.`,
    );
  }
}

function assertImmutableParent(data: Record<string, unknown>, current: Record<string, unknown>, field: string): void {
  if (data[field] !== undefined && data[field] !== current[field]) {
    throw new TransferValidationException('A transferência não pode alterar o vínculo pai de um recurso existente.');
  }
}

function validateLivestream(
  data: Record<string, unknown>,
  field: 'youtubeCode' | 'twitchChannel',
  normalize: (value: string) => string | null,
): void {
  if (data[field] === undefined || data[field] === null) return;
  const value = stringValue(data[field], field);
  if (value.trim() && !normalize(value)) {
    throw new TransferValidationException(`O campo ${field} não contém um link válido.`);
  }
}

function stringList(value: unknown): string[] | null {
  if (value === null) return null;
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new TransferValidationException('Uma lista de identificadores é inválida.');
  }
  return value as string[];
}

function asId(value: unknown): string | null | undefined {
  return value === null ? null : typeof value === 'string' ? value : undefined;
}

function readPermission(kind: TransferResourceKind): Permission {
  if (kind === 'event') return Permission.Event.Read;
  if (kind === 'group') return Permission.EventGroup.Read;
  if (kind === 'major-event') return Permission.MajorEvent.Read;
  throw new TransferValidationException('Tipo de recurso incompatível.');
}

function createPermission(kind: TransferResourceKind): Permission {
  if (kind === 'event') return Permission.Event.Create;
  if (kind === 'group') return Permission.EventGroup.Create;
  if (kind === 'major-event') return Permission.MajorEvent.Create;
  throw new TransferValidationException('Tipo de recurso incompatível.');
}

function updatePermission(kind: TransferResourceKind): Permission {
  if (kind === 'event') return Permission.Event.Update;
  if (kind === 'group') return Permission.EventGroup.Update;
  if (kind === 'major-event') return Permission.MajorEvent.Update;
  throw new TransferValidationException('Tipo de recurso incompatível.');
}
