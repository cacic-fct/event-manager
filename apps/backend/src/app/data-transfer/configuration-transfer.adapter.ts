import { TransferValidationException } from './transfer-validation.exception';
import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AuditLogEntityType,
  AuditLogOperation,
  CertificateIssuedTo,
  CertificateScope,
  Prisma,
  TicketExpirationMode,
  TicketSubscriptionRequirement,
} from '@prisma/client';
import { Permission } from '@cacic-fct/shared-permissions';
import { createHash } from 'node:crypto';
import type {
  JsonValue,
  TransferExportRequest,
  TransferResource,
  TransferResourceKind,
  TransferTarget,
} from '@cacic-fct/shared-data-transfer';
import type {
  DataTransferAdapter,
  ResolvedTransferResource,
  TransferAdapterApplyResult,
  TransferAdapterContext,
  TransferAdapterExportResult,
  TransferAuthorizationScope,
  TransferWriteAction,
} from './data-transfer-adapter';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuthorizationPolicyService } from '../authorization/authorization-policy.service';
import { FrozenResourceService } from '../common/frozen-resource.service';
import { AttendanceCategoryService } from '../events/attendance-category.service';
import { normalizeAttendancePriceTier } from '../events/attendance-price-tier-policy';
import { PrismaService } from '../prisma/prisma.service';
import { EventSitemapService } from '../public-events/event-sitemap.service';
import { TypesenseSearchService } from '../search/typesense-search.service';
import { RealtimeInvalidationService } from '../realtime/realtime-invalidation.service';
import {
  PUBLIC_CATALOG_REALTIME_CHANNEL,
  createPublicCatalogInvalidation,
} from '../realtime/public-catalog-invalidation';
import { TicketIssuanceService } from '../tickets/ticket-issuance.service';
import { TicketRealtimeService } from '../tickets/ticket-realtime.service';
import { CertificateTargetsService } from '../certificate/certificate-targets.service';
import { CertificateValidationService } from '../certificate/certificate-validation.service';
import {
  isAutomaticSportsCertificateIssuedTo,
  sportsCertificateTypeLabel,
} from '../certificate/certificate-sports-roles';
import { PersonTransferMatcherService, type TransferPersonReference } from './person-transfer-matcher.service';
import { assertQuestionsHaveTitles, parseElementsJson } from '../event-forms/event-form-answer-normalization';

const FORM_FIELDS = [
  'ownerEventId',
  'ownerMajorEventId',
  'name',
  'description',
  'elements',
  'sigilo',
  'responseMode',
  'resultsPublic',
  'resultsLive',
  'allowResponseEdits',
] as const;
const LINK_FIELDS = [
  'formId',
  'targetType',
  'eventId',
  'majorEventId',
  'audiences',
  'insertInSubscriptionFlow',
  'requiredInSubscriptionFlow',
  'displayOrder',
  'availableFrom',
  'availableUntil',
  'notifyOnPublish',
  'allowLecturerManualPublish',
] as const;
const CERTIFICATE_FIELDS = [
  'name',
  'scope',
  'eventId',
  'eventGroupId',
  'majorEventId',
  'certificateTemplateId',
  'certificateText',
  'shouldAutofillSecondPage',
  'secondPageText',
  'isActive',
  'issuedTo',
  'certificateTypeLabel',
  'paymentTiers',
  'attendeeEligibility',
  'certificateFields',
] as const;
const TICKET_CONFIG_FIELDS = [
  'eventId',
  'enabled',
  'displayName',
  'displayEmoji',
  'description',
  'transferEligibilityDescription',
  'transferable',
  'issueOnEventSubscription',
  'issueOnMajorEventSubscription',
  'includedPriceTierIds',
  'recipientSubscriptionRequirement',
  'recipientRequiresUnesp',
  'recipientAcademicIdPrefixes',
  'recipientCourseCodes',
  'recipientRequiresAccountManagerVerification',
  'recipientAllowedPriceTierIds',
  'purchaseEnabled',
  'purchaseLimit',
  'purchaseRequiresUnesp',
  'purchaseAcademicIdPrefixes',
  'purchaseCourseCodes',
  'purchaseRequiresAccountManagerVerification',
  'purchaseVisiblePriceTierIds',
  'expirationMode',
  'customExpiresAt',
] as const;
const PRICE_TIER_FIELDS = [
  'priceId',
  'name',
  'value',
  'includesEventRegistration',
  'includesSportsRegistration',
  'restrictEventSelection',
  'allowedEventIds',
  'customizeSubscriptionLimits',
  'maxCoursesPerAttendee',
  'maxLecturesPerAttendee',
  'maxUncategorizedPerAttendee',
] as const;
const PRICE_FIELDS = ['majorEventId', 'type'] as const;
const PLACE_FIELDS = ['name', 'latitude', 'longitude', 'locationDescription', 'internalNotes'] as const;
const TICKET_OPTION_FIELDS = ['ticketConfigId', 'priceTierId', 'label', 'amountCents'] as const;
const FORM_DATES = new Set(['availableFrom', 'availableUntil']);
const CERTIFICATE_DATE_FIELDS = new Set<string>();
const TICKET_DATE_FIELDS = new Set(['customExpiresAt']);

const FORM_SELECT = {
  id: true,
  updatedAt: true,
  deletedAt: true,
  name: true,
  description: true,
  elements: true,
  ownerEventId: true,
  ownerMajorEventId: true,
  sigilo: true,
  responseMode: true,
  resultsPublic: true,
  resultsLive: true,
  allowResponseEdits: true,
  descriptionImages: true,
} satisfies Prisma.EventFormSelect;
const LINK_SELECT = {
  id: true,
  updatedAt: true,
  deletedAt: true,
  formId: true,
  targetType: true,
  eventId: true,
  majorEventId: true,
  audiences: true,
  insertInSubscriptionFlow: true,
  requiredInSubscriptionFlow: true,
  displayOrder: true,
  availableFrom: true,
  availableUntil: true,
  notifyOnPublish: true,
  allowLecturerManualPublish: true,
  lastNotifiedAt: true,
  form: { select: { ownerEventId: true, ownerMajorEventId: true } },
  priceTiers: { select: { priceTierId: true } },
} satisfies Prisma.EventFormLinkSelect;
const CERTIFICATE_SELECT = {
  id: true,
  updatedAt: true,
  deletedAt: true,
  name: true,
  scope: true,
  eventId: true,
  eventGroupId: true,
  majorEventId: true,
  certificateTemplateId: true,
  certificateText: true,
  shouldAutofillSecondPage: true,
  secondPageText: true,
  isActive: true,
  issuedTo: true,
  certificateTypeLabel: true,
  paymentTiers: true,
  attendeeEligibility: true,
  certificateFields: true,
} satisfies Prisma.CertificateConfigSelect;
const TICKET_SELECT = {
  id: true,
  updatedAt: true,
  eventId: true,
  enabled: true,
  displayName: true,
  displayEmoji: true,
  description: true,
  transferEligibilityDescription: true,
  transferable: true,
  issueOnEventSubscription: true,
  issueOnMajorEventSubscription: true,
  includedPriceTierIds: true,
  recipientSubscriptionRequirement: true,
  recipientRequiresUnesp: true,
  recipientAcademicIdPrefixes: true,
  recipientCourseCodes: true,
  recipientRequiresAccountManagerVerification: true,
  recipientAllowedPriceTierIds: true,
  purchaseEnabled: true,
  purchaseLimit: true,
  purchaseRequiresUnesp: true,
  purchaseAcademicIdPrefixes: true,
  purchaseCourseCodes: true,
  purchaseRequiresAccountManagerVerification: true,
  purchaseVisiblePriceTierIds: true,
  expirationMode: true,
  customExpiresAt: true,
} satisfies Prisma.TicketConfigSelect;
const OPTION_SELECT = {
  id: true,
  updatedAt: true,
  ticketConfigId: true,
  priceTierId: true,
  label: true,
  amountCents: true,
} satisfies Prisma.TicketPriceOptionSelect;
const PRICE_SELECT = {
  id: true,
  majorEventId: true,
  type: true,
  majorEvent: { select: { deletedAt: true } },
} satisfies Prisma.MajorEventPriceSelect;
const PLACE_SELECT = {
  id: true,
  name: true,
  latitude: true,
  longitude: true,
  locationDescription: true,
  internalNotes: true,
  deletedAt: true,
  updatedAt: true,
} satisfies Prisma.PlacePresetSelect;
const TIER_SELECT = {
  id: true,
  priceId: true,
  name: true,
  value: true,
  includesEventRegistration: true,
  includesSportsRegistration: true,
  restrictEventSelection: true,
  allowedEventIds: true,
  customizeSubscriptionLimits: true,
  maxCoursesPerAttendee: true,
  maxLecturesPerAttendee: true,
  maxUncategorizedPerAttendee: true,
  price: { select: { majorEventId: true, majorEvent: { select: { deletedAt: true } } } },
} satisfies Prisma.PriceTierSelect;

type TransferSnapshotExtra = Pick<
  ResolvedTransferResource,
  'identityKey' | 'dependencies' | 'additionalChanges' | 'skip'
>;

@Injectable()
export class ConfigurationTransferAdapter implements DataTransferAdapter {
  readonly kinds = [
    'event-form',
    'form-link',
    'certificate-config',
    'ticket-config',
    'ticket-price-option',
    'major-event-price',
    'price-tier',
    'place-preset',
  ] as const;
  readonly dependencyOrder = 20;

  async readAppliedResource(
    snapshot: ResolvedTransferResource,
    context: TransferAdapterContext,
  ): Promise<TransferResource> {
    const resource = { ...snapshot.resource, data: {} } as TransferResource;
    const persisted = await this.resolve(resource, context);
    if (!persisted.current) throw new ConflictException('A configuração aplicada não está disponível.');
    return persisted.current;
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationPolicyService,
    private readonly frozen: FrozenResourceService,
    private readonly audit: AuditLogService,
    private readonly people: PersonTransferMatcherService,
    private readonly certificates: CertificateTargetsService,
    private readonly certificateValidation: CertificateValidationService,
    private readonly sitemap: EventSitemapService,
    private readonly search: TypesenseSearchService,
    private readonly realtime: RealtimeInvalidationService,
    private readonly issuance: TicketIssuanceService,
    private readonly ticketRealtime: TicketRealtimeService,
    private readonly attendanceCategories: AttendanceCategoryService,
  ) {}

  async resolve(resource: TransferResource, context: TransferAdapterContext): Promise<ResolvedTransferResource> {
    const proposed = dataOf(resource);
    switch (resource.kind) {
      case 'place-preset': {
        const row = await context.tx.placePreset.findUnique({ where: { id: resource.id }, select: PLACE_SELECT });
        if (row?.deletedAt) throw new NotFoundException('O local não está disponível para importação.');
        const data = pickFields(proposed, PLACE_FIELDS);
        if (typeof data['name'] === 'string') data['name'] = data['name'].trim();
        if (typeof data['locationDescription'] === 'string')
          data['locationDescription'] = data['locationDescription'].trim() || null;
        const normalized = resourceFromData(resource.kind, resource.id, data);
        return this.snapshot(
          { ...resource, data: normalized.data } as TransferResource,
          row ? pickFields(row, PLACE_FIELDS) : null,
          row?.updatedAt,
          {},
        );
      }
      case 'event-form': {
        const row = await context.tx.eventForm.findFirst({
          where: { id: resource.id, deletedAt: null },
          select: FORM_SELECT,
        });
        const data = row ? formData(row) : null;
        if (data) data['elements'] = portableElements(data['elements']);
        const scope = row
          ? await this.scopeForForm(context.tx, row.ownerEventId, row.ownerMajorEventId, row.id, true, context.document)
          : await this.scopeForForm(
              context.tx,
              asId(proposed['ownerEventId']),
              asId(proposed['ownerMajorEventId']),
              resource.id,
              false,
              context.document,
            );
        return this.snapshot(resource, data, row?.updatedAt, scope, {
          dependencies: refs(resource, ['ownerEventId', 'ownerMajorEventId']),
        });
      }
      case 'form-link': {
        const row = await context.tx.eventFormLink.findFirst({
          where: { id: resource.id, deletedAt: null },
          select: LINK_SELECT,
        });
        const data = row ? linkData(row) : null;
        const target = row ? linkData(row) : proposed;
        const scope = await this.scopeForFormLink(
          context.tx,
          asId(target['formId']),
          asId(target['eventId']),
          asId(target['majorEventId']),
          resource.id,
          context.document,
        );
        return this.snapshot(resource, data, row?.updatedAt, scope, {
          dependencies: refs(resource, ['formId', 'eventId', 'majorEventId']),
        });
      }
      case 'certificate-config': {
        const row = await context.tx.certificateConfig.findFirst({
          where: { id: resource.id, deletedAt: null },
          select: CERTIFICATE_SELECT,
        });
        const data = row ? certificateData(row) : null;
        const target = row ? certificateData(row) : proposed;
        const scope = await this.scopeForTarget(
          context.tx,
          asId(target['eventId']),
          asId(target['eventGroupId']),
          asId(target['majorEventId']),
          context.document,
        );
        return this.snapshot(resource, data, row?.updatedAt, scope, {
          dependencies: refs(resource, ['eventId', 'eventGroupId', 'majorEventId']),
        });
      }
      case 'ticket-config': {
        const row = await context.tx.ticketConfig.findFirst({ where: { id: resource.id }, select: TICKET_SELECT });
        const data = row ? ticketData(row) : null;
        const eventId = asId((row ?? proposed)['eventId']);
        const scope = eventId ? await this.scopeForEvent(context.tx, eventId, context.document) : {};
        return this.snapshot(resource, data, row?.updatedAt, scope, {
          dependencies: refs(resource, [
            'eventId',
            'includedPriceTierIds',
            'recipientAllowedPriceTierIds',
            'purchaseVisiblePriceTierIds',
          ]),
        });
      }
      case 'ticket-price-option': {
        const row = await context.tx.ticketPriceOption.findFirst({ where: { id: resource.id }, select: OPTION_SELECT });
        const data = row ? optionData(row) : null;
        const configId = asId((row ?? proposed)['ticketConfigId']);
        const config = configId
          ? await context.tx.ticketConfig.findUnique({ where: { id: configId }, select: { eventId: true } })
          : null;
        const configResource = configId
          ? context.document.resources.find((entry) => entry.kind === 'ticket-config' && entry.id === configId)
          : undefined;
        const eventId = config?.eventId ?? (configResource ? asId(dataOf(configResource)['eventId']) : null);
        const scope = eventId ? await this.scopeForEvent(context.tx, eventId, context.document) : {};
        return this.snapshot(resource, data, row?.updatedAt, scope, {
          dependencies: refs(resource, ['ticketConfigId', 'priceTierId']),
        });
      }
      case 'major-event-price': {
        const row = await context.tx.majorEventPrice.findFirst({ where: { id: resource.id }, select: PRICE_SELECT });
        const data = row ? priceData(row) : null;
        const target = row ?? proposed;
        const majorEventId = asId(target['majorEventId']);
        const scope = majorEventId ? { majorEventId } : {};
        return this.snapshot(resource, data, undefined, scope, {
          dependencies: refs(resource, ['majorEventId']),
        });
      }
      case 'price-tier': {
        const row = await context.tx.priceTier.findFirst({ where: { id: resource.id }, select: TIER_SELECT });
        const data = row ? tierData(row) : null;
        const target = row ?? proposed;
        let majorEventId = row?.price.majorEventId ?? null;
        if (!majorEventId) {
          const priceId = asId(target['priceId']);
          const price = priceId
            ? await context.tx.majorEventPrice.findFirst({ where: { id: priceId }, select: { majorEventId: true } })
            : null;
          const proposedPrice = context.document.resources.find(
            (entry) => entry.kind === 'major-event-price' && entry.id === priceId,
          );
          majorEventId = price?.majorEventId ?? (proposedPrice ? asId(dataOf(proposedPrice)['majorEventId']) : null);
        }
        const extra: TransferSnapshotExtra = {
          dependencies: refs(resource, ['priceId', 'allowedEventIds']),
        };
        const renamed = row && typeof dataOf(resource)['name'] === 'string' && row.name !== dataOf(resource)['name'];
        const conflictMessage = renamed
          ? await this.explicitPriceTierReferenceConflict(
              context,
              majorEventId,
              row.name,
              String(dataOf(resource)['name']),
            )
          : null;
        const additionalChanges =
          renamed && !conflictMessage
            ? await this.priceTierRenameChanges(context, majorEventId, row.name, String(dataOf(resource)['name']))
            : [];
        return this.snapshot(resource, data, undefined, majorEventId ? { majorEventId } : {}, {
          ...extra,
          ...(conflictMessage ? { skip: { message: conflictMessage } } : {}),
          ...(additionalChanges.length > 0 ? { additionalChanges } : {}),
        });
      }
      default:
        throw new TransferValidationException('Tipo de configuração incompatível com o adaptador.');
    }
  }

  async assertRead(snapshot: ResolvedTransferResource, context: TransferAdapterContext): Promise<void> {
    const permission = readPermission(snapshot.resource.kind);
    if (snapshot.resource.kind === 'place-preset' && context.requestedScope) {
      const target = context.requestedScope;
      const transferScope =
        target.kind === 'event'
          ? { eventId: target.id }
          : target.kind === 'group'
            ? { eventGroupId: target.id }
            : { majorEventId: target.id };
      await this.authorization.assertPermissions(context.actor, [Permission.DataTransfer.Import], transferScope);
      await this.authorization.assertPermissions(context.actor, [permission], {});
      return;
    }
    const scope = snapshot.current
      ? { ...snapshot.scope }
      : await this.scopeForPersistedAncestor(snapshot.scope, context);
    if (snapshot.resource.kind === 'event-form' && snapshot.current) scope.eventFormId = snapshot.resource.id;
    if (snapshot.resource.kind === 'form-link') {
      delete scope.eventFormId;
      delete scope.eventFormLinkId;
    }
    await this.authorization.assertPermissions(context.actor, [Permission.DataTransfer.Import, permission], scope);
    if (snapshot.resource.kind === 'form-link') {
      const data = { ...(snapshot.current ? dataOf(snapshot.current) : {}), ...dataOf(snapshot.resource) };
      const formId = asId(data['formId']);
      const form = formId
        ? await context.tx.eventForm.findFirst({ where: { id: formId, deletedAt: null }, select: { id: true } })
        : null;
      if (form) {
        await this.authorization.assertPermissions(context.actor, [Permission.EventForm.Read], {
          eventFormId: form.id,
        });
      }
    }
    if (snapshot.resource.kind === 'price-tier' && snapshot.additionalChanges?.length) {
      await this.assertTierRenamePermissions(snapshot, context, 'read');
    }
  }

  async assertWrite(
    snapshot: ResolvedTransferResource,
    action: TransferWriteAction,
    context: TransferAdapterContext,
  ): Promise<void> {
    if (snapshot.resource.kind === 'form-link') {
      const data = { ...(snapshot.current ? dataOf(snapshot.current) : {}), ...dataOf(snapshot.resource) };
      const formId = asId(data['formId']);
      const form = formId
        ? await context.tx.eventForm.findFirst({ where: { id: formId, deletedAt: null }, select: { id: true } })
        : null;
      const permission = form
        ? Permission.EventForm.Update
        : action === 'create'
          ? Permission.EventForm.Create
          : Permission.EventForm.Update;
      const scope = snapshot.current
        ? { ...snapshot.scope }
        : await this.scopeForPersistedAncestor(snapshot.scope, context);
      delete scope.eventFormId;
      delete scope.eventFormLinkId;
      await this.authorization.assertPermissions(context.actor, [Permission.DataTransfer.Import, permission], scope);
      if (form) {
        await this.authorization.assertPermissions(context.actor, [Permission.EventForm.Update], {
          eventFormId: form.id,
        });
      }
      return;
    }
    const scope = snapshot.current
      ? { ...snapshot.scope }
      : await this.scopeForPersistedAncestor(snapshot.scope, context);
    if (snapshot.resource.kind === 'event-form') {
      // Shared-form IDs expand authorization to linked targets. Writes must use
      // the persisted owner's scope so a linked target cannot grant edit access.
      delete scope.eventFormId;
    }
    let permission = writePermission(snapshot.resource.kind, action);
    if (snapshot.resource.kind === 'ticket-price-option') {
      const configId = asId(dataOf(snapshot.resource)['ticketConfigId']);
      const config = configId
        ? await context.tx.ticketConfig.findUnique({ where: { id: configId }, select: { id: true } })
        : null;
      // Child options edit the existing aggregate, regardless of whether the option itself is new.
      permission = config || snapshot.current ? Permission.TicketConfig.Update : Permission.TicketConfig.Create;
    }
    await this.authorization.assertPermissions(context.actor, [Permission.DataTransfer.Import, permission], scope);
    if (snapshot.resource.kind === 'price-tier' && snapshot.additionalChanges?.length) {
      await this.assertTierRenamePermissions(snapshot, context, 'write');
    }
  }

  async assertMutable(
    snapshot: ResolvedTransferResource,
    operation: 'edit' | 'delete',
    context: TransferAdapterContext,
  ): Promise<void> {
    if (snapshot.resource.kind === 'certificate-config' && snapshot.current) {
      await this.frozen.assertCertificateConfigMutable(snapshot.resource.id, context.actor, operation);
      return;
    }
    await this.assertScopeMutable(snapshot, context, operation);
  }

  async validate(snapshot: ResolvedTransferResource, context: TransferAdapterContext): Promise<void> {
    const { resource, current } = snapshot;
    const data = dataOf(resource);
    const before = current ? dataOf(current) : null;
    this.assertStableParents(resource.kind, before, data);

    switch (resource.kind) {
      case 'place-preset': {
        const name = data['name'] ?? before?.['name'];
        if (typeof name !== 'string' || !name.trim())
          throw new TransferValidationException('O local precisa ter um nome.');
        break;
      }
      case 'event-form':
        await this.validateForm(data, before, context);
        break;
      case 'form-link':
        await this.validateLink(data, before, resource.id, context);
        break;
      case 'certificate-config':
        await this.validateCertificate(data, before, resource.id, context);
        break;
      case 'ticket-config':
        await this.validateTicketConfig(data, before, resource.id, context);
        break;
      case 'ticket-price-option':
        await this.validateTicketOption(data, before, resource.id, context);
        break;
      case 'major-event-price':
        await this.validatePrice(data, before, resource.id, context);
        break;
      case 'price-tier':
        await this.validatePriceTier(data, before, context);
        break;
    }
  }

  async apply(
    snapshot: ResolvedTransferResource,
    action: TransferWriteAction,
    context: TransferAdapterContext,
  ): Promise<TransferAdapterApplyResult> {
    const latest = await this.resolve(snapshot.resource, context);
    if (latest.revision !== snapshot.revision || (snapshot.current !== null) !== (latest.current !== null)) {
      throw new ConflictException('A configuração mudou desde a prévia. Gere uma nova prévia.');
    }
    switch (snapshot.resource.kind) {
      case 'place-preset':
        return this.applyPlace(snapshot, action, context);
      case 'event-form':
        return this.applyForm(snapshot, action, context);
      case 'form-link':
        return this.applyLink(snapshot, action, context);
      case 'certificate-config':
        return this.applyCertificate(snapshot, action, context);
      case 'ticket-config':
        return this.applyTicketConfig(snapshot, action, context);
      case 'ticket-price-option':
        return this.applyTicketOption(snapshot, action, context);
      case 'major-event-price':
        return this.applyPrice(snapshot, action, context);
      case 'price-tier':
        return this.applyPriceTier(snapshot, action, context);
    }
    throw new TransferValidationException('Tipo de configuração incompatível com o adaptador.');
  }

  async validatePlan(
    snapshot: ResolvedTransferResource,
    context: TransferAdapterContext,
    executableResources: readonly TransferResource[],
  ): Promise<void> {
    if (snapshot.resource.kind === 'ticket-config') {
      const merged = { ...(snapshot.current ? dataOf(snapshot.current) : {}), ...dataOf(snapshot.resource) };
      if (merged['purchaseEnabled'] !== true) return;
      await this.validateTicketConfig(
        dataOf(snapshot.resource),
        snapshot.current ? dataOf(snapshot.current) : null,
        snapshot.resource.id,
        context,
        executableResources,
      );
      return;
    }
    if (snapshot.resource.kind === 'major-event-price') {
      await this.validatePrice(
        dataOf(snapshot.resource),
        snapshot.current ? dataOf(snapshot.current) : null,
        snapshot.resource.id,
        context,
        executableResources,
      );
      return;
    }
    // Only new tiers change cardinality. A blocked new tier must not prevent
    // unrelated edits to existing tiers in a partial import.
    if (snapshot.resource.kind !== 'price-tier' || snapshot.current !== null) return;
    const priceId = asId(dataOf(snapshot.resource)['priceId']);
    if (!priceId) throw new TransferValidationException('A faixa precisa pertencer a uma tabela de preços.');
    const price = await context.tx.majorEventPrice.findFirst({ where: { id: priceId }, select: PRICE_SELECT });
    const proposedPrice = executableResources.find(
      (resource) => resource.kind === 'major-event-price' && resource.id === priceId,
    );
    if (!price && !proposedPrice)
      throw new TransferValidationException('A tabela de preços da faixa não está disponível.');
    await this.validatePrice(
      proposedPrice ? dataOf(proposedPrice) : {},
      price ? priceData(price) : null,
      priceId,
      context,
      executableResources,
    );
  }

  async exportTarget(
    target: TransferTarget,
    options: Omit<TransferExportRequest, 'target'>,
    context: TransferAdapterContext,
  ): Promise<TransferAdapterExportResult> {
    if (!options.includeConfiguration) return { resources: [], issues: [] };

    const scope = await this.exportScope(target, options.includeDescendants, context);
    const resources: TransferResource[] = [];
    const issues: TransferAdapterExportResult['issues'] = [];
    const events =
      scope.eventIds.length > 0
        ? await context.tx.event.findMany({
            where: { id: { in: scope.eventIds }, deletedAt: null },
            select: { id: true },
          })
        : [];
    const eventIds = events.map(({ id }) => id);

    const pushIfReadable = async (
      resource: TransferResource,
      permission: Permission,
      authScope: TransferAuthorizationScope,
    ): Promise<boolean> => {
      try {
        await this.authorization.assertPermissions(context.actor, [permission], authScope);
        resources.push(resource);
        return true;
      } catch (error: unknown) {
        if (!(error instanceof ForbiddenException || error instanceof NotFoundException)) throw error;
        issues.push({ kind: resource.kind, message: 'Uma configuração relacionada foi omitida por falta de acesso.' });
        return false;
      }
    };

    const forms = await context.tx.eventForm.findMany({
      where: {
        deletedAt: null,
        OR: [
          ...(eventIds.length > 0 ? [{ ownerEventId: { in: eventIds } }] : []),
          ...(scope.majorEventIds.length > 0 ? [{ ownerMajorEventId: { in: scope.majorEventIds } }] : []),
        ],
      },
      select: FORM_SELECT,
    });
    const formIds = forms.map(({ id }) => id);
    for (const form of forms) {
      const sanitized = formResource(form);
      const formScope = await this.scopeForForm(
        context.tx,
        form.ownerEventId,
        form.ownerMajorEventId,
        form.id,
        true,
        context.document,
      );
      const readable = await pushIfReadable(sanitized, Permission.EventForm.Read, {
        ...formScope,
        eventFormId: form.id,
      });
      if (readable && hasFormImages(form)) {
        issues.push({
          kind: 'event-form',
          message: 'Referências a imagens enviadas foram omitidas; as imagens não são transferidas.',
        });
      }
    }

    const links = await context.tx.eventFormLink.findMany({
      where: {
        deletedAt: null,
        formId: { in: formIds },
        OR: [
          ...(eventIds.length > 0 ? [{ eventId: { in: eventIds } }] : []),
          ...(scope.majorEventIds.length > 0 ? [{ majorEventId: { in: scope.majorEventIds } }] : []),
        ],
      },
      select: LINK_SELECT,
    });
    for (const link of links) {
      const authScope = await this.scopeForFormLink(
        context.tx,
        link.formId,
        link.eventId,
        link.majorEventId,
        link.id,
        context.document,
      );
      await pushIfReadable(linkResource(link), Permission.EventForm.Read, { ...authScope, eventFormId: link.formId });
    }

    const certificateWhere: Prisma.CertificateConfigWhereInput = {
      deletedAt: null,
      OR: [
        ...(eventIds.length > 0
          ? [{ eventId: { in: eventIds } }, { eventGroup: { events: { some: { id: { in: eventIds } } } } }]
          : []),
        ...(scope.eventGroupIds.length > 0 ? [{ eventGroupId: { in: scope.eventGroupIds } }] : []),
        ...(scope.majorEventIds.length > 0 ? [{ majorEventId: { in: scope.majorEventIds } }] : []),
      ],
    };
    const certificates =
      (certificateWhere.OR?.length ?? 0) > 0
        ? await context.tx.certificateConfig.findMany({ where: certificateWhere, select: CERTIFICATE_SELECT })
        : [];
    for (const config of certificates) {
      const authScope = await this.scopeForTarget(
        context.tx,
        config.eventId,
        config.eventGroupId,
        config.majorEventId,
        context.document,
      );
      await pushIfReadable(certificateResource(config), Permission.CertificateConfig.Read, authScope);
    }

    const tickets =
      eventIds.length > 0
        ? await context.tx.ticketConfig.findMany({ where: { eventId: { in: eventIds } }, select: TICKET_SELECT })
        : [];
    for (const config of tickets) {
      const authScope = await this.scopeForEvent(context.tx, config.eventId, context.document);
      await pushIfReadable(ticketResource(config), Permission.TicketConfig.Read, authScope);
      const optionsForConfig = await context.tx.ticketPriceOption.findMany({
        where: { ticketConfigId: config.id },
        select: OPTION_SELECT,
      });
      for (const option of optionsForConfig) {
        await pushIfReadable(optionResource(option), Permission.TicketConfig.Read, authScope);
      }
    }

    for (const majorEventId of scope.majorEventIds) {
      const price = await context.tx.majorEventPrice.findFirst({ where: { majorEventId }, select: PRICE_SELECT });
      if (!price) continue;
      await pushIfReadable(priceResource(price), Permission.MajorEvent.Read, { majorEventId });
      const tiers = await context.tx.priceTier.findMany({ where: { priceId: price.id }, select: TIER_SELECT });
      for (const tier of tiers) {
        await pushIfReadable(tierResource(tier), Permission.MajorEvent.Read, { majorEventId });
      }
    }

    return { resources, issues };
  }

  private snapshot(
    resource: TransferResource,
    currentData: Record<string, unknown> | null,
    updatedAt: Date | undefined,
    scope: TransferAuthorizationScope,
    extra: Partial<TransferSnapshotExtra> = {},
  ): ResolvedTransferResource {
    const current = currentData ? resourceFromData(resource.kind, resource.id, currentData, updatedAt) : null;
    const revision = updatedAt?.toISOString() ?? (current ? fingerprint(current.data) : null);
    return {
      resource,
      current,
      revision,
      scope,
      dependencies: extra.dependencies ?? [],
      ...(extra.identityKey ? { identityKey: extra.identityKey } : {}),
      ...(extra.additionalChanges ? { additionalChanges: extra.additionalChanges } : {}),
      ...(extra.skip ? { skip: extra.skip } : {}),
    };
  }

  private async scopeForEvent(
    tx: Prisma.TransactionClient,
    eventId: string,
    document: TransferAdapterContext['document'],
  ): Promise<TransferAuthorizationScope> {
    const event = await tx.event.findFirst({
      where: { id: eventId, deletedAt: null },
      select: { id: true, eventGroupId: true, majorEventId: true, eventGroup: { select: { majorEventId: true } } },
    });
    if (!event) {
      const proposedEvent = document.resources.find((resource) => resource.kind === 'event' && resource.id === eventId);
      if (!proposedEvent) return { eventId };
      const data = dataOf(proposedEvent);
      const eventGroupId = asId(data['eventGroupId']);
      const proposedGroup = eventGroupId
        ? document.resources.find((resource) => resource.kind === 'group' && resource.id === eventGroupId)
        : undefined;
      const existingGroup = eventGroupId
        ? await tx.eventGroup.findFirst({
            where: { id: eventGroupId, deletedAt: null },
            select: { majorEventId: true },
          })
        : null;
      const majorEventId =
        asId(data['majorEventId']) ??
        existingGroup?.majorEventId ??
        (proposedGroup ? asId(dataOf(proposedGroup)['majorEventId']) : null);
      return { eventId, ...(eventGroupId ? { eventGroupId } : {}), ...(majorEventId ? { majorEventId } : {}) };
    }
    return {
      eventId,
      ...(event.eventGroupId ? { eventGroupId: event.eventGroupId } : {}),
      ...((event.majorEventId ?? event.eventGroup?.majorEventId)
        ? { majorEventId: event.majorEventId ?? event.eventGroup?.majorEventId ?? undefined }
        : {}),
    };
  }

  /**
   * Scoped authorization must only receive IDs that resolve to persisted rows.
   * A new child can inherit the nearest existing ancestor's scope; if its entire
   * ancestry is being created in this document, the permission check is global.
   */
  private async scopeForPersistedAncestor(
    scope: TransferAuthorizationScope,
    context: TransferAdapterContext,
  ): Promise<TransferAuthorizationScope> {
    if (scope.eventId) {
      const event = await context.tx.event.findFirst({
        where: { id: scope.eventId, deletedAt: null },
        select: { id: true, eventGroupId: true, majorEventId: true, eventGroup: { select: { majorEventId: true } } },
      });
      if (event) {
        const majorEventId = event.majorEventId ?? event.eventGroup?.majorEventId ?? null;
        return {
          eventId: event.id,
          ...(event.eventGroupId ? { eventGroupId: event.eventGroupId } : {}),
          ...(majorEventId ? { majorEventId } : {}),
        };
      }
    }
    if (scope.eventGroupId) {
      const group = await context.tx.eventGroup.findFirst({
        where: { id: scope.eventGroupId, deletedAt: null },
        select: { id: true, majorEventId: true },
      });
      if (group) {
        const majorEvent = group.majorEventId
          ? await context.tx.majorEvent.findFirst({
              where: { id: group.majorEventId, deletedAt: null },
              select: { id: true },
            })
          : null;
        return {
          eventGroupId: group.id,
          ...(majorEvent ? { majorEventId: majorEvent.id } : {}),
        };
      }
    }
    if (scope.majorEventId) {
      const majorEvent = await context.tx.majorEvent.findFirst({
        where: { id: scope.majorEventId, deletedAt: null },
        select: { id: true },
      });
      if (majorEvent) return { majorEventId: majorEvent.id };
    }
    return {};
  }

  private async assertPermissionAtPersistedAncestor(
    permission: Permission,
    scope: TransferAuthorizationScope,
    context: TransferAdapterContext,
  ): Promise<void> {
    const persistedScope = await this.scopeForPersistedAncestor(scope, context);
    await this.authorization.assertPermissions(context.actor, [permission], persistedScope);
  }

  private async scopeForForm(
    tx: Prisma.TransactionClient,
    ownerEventId: string | null,
    ownerMajorEventId: string | null,
    formId: string,
    includeFormId: boolean,
    document: TransferAdapterContext['document'],
  ): Promise<TransferAuthorizationScope> {
    const scope = ownerEventId
      ? await this.scopeForEvent(tx, ownerEventId, document)
      : ownerMajorEventId
        ? { majorEventId: ownerMajorEventId }
        : {};
    return includeFormId ? { ...scope, eventFormId: formId } : scope;
  }

  private async scopeForFormLink(
    tx: Prisma.TransactionClient,
    formId: string | null,
    eventId: string | null,
    majorEventId: string | null,
    linkId: string,
    document: TransferAdapterContext['document'],
  ): Promise<TransferAuthorizationScope> {
    const targetScope = eventId
      ? await this.scopeForEvent(tx, eventId, document)
      : majorEventId
        ? { majorEventId }
        : {};
    const existingForm = formId
      ? await tx.eventForm.findFirst({ where: { id: formId, deletedAt: null }, select: { id: true } })
      : null;
    return {
      ...targetScope,
      ...(existingForm ? { eventFormId: existingForm.id } : {}),
      eventFormLinkId: linkId,
    };
  }

  private async scopeForTarget(
    tx: Prisma.TransactionClient,
    eventId: string | null,
    eventGroupId: string | null,
    majorEventId: string | null,
    document: TransferAdapterContext['document'],
  ): Promise<TransferAuthorizationScope> {
    if (eventId) return this.scopeForEvent(tx, eventId, document);
    if (eventGroupId) {
      const group = await tx.eventGroup.findFirst({
        where: { id: eventGroupId, deletedAt: null },
        select: { majorEventId: true },
      });
      const proposedGroup = document.resources.find(
        (resource) => resource.kind === 'group' && resource.id === eventGroupId,
      );
      const resolvedMajorEventId =
        group?.majorEventId ?? (proposedGroup ? asId(dataOf(proposedGroup)['majorEventId']) : null);
      return { eventGroupId, ...(resolvedMajorEventId ? { majorEventId: resolvedMajorEventId } : {}) };
    }
    return majorEventId ? { majorEventId } : {};
  }

  private async eventMajorEventScope(
    context: TransferAdapterContext,
    eventId: string,
  ): Promise<{ exists: boolean; eventGroupId: string | null; majorEventId: string | null }> {
    const existing = await context.tx.event.findFirst({
      where: { id: eventId, deletedAt: null },
      select: { eventGroupId: true, majorEventId: true, eventGroup: { select: { majorEventId: true } } },
    });
    if (existing) {
      return {
        exists: true,
        eventGroupId: existing.eventGroupId,
        majorEventId: existing.majorEventId ?? existing.eventGroup?.majorEventId ?? null,
      };
    }
    const proposedEvent = context.document.resources.find(
      (resource) => resource.kind === 'event' && resource.id === eventId,
    );
    if (!proposedEvent) return { exists: false, eventGroupId: null, majorEventId: null };
    const eventData = dataOf(proposedEvent);
    const eventGroupId = asId(eventData['eventGroupId']);
    const proposedGroup = eventGroupId
      ? context.document.resources.find((resource) => resource.kind === 'group' && resource.id === eventGroupId)
      : undefined;
    const existingGroup = eventGroupId
      ? await context.tx.eventGroup.findFirst({
          where: { id: eventGroupId, deletedAt: null },
          select: { majorEventId: true },
        })
      : null;
    const majorEventId =
      asId(eventData['majorEventId']) ??
      existingGroup?.majorEventId ??
      (proposedGroup ? asId(dataOf(proposedGroup)['majorEventId']) : null);
    return { exists: true, eventGroupId, majorEventId };
  }

  private async assertScopeMutable(
    snapshot: ResolvedTransferResource,
    context: TransferAdapterContext,
    operation: 'edit' | 'delete',
  ) {
    const { scope } = snapshot;
    const eventExists = scope.eventId
      ? await context.tx.event.findFirst({ where: { id: scope.eventId, deletedAt: null }, select: { id: true } })
      : null;
    if (scope.eventId && eventExists) {
      await this.frozen.assertEventMutable(scope.eventId, context.actor, operation);
      return;
    }
    const groupExists = scope.eventGroupId
      ? await context.tx.eventGroup.findFirst({
          where: { id: scope.eventGroupId, deletedAt: null },
          select: { id: true },
        })
      : null;
    if (scope.eventGroupId && groupExists) {
      await this.frozen.assertEventGroupMutable(scope.eventGroupId, context.actor, operation);
      return;
    }
    const majorEventExists = scope.majorEventId
      ? await context.tx.majorEvent.findFirst({
          where: { id: scope.majorEventId, deletedAt: null },
          select: { id: true },
        })
      : null;
    if (scope.majorEventId && majorEventExists) {
      await this.frozen.assertMajorEventMutable(scope.majorEventId, context.actor, operation);
    }
  }

  private assertStableParents(
    kind: TransferResourceKind,
    current: Record<string, unknown> | null,
    proposed: Record<string, unknown>,
  ): void {
    if (!current) return;
    const parentFields: Partial<Record<TransferResourceKind, readonly string[]>> = {
      'event-form': ['ownerEventId', 'ownerMajorEventId'],
      'form-link': ['formId', 'targetType', 'eventId', 'majorEventId'],
      'certificate-config': ['scope', 'eventId', 'eventGroupId', 'majorEventId'],
      'ticket-config': ['eventId'],
      'ticket-price-option': ['ticketConfigId', 'priceTierId'],
      'major-event-price': ['majorEventId'],
      'price-tier': ['priceId'],
    };
    for (const field of parentFields[kind] ?? []) {
      if (Object.prototype.hasOwnProperty.call(proposed, field) && !sameValue(proposed[field], current[field])) {
        throw new TransferValidationException(
          'A configuração existente não pode ser movida para outro recurso neste formato.',
        );
      }
    }
  }

  private async validateForm(
    data: Record<string, unknown>,
    current: Record<string, unknown> | null,
    context: TransferAdapterContext,
  ): Promise<void> {
    if (!current && Boolean(asId(data['ownerEventId'])) === Boolean(asId(data['ownerMajorEventId']))) {
      throw new TransferValidationException(
        'Um formulário novo deve pertencer a exatamente um evento ou grande evento.',
      );
    }
    const merged = { ...(current ?? {}), ...data };
    if (typeof merged['name'] !== 'string' || merged['name'].trim().length === 0) {
      throw new TransferValidationException('O formulário precisa ter um nome.');
    }
    if (!Array.isArray(merged['elements'])) {
      throw new TransferValidationException('O formulário precisa conter uma lista de itens.');
    }
    if (typeof merged['description'] === 'string' && merged['description'].length > 5000) {
      throw new TransferValidationException('A descrição do formulário é muito longa.');
    }
    const elements = data['elements'];
    if (elements !== undefined) {
      const normalized = parseElementsJson(JSON.stringify(elements));
      assertQuestionsHaveTitles(normalized);
    }
    if (!current) {
      const ownerEventId = asId(data['ownerEventId']);
      const ownerMajorEventId = asId(data['ownerMajorEventId']);
      if (ownerEventId) {
        const eventExists = await context.tx.event.findFirst({
          where: { id: ownerEventId, deletedAt: null },
          select: { id: true },
        });
        const proposedEvent = context.document.resources.some(
          (resource) => resource.kind === 'event' && resource.id === ownerEventId,
        );
        if (!eventExists && !proposedEvent) {
          throw new TransferValidationException(
            'O evento proprietário do formulário não existe no destino nem no arquivo.',
          );
        }
      }
      if (ownerMajorEventId) {
        const majorEventExists = await context.tx.majorEvent.findFirst({
          where: { id: ownerMajorEventId, deletedAt: null },
          select: { id: true },
        });
        const proposedMajorEvent = context.document.resources.some(
          (resource) => resource.kind === 'major-event' && resource.id === ownerMajorEventId,
        );
        if (!majorEventExists && !proposedMajorEvent) {
          throw new TransferValidationException(
            'O grande evento proprietário do formulário não existe no destino nem no arquivo.',
          );
        }
      }
    }
    if (merged['resultsLive'] === true && merged['resultsPublic'] === false) {
      throw new TransferValidationException('Resultados ao vivo exigem resultados públicos.');
    }
  }

  private async validateLink(
    data: Record<string, unknown>,
    current: Record<string, unknown> | null,
    linkId: string,
    context: TransferAdapterContext,
  ): Promise<void> {
    const merged = { ...(current ?? {}), ...data };
    const formId = asId(merged['formId']);
    const formInDatabase = formId
      ? await context.tx.eventForm.findFirst({ where: { id: formId, deletedAt: null }, select: { id: true } })
      : null;
    const formInDocument = formId
      ? context.document.resources.some((resource) => resource.kind === 'event-form' && resource.id === formId)
      : false;
    if (!formId || (!formInDatabase && !formInDocument)) {
      throw new TransferValidationException(
        'O vínculo precisa apontar para um formulário existente neste arquivo ou no destino.',
      );
    }
    const type = merged['targetType'];
    const eventId = asId(merged['eventId']);
    const majorEventId = asId(merged['majorEventId']);
    if (
      type === 'EVENT'
        ? !eventId || Boolean(majorEventId)
        : type === 'MAJOR_EVENT'
          ? !majorEventId || Boolean(eventId)
          : true
    ) {
      throw new TransferValidationException('O vínculo deve apontar para exatamente um destino compatível com o tipo.');
    }
    if (type === 'EVENT' && eventId) {
      const exists = await context.tx.event.findFirst({
        where: { id: eventId, deletedAt: null },
        select: { id: true },
      });
      if (
        !exists &&
        !context.document.resources.some((resource) => resource.kind === 'event' && resource.id === eventId)
      ) {
        throw new TransferValidationException('O evento do vínculo não existe no destino nem no arquivo.');
      }
    }
    if (type === 'MAJOR_EVENT' && majorEventId) {
      const exists = await context.tx.majorEvent.findFirst({
        where: { id: majorEventId, deletedAt: null },
        select: { id: true },
      });
      if (
        !exists &&
        !context.document.resources.some((resource) => resource.kind === 'major-event' && resource.id === majorEventId)
      ) {
        throw new TransferValidationException('O grande evento do vínculo não existe no destino nem no arquivo.');
      }
    }
    if (merged['requiredInSubscriptionFlow'] === true && merged['insertInSubscriptionFlow'] !== true) {
      throw new TransferValidationException('Um formulário obrigatório precisa estar no fluxo de inscrição.');
    }
    const audiences = Array.isArray(merged['audiences'])
      ? stringArray(merged['audiences'])
      : ['SUBSCRIBERS', 'ATTENDEES'];
    if (merged['insertInSubscriptionFlow'] === true && !audiences.includes('SUBSCRIBERS')) {
      throw new TransferValidationException('Formulários no fluxo de inscrição devem incluir pessoas inscritas.');
    }
    if (
      merged['availableFrom'] &&
      merged['availableUntil'] &&
      new Date(String(merged['availableFrom'])) > new Date(String(merged['availableUntil']))
    ) {
      throw new TransferValidationException('O fim da disponibilidade deve ser posterior ao início.');
    }
    if (Array.isArray(merged['priceTierIds']) && merged['priceTierIds'].length > 0) {
      if (type !== 'MAJOR_EVENT' || merged['insertInSubscriptionFlow'] !== true) {
        throw new TransferValidationException(
          'Faixas de preço só podem ser vinculadas a formulários no fluxo de inscrição de um grande evento.',
        );
      }
      if (!majorEventId)
        throw new TransferValidationException('As faixas de preço precisam pertencer a um grande evento.');
      const ids = stringArray(merged['priceTierIds']);
      const availableTierIds = await this.priceTierIdsForMajorEvent(context, majorEventId);
      if (ids.some((id) => !availableTierIds.has(id)))
        throw new TransferValidationException('Uma ou mais faixas não pertencem ao grande evento vinculado.');
      await this.assertPermissionAtPersistedAncestor(Permission.MajorEvent.Read, { majorEventId }, context);
    }
    const duplicateInFile = context.document.resources.some((resource) => {
      if (resource.kind !== 'form-link' || resource.id === linkId) return false;
      const candidate = dataOf(resource);
      return (
        candidate['formId'] === formId &&
        candidate['targetType'] === type &&
        (type === 'EVENT' ? candidate['eventId'] === eventId : candidate['majorEventId'] === majorEventId)
      );
    });
    const duplicateInDatabase = await context.tx.eventFormLink.findFirst({
      where: {
        formId,
        ...(type === 'EVENT' ? { eventId } : { majorEventId }),
        deletedAt: null,
        ...(current ? { id: { not: linkId } } : {}),
      },
      select: { id: true },
    });
    if (duplicateInFile || duplicateInDatabase) {
      throw new TransferValidationException('O formulário já tem um vínculo ativo com este destino.');
    }
    if (current && (formId !== asId(current['formId']) || type !== current['targetType'])) {
      throw new TransferValidationException('O vínculo existente não pode mudar de formulário ou tipo de destino.');
    }
  }

  private async validateCertificate(
    data: Record<string, unknown>,
    current: Record<string, unknown> | null,
    configId: string,
    context: TransferAdapterContext,
  ) {
    const merged = { ...(current ?? {}), ...data };
    const scope = merged['scope'] as CertificateScope;
    const eventId = asId(merged['eventId']);
    const eventGroupId = asId(merged['eventGroupId']);
    const majorEventId = asId(merged['majorEventId']);
    const targetCount = Number(Boolean(eventId)) + Number(Boolean(eventGroupId)) + Number(Boolean(majorEventId));
    if (
      (scope === 'EVENT' && (!eventId || targetCount !== 1)) ||
      (scope === 'EVENT_GROUP' && (!eventGroupId || targetCount !== 1)) ||
      (scope === 'MAJOR_EVENT' && (!majorEventId || targetCount !== 1))
    ) {
      throw new TransferValidationException('O destino do certificado não corresponde ao seu escopo.');
    }
    const templateId = asId(merged['certificateTemplateId']);
    if (!current && (typeof merged['name'] !== 'string' || !templateId || !scope)) {
      throw new TransferValidationException('A configuração de certificado precisa de nome, escopo e modelo.');
    }
    const template = templateId
      ? await context.tx.certificateTemplate.findFirst({
          where: { id: templateId, deletedAt: null },
          select: { id: true, isActive: true, contentChecksum: true, htmlTemplate: true },
        })
      : null;
    if (!template?.isActive || template.contentChecksum === 'pending-metadata' || !template.htmlTemplate) {
      throw new TransferValidationException('O modelo de certificado não está disponível.');
    }
    const name = this.certificateValidation.normalizeRequiredName(String(merged['name'] ?? ''));
    const targetId = eventId ?? eventGroupId ?? majorEventId;
    if (!targetId)
      throw new TransferValidationException('A configuração de certificado precisa apontar para um destino.');
    const targetWhere: Prisma.CertificateConfigWhereInput =
      scope === 'EVENT'
        ? { eventId: targetId }
        : scope === 'EVENT_GROUP'
          ? { eventGroupId: targetId }
          : { majorEventId: targetId };
    const duplicate = await context.tx.certificateConfig.findFirst({
      where: {
        deletedAt: null,
        name: { equals: name, mode: 'insensitive' },
        ...targetWhere,
        ...(current ? { id: { not: configId } } : {}),
      },
      select: { id: true },
    });
    const duplicateInFile = context.document.resources.some((resource) => {
      if (resource.kind !== 'certificate-config' || resource.id === configId) return false;
      const candidate = dataOf(resource);
      return (
        candidate['scope'] === scope &&
        (scope === 'EVENT'
          ? candidate['eventId']
          : scope === 'EVENT_GROUP'
            ? candidate['eventGroupId']
            : candidate['majorEventId']) === targetId &&
        typeof candidate['name'] === 'string' &&
        candidate['name'].trim().toLocaleLowerCase() === name.toLocaleLowerCase()
      );
    });
    if (duplicate || duplicateInFile)
      throw new TransferValidationException('Já existe uma configuração de certificado com esse nome para o destino.');
    if (scope !== 'OTHER') {
      const targetId = eventId ?? eventGroupId ?? majorEventId;
      if (!targetId) throw new TransferValidationException('O certificado precisa de um destino válido.');
      const targetKind = scope === 'EVENT' ? 'event' : scope === 'EVENT_GROUP' ? 'group' : 'major-event';
      const hasProposedTarget = context.document.resources.some(
        (resource) => resource.kind === targetKind && resource.id === targetId,
      );
      if (hasProposedTarget || !(await this.certificateTargetExists(scope, targetId, context))) {
        if (
          !(await this.proposedCertificateTargetIsIssuable(
            scope,
            targetId,
            merged['issuedTo'] as CertificateIssuedTo | undefined,
            context,
          ))
        ) {
          throw new TransferValidationException(
            'O destino novo ainda não atende às regras de emissão deste certificado.',
          );
        }
      } else {
        await this.certificates.assertIssuableTarget(
          scope,
          targetId,
          merged['issuedTo'] as CertificateIssuedTo | undefined,
        );
      }
    }
    let paymentTierMajorEventId: string | null = scope === 'MAJOR_EVENT' ? majorEventId : null;
    if (scope === 'EVENT' && eventId) {
      const event = await context.tx.event.findFirst({
        where: { id: eventId, deletedAt: null },
        select: { majorEventId: true },
      });
      const proposedEvent = context.document.resources.find(
        (resource) => resource.kind === 'event' && resource.id === eventId,
      );
      paymentTierMajorEventId =
        event?.majorEventId ?? (proposedEvent ? asId(dataOf(proposedEvent)['majorEventId']) : null);
    }
    if (Array.isArray(merged['paymentTiers']) && merged['paymentTiers'].length > 0) {
      if (!paymentTierMajorEventId) {
        throw new TransferValidationException(
          'Faixas de pagamento exigem um grande evento ou um evento diretamente associado a ele.',
        );
      }
      const tierNames = await context.tx.priceTier.findMany({
        where: { price: { majorEventId: paymentTierMajorEventId } },
        select: { name: true },
      });
      const importedPrices = context.document.resources.filter(
        (resource) =>
          resource.kind === 'major-event-price' && dataOf(resource)['majorEventId'] === paymentTierMajorEventId,
      );
      const existingPrice = await context.tx.majorEventPrice.findFirst({
        where: { majorEventId: paymentTierMajorEventId },
        select: { id: true },
      });
      const proposedPriceIds = new Set([
        ...(existingPrice ? [existingPrice.id] : []),
        ...importedPrices.map((resource) => resource.id),
      ]);
      const proposedNames: string[] = [];
      const pendingRenameNames = new Set<string>();
      for (const resource of context.document.resources) {
        if (resource.kind !== 'price-tier' || !proposedPriceIds.has(String(dataOf(resource)['priceId']))) continue;
        const proposedName = dataOf(resource)['name'];
        if (typeof proposedName !== 'string') continue;
        const existing = await context.tx.priceTier.findFirst({ where: { id: resource.id }, select: { name: true } });
        if (existing && existing.name !== proposedName) pendingRenameNames.add(proposedName);
        else proposedNames.push(proposedName);
      }
      if (stringArray(merged['paymentTiers']).some((name) => pendingRenameNames.has(name))) {
        throw new TransferValidationException(
          'Este arquivo também renomeia uma faixa vinculada ao certificado. Aplique a renomeação e atualize paymentTiers em importações separadas.',
        );
      }
      const allowed = new Set([...tierNames.map(({ name }) => name), ...proposedNames]);
      if (merged['paymentTiers'].some((name) => typeof name !== 'string' || !allowed.has(name))) {
        throw new TransferValidationException('Uma ou mais faixas de pagamento não pertencem ao grande evento.');
      }
      await this.assertPermissionAtPersistedAncestor(
        Permission.MajorEvent.Read,
        { majorEventId: paymentTierMajorEventId },
        context,
      );
    }
    if (data['certificateFields'] !== undefined) {
      this.certificateValidation.normalizeCertificateFieldsJson(
        data['certificateFields'] === null ? null : JSON.stringify(data['certificateFields']),
      );
    }
  }

  private async validateTicketConfig(
    data: Record<string, unknown>,
    current: Record<string, unknown> | null,
    configId: string,
    context: TransferAdapterContext,
    executableResources: readonly TransferResource[] = context.document.resources,
  ) {
    const merged = { ...(current ?? {}), ...data };
    const eventId = asId(merged['eventId']);
    if (!eventId || !(await this.eventMajorEventScope(context, eventId)).exists) {
      throw new TransferValidationException('A configuração de bilhetes precisa apontar para um evento existente.');
    }
    const existingForEvent = await context.tx.ticketConfig.findUnique({ where: { eventId }, select: { id: true } });
    if (existingForEvent && existingForEvent.id !== configId && !current) {
      throw new TransferValidationException('O evento já possui outra configuração de bilhetes.');
    }
    if (merged['expirationMode'] === TicketExpirationMode.CUSTOM && !merged['customExpiresAt']) {
      throw new TransferValidationException('Informe a data de validade personalizada.');
    }
    if (!Object.values(TicketExpirationMode).includes(merged['expirationMode'] as TicketExpirationMode)) {
      throw new TransferValidationException('O critério de validade dos bilhetes é inválido.');
    }
    const purchaseLimit = merged['purchaseLimit'];
    if (
      purchaseLimit !== null &&
      purchaseLimit !== undefined &&
      (!Number.isInteger(purchaseLimit) || Number(purchaseLimit) < 1)
    ) {
      throw new TransferValidationException('O limite de compras deve ser um inteiro positivo ou nulo.');
    }
    const tierIds = [
      ...new Set([
        ...stringArray(merged['includedPriceTierIds']),
        ...stringArray(merged['recipientAllowedPriceTierIds']),
        ...stringArray(merged['purchaseVisiblePriceTierIds']),
      ]),
    ];
    const eventScope = await this.eventMajorEventScope(context, eventId);
    const majorEventId = eventScope.majorEventId;
    if (tierIds.length > 0) {
      if (!majorEventId)
        throw new TransferValidationException('Faixas de preço exigem um evento associado a grande evento.');
      const availableTierIds = await this.priceTierIdsForMajorEvent(context, majorEventId);
      if (tierIds.some((id) => !availableTierIds.has(id)))
        throw new TransferValidationException('Uma ou mais faixas não pertencem ao grande evento do evento.');
      await this.assertPermissionAtPersistedAncestor(Permission.MajorEvent.Read, { majorEventId }, context);
    }
    if (current && data['purchaseLimit'] !== undefined && merged['purchaseLimit'] !== null) {
      const reservedPurchases = await context.tx.ticketPurchase.count({
        where: { ticketConfigId: configId, status: { in: ['UNDER_REVIEW', 'APPROVED'] } },
      });
      if (Number(merged['purchaseLimit']) < reservedPurchases) {
        throw new TransferValidationException(
          'O limite não pode ser menor que a quantidade de compras aprovadas ou em análise.',
        );
      }
    }
    if (
      !Object.values(TicketSubscriptionRequirement).includes(
        merged['recipientSubscriptionRequirement'] as TicketSubscriptionRequirement,
      )
    ) {
      throw new TransferValidationException('O critério de inscrição dos bilhetes é inválido.');
    }
    if (
      stringArray(merged['recipientAllowedPriceTierIds']).length > 0 &&
      merged['recipientSubscriptionRequirement'] !== TicketSubscriptionRequirement.REQUIRED
    ) {
      throw new TransferValidationException('A restrição por faixa de preço exige inscrição no grande evento.');
    }
    if (merged['purchaseEnabled'] === true) {
      const proposedOptions = executableResources.some(
        (resource) => resource.kind === 'ticket-price-option' && dataOf(resource)['ticketConfigId'] === configId,
      );
      const existingOptions = await context.tx.ticketPriceOption.count({ where: { ticketConfigId: configId } });
      if (!majorEventId || (!proposedOptions && existingOptions === 0)) {
        throw new TransferValidationException(
          'Bilhetes compráveis exigem um grande evento e ao menos uma opção de preço.',
        );
      }
    }
  }

  private async certificateTargetExists(
    scope: CertificateScope,
    id: string,
    context: TransferAdapterContext,
  ): Promise<boolean> {
    if (scope === CertificateScope.EVENT) {
      return Boolean(await context.tx.event.findFirst({ where: { id, deletedAt: null }, select: { id: true } }));
    }
    if (scope === CertificateScope.EVENT_GROUP) {
      return Boolean(await context.tx.eventGroup.findFirst({ where: { id, deletedAt: null }, select: { id: true } }));
    }
    return Boolean(await context.tx.majorEvent.findFirst({ where: { id, deletedAt: null }, select: { id: true } }));
  }

  private async proposedCertificateTargetIsIssuable(
    scope: CertificateScope,
    id: string,
    issuedTo: CertificateIssuedTo | undefined,
    context: TransferAdapterContext,
  ): Promise<boolean> {
    if (issuedTo && isAutomaticSportsCertificateIssuedTo(issuedTo)) {
      if (scope === 'MAJOR_EVENT') {
        const tournament = await context.tx.sportsTournament.findFirst({
          where: { majorEventId: id, deletedAt: null, shouldIssueCertificate: true },
          select: { id: true },
        });
        return (
          Boolean(tournament) ||
          context.document.resources.some(
            (resource) =>
              resource.kind === 'sports-tournament' &&
              dataOf(resource)['majorEventId'] === id &&
              dataOf(resource)['shouldIssueCertificate'] === true,
          )
        );
      }
      if (scope === 'EVENT_GROUP') {
        const category = await context.tx.sportsCategory.findFirst({
          where: {
            eventGroupId: id,
            deletedAt: null,
            OR: [
              { shouldIssueCertificate: true },
              { shouldIssueCertificate: null, tournament: { shouldIssueCertificate: true, deletedAt: null } },
            ],
          },
          select: { id: true },
        });
        return (
          Boolean(category) ||
          context.document.resources.some((resource) => {
            if (resource.kind !== 'sports-category' || dataOf(resource)['eventGroupId'] !== id) return false;
            if (dataOf(resource)['shouldIssueCertificate'] === true) return true;
            const tournamentId = asId(dataOf(resource)['tournamentId']);
            return context.document.resources.some(
              (candidate) =>
                candidate.kind === 'sports-tournament' &&
                candidate.id === tournamentId &&
                dataOf(candidate)['shouldIssueCertificate'] === true,
            );
          })
        );
      }
      const match = await context.tx.sportsMatch.findFirst({
        where: {
          eventId: id,
          deletedAt: null,
          event: { shouldIssueCertificate: true, deletedAt: null },
          category: { deletedAt: null, shouldIssueCertificate: true },
        },
        select: { id: true },
      });
      return (
        Boolean(match) ||
        context.document.resources.some((resource) => {
          if (resource.kind !== 'sports-match' || dataOf(resource)['eventId'] !== id) return false;
          const categoryId = asId(dataOf(resource)['categoryId']);
          const category = categoryId
            ? context.document.resources.find(
                (candidate) => candidate.kind === 'sports-category' && candidate.id === categoryId,
              )
            : undefined;
          const event = context.document.resources.find(
            (candidate) => candidate.kind === 'event' && candidate.id === id,
          );
          return Boolean(
            category &&
              event &&
              dataOf(event)['shouldIssueCertificate'] === true &&
              (dataOf(category)['shouldIssueCertificate'] === true ||
                dataOf(category)['shouldIssueCertificate'] === undefined),
          );
        })
      );
    }
    if (scope === CertificateScope.EVENT) {
      const event = context.document.resources.find((resource) => resource.kind === 'event' && resource.id === id);
      const existingEvent = await context.tx.event.findFirst({
        where: { id, deletedAt: null },
        select: {
          shouldIssueCertificate: true,
          majorEventId: true,
          eventGroupId: true,
          sportsMatch: { select: { id: true } },
        },
      });
      if (existingEvent?.sportsMatch || (!event && existingEvent?.shouldIssueCertificate !== true)) return false;
      const eventData = { ...(existingEvent ?? {}), ...(event ? dataOf(event) : {}) };
      if ((eventData['shouldIssueCertificate'] ?? existingEvent?.shouldIssueCertificate) !== true) return false;
      if (
        context.document.resources.some(
          (resource) => resource.kind === 'sports-match' && dataOf(resource)['eventId'] === id,
        )
      )
        return false;
      const groupId = asId(eventData['eventGroupId']) ?? existingEvent?.eventGroupId ?? null;
      const directMajorEventId = asId(eventData['majorEventId']) ?? existingEvent?.majorEventId ?? null;
      if (!groupId) return !directMajorEventId;
      const group = await this.eventGroupSettings(context, groupId);
      return (
        group?.['shouldIssueCertificate'] === true &&
        group['shouldIssueCertificateForEachEvent'] === true &&
        !context.document.resources.some(
          (resource) => resource.kind === 'sports-category' && dataOf(resource)['eventGroupId'] === groupId,
        )
      );
    }

    if (scope === CertificateScope.EVENT_GROUP) {
      const group = await this.eventGroupSettings(context, id);
      if (!group || group['shouldIssueCertificate'] !== true || group['shouldIssueCertificateForEachEvent'] !== false)
        return false;
      const eventDocumentMatch = context.document.resources.some((resource) => {
        if (resource.kind !== 'event' || dataOf(resource)['eventGroupId'] !== id || dataOf(resource)['majorEventId'])
          return false;
        return (
          dataOf(resource)['shouldIssueCertificate'] === true &&
          !context.document.resources.some(
            (match) => match.kind === 'sports-match' && dataOf(match)['eventId'] === resource.id,
          )
        );
      });
      if (eventDocumentMatch) return true;
      return Boolean(
        await context.tx.event.findFirst({
          where: {
            eventGroupId: id,
            majorEventId: null,
            deletedAt: null,
            shouldIssueCertificate: true,
            sportsMatch: { is: null },
          },
          select: { id: true },
        }),
      );
    }

    const qualifyingDocumentEvent = context.document.resources.some((resource) => {
      if (resource.kind !== 'event' || dataOf(resource)['shouldIssueCertificate'] !== true) return false;
      if (
        context.document.resources.some(
          (match) => match.kind === 'sports-match' && dataOf(match)['eventId'] === resource.id,
        )
      )
        return false;
      const eventData = dataOf(resource);
      if (eventData['majorEventId'] === id && !asId(eventData['eventGroupId'])) return true;
      const groupId = asId(eventData['eventGroupId']);
      if (!groupId) return false;
      const group = context.document.resources.find(
        (candidate) => candidate.kind === 'group' && candidate.id === groupId,
      );
      return (
        group !== undefined &&
        dataOf(group)['majorEventId'] === id &&
        dataOf(group)['shouldIssueCertificate'] === true &&
        !context.document.resources.some(
          (candidate) => candidate.kind === 'sports-category' && dataOf(candidate)['eventGroupId'] === groupId,
        )
      );
    });
    if (qualifyingDocumentEvent) return true;
    const qualifyingExistingEvent = await context.tx.event.findFirst({
      where: {
        deletedAt: null,
        shouldIssueCertificate: true,
        sportsMatch: { is: null },
        OR: [
          { majorEventId: id },
          {
            eventGroup: {
              majorEventId: id,
              deletedAt: null,
              sportsCategory: { is: null },
              shouldIssueCertificate: true,
            },
          },
        ],
      },
      select: { id: true },
    });
    return Boolean(qualifyingExistingEvent);
  }

  private async eventGroupSettings(
    context: TransferAdapterContext,
    id: string,
  ): Promise<Record<string, unknown> | null> {
    const existing = await context.tx.eventGroup.findFirst({
      where: { id, deletedAt: null, sportsCategory: { is: null } },
      select: { shouldIssueCertificate: true, shouldIssueCertificateForEachEvent: true },
    });
    const proposed = context.document.resources.find((resource) => resource.kind === 'group' && resource.id === id);
    if (existing || proposed) return { ...(existing ?? {}), ...(proposed ? dataOf(proposed) : {}) };
    return null;
  }

  private async validateTicketOption(
    data: Record<string, unknown>,
    current: Record<string, unknown> | null,
    optionId: string,
    context: TransferAdapterContext,
  ) {
    const merged = { ...(current ?? {}), ...data };
    const label = typeof merged['label'] === 'string' ? merged['label'].trim() : '';
    const amount = merged['amountCents'];
    if (!label || label.length > 100 || !Number.isSafeInteger(amount) || Number(amount) <= 0) {
      throw new TransferValidationException('Informe um nome e um valor positivo para a opção de bilhete.');
    }
    const configId = asId(merged['ticketConfigId']);
    const config = configId
      ? await context.tx.ticketConfig.findUnique({ where: { id: configId }, select: { eventId: true } })
      : null;
    const configResource = configId
      ? context.document.resources.find((resource) => resource.kind === 'ticket-config' && resource.id === configId)
      : undefined;
    const eventId = config?.eventId ?? (configResource ? asId(dataOf(configResource)['eventId']) : null);
    if (!configId || !eventId) {
      throw new TransferValidationException('A opção precisa pertencer a uma configuração de bilhetes existente.');
    }
    const majorEventId = (await this.eventMajorEventScope(context, eventId)).majorEventId;
    const priceTierId = asId(merged['priceTierId']);
    if (priceTierId) {
      if (!majorEventId || !(await this.priceTierIdsForMajorEvent(context, majorEventId)).has(priceTierId)) {
        throw new TransferValidationException(
          'A opção de bilhete referencia uma faixa de preço de outro grande evento.',
        );
      }
      await this.assertPermissionAtPersistedAncestor(Permission.MajorEvent.Read, { majorEventId }, context);
    }
    if (current && (data['label'] !== undefined || data['amountCents'] !== undefined)) {
      const purchases = await context.tx.ticketPurchase.count({ where: { priceOptionId: optionId } });
      if (purchases > 0) throw new TransferValidationException('Uma opção já usada em compras não pode ser alterada.');
    }
    const desiredTierId = asId(merged['priceTierId']);
    const duplicateInDatabase = await context.tx.ticketPriceOption.findFirst({
      where: {
        ticketConfigId: configId,
        priceTierId: desiredTierId,
        ...(current ? { id: { not: optionId } } : {}),
      },
      select: { id: true },
    });
    const duplicateInFile = context.document.resources.some(
      (resource) =>
        resource.kind === 'ticket-price-option' &&
        resource.id !== optionId &&
        dataOf(resource)['ticketConfigId'] === configId &&
        asId(dataOf(resource)['priceTierId']) === desiredTierId,
    );
    if (duplicateInDatabase || duplicateInFile)
      throw new TransferValidationException('Esta configuração já possui uma opção para a faixa de preço informada.');
  }

  private async validatePrice(
    data: Record<string, unknown>,
    current: Record<string, unknown> | null,
    id: string,
    context: TransferAdapterContext,
    executableResources: readonly TransferResource[] = context.document.resources,
  ) {
    const majorEventId = asId(data['majorEventId']) ?? asId(current?.['majorEventId']);
    const existingMajorEvent = majorEventId
      ? await context.tx.majorEvent.findFirst({ where: { id: majorEventId, deletedAt: null }, select: { id: true } })
      : null;
    const proposedMajorEvent = majorEventId
      ? context.document.resources.find((resource) => resource.kind === 'major-event' && resource.id === majorEventId)
      : undefined;
    if (!majorEventId || (!existingMajorEvent && !proposedMajorEvent)) {
      throw new TransferValidationException('A tabela de preços precisa pertencer a um grande evento existente.');
    }
    if (!current && typeof data['type'] !== 'string')
      throw new TransferValidationException('A nova tabela de preços precisa indicar seu tipo.');
    if (data['type'] !== undefined && data['type'] !== 'SINGLE' && data['type'] !== 'TIERED') {
      throw new TransferValidationException('O tipo de tabela de preços é inválido.');
    }
    const existing = await context.tx.majorEventPrice.findFirst({ where: { majorEventId }, select: { id: true } });
    if (existing && existing.id !== id && !current) {
      throw new TransferValidationException('O grande evento já possui outra tabela de preços.');
    }
    const tierRows = await context.tx.priceTier.findMany({
      where: { priceId: (current?.['id'] as string | undefined) ?? id },
      select: { id: true },
    });
    const proposedTierIds = executableResources
      .filter((resource) => resource.kind === 'price-tier' && dataOf(resource)['priceId'] === id)
      .map((resource) => resource.id);
    const finalTierIds = new Set([...tierRows.map(({ id: tierId }) => tierId), ...proposedTierIds]);
    const type = String(data['type'] ?? current?.['type'] ?? 'TIERED');
    if (finalTierIds.size === 0)
      throw new TransferValidationException('A tabela de preços precisa ter ao menos uma faixa.');
    if (type === 'SINGLE' && finalTierIds.size !== 1)
      throw new TransferValidationException('Uma tabela de preço único exige uma única faixa.');
  }

  private async validatePriceTier(
    data: Record<string, unknown>,
    current: Record<string, unknown> | null,
    context: TransferAdapterContext,
  ) {
    const merged = { ...(current ?? {}), ...data };
    const priceId = asId(merged['priceId']);
    const price = priceId
      ? await context.tx.majorEventPrice.findFirst({ where: { id: priceId }, select: { id: true, majorEventId: true } })
      : null;
    if (
      !price &&
      !context.document.resources.some((resource) => resource.kind === 'major-event-price' && resource.id === priceId)
    ) {
      throw new TransferValidationException('A faixa precisa pertencer a uma tabela de preços existente.');
    }
    if (!Number.isInteger(merged['value']) || Number(merged['value']) < 0)
      throw new TransferValidationException('O valor da faixa de preço é inválido.');
    if (typeof merged['name'] !== 'string' || merged['name'].trim().length === 0) {
      throw new TransferValidationException('A faixa de preço precisa ter um nome.');
    }
    const allowedEventIds = stringArray(merged['allowedEventIds']);
    if (allowedEventIds.length > 0) {
      const proposedPrice = context.document.resources.find(
        (resource) => resource.kind === 'major-event-price' && resource.id === priceId,
      );
      const majorEventId = price?.majorEventId ?? (proposedPrice ? asId(dataOf(proposedPrice)['majorEventId']) : null);
      if (!majorEventId) throw new TransferValidationException('Não foi possível validar o grande evento da faixa.');
      for (const eventId of allowedEventIds) {
        const eventScope = await this.eventMajorEventScope(context, eventId);
        if (!eventScope.exists || eventScope.majorEventId !== majorEventId) {
          throw new TransferValidationException('Uma ou mais atividades não pertencem ao grande evento da faixa.');
        }
        const proposedEvent = context.document.resources.some(
          (resource) => resource.kind === 'event' && resource.id === eventId,
        );
        if (!proposedEvent) {
          await this.assertPermissionAtPersistedAncestor(Permission.Event.Read, { eventId }, context);
        }
      }
    }
    if (merged['includesSportsRegistration'] === true) {
      const proposedPrice = context.document.resources.find(
        (resource) => resource.kind === 'major-event-price' && resource.id === priceId,
      );
      const majorEventId = price?.majorEventId ?? (proposedPrice ? asId(dataOf(proposedPrice)['majorEventId']) : null);
      if (majorEventId) {
        await this.assertPermissionAtPersistedAncestor(Permission.SportsTournament.Read, { majorEventId }, context);
      }
      const tournament = majorEventId
        ? await context.tx.sportsTournament.findFirst({
            where: { majorEventId, deletedAt: null },
            select: { id: true },
          })
        : null;
      const proposedTournament = context.document.resources.some(
        (resource) => resource.kind === 'sports-tournament' && dataOf(resource)['majorEventId'] === majorEventId,
      );
      if (!tournament && !proposedTournament)
        throw new TransferValidationException('Inscrição esportiva exige um torneio associado ao grande evento.');
    }
  }

  private async applyPlace(
    snapshot: ResolvedTransferResource,
    action: TransferWriteAction,
    context: TransferAdapterContext,
  ): Promise<TransferAdapterApplyResult> {
    const resource = snapshot.resource;
    const data = pickFields(dataOf(resource), PLACE_FIELDS);
    if (action === 'create') {
      await context.tx.placePreset.create({
        data: {
          id: resource.id,
          ...data,
          createdById: context.actor.sub,
          updatedById: context.actor.sub,
        } as Prisma.PlacePresetUncheckedCreateInput,
      });
    } else {
      const updated = await context.tx.placePreset.updateMany({
        where: { id: resource.id, deletedAt: null, updatedAt: new Date(snapshot.revision as string) },
        data: { ...data, updatedById: context.actor.sub } as Prisma.PlacePresetUpdateManyMutationInput,
      });
      if (updated.count !== 1) throw new ConflictException('O local mudou desde a prévia. Gere uma nova prévia.');
    }
    await this.recordAudit(
      context,
      AuditLogEntityType.PLACE_PRESET,
      resource.id,
      action === 'create' ? AuditLogOperation.CREATE : AuditLogOperation.UPDATE,
      data['name'] as string | undefined,
      snapshot.current ? dataOf(snapshot.current) : null,
      data,
      writePermission(resource.kind, action),
      {},
    );
    // Search updates are replayed from the durable journal after commit and after undo.
    return {};
  }

  private async applyForm(
    snapshot: ResolvedTransferResource,
    action: TransferWriteAction,
    context: TransferAdapterContext,
  ): Promise<TransferAdapterApplyResult> {
    const resource = snapshot.resource;
    const raw = dataOf(resource);
    const previous = snapshot.current ? dataOf(snapshot.current) : null;
    const form = await context.tx.eventForm.findFirst({
      where: { id: resource.id, deletedAt: null },
      select: FORM_SELECT,
    });
    const data = pickFields(raw, FORM_FIELDS, FORM_DATES);
    if (typeof data['name'] === 'string') data['name'] = data['name'].trim();
    if (typeof data['description'] === 'string') data['description'] = data['description'].trim() || null;
    if (raw['elements'] !== undefined)
      data['elements'] = storedElements(parseElementsJson(JSON.stringify(raw['elements'])), form?.elements);
    if (action === 'create') {
      await context.tx.eventForm.create({
        data: {
          id: resource.id,
          ...data,
          descriptionImages: [],
          createdById: context.actor.sub,
          updatedById: context.actor.sub,
        } as unknown as Prisma.EventFormUncheckedCreateInput,
      });
    } else {
      const updated = await context.tx.eventForm.updateMany({
        where: { id: resource.id, deletedAt: null, updatedAt: new Date(snapshot.revision as string) },
        data: { ...data, updatedById: context.actor.sub } as Prisma.EventFormUpdateManyMutationInput,
      });
      if (updated.count !== 1) throw new ConflictException('O formulário mudou desde a prévia. Gere uma nova prévia.');
    }
    await this.recordAudit(
      context,
      AuditLogEntityType.EVENT_FORM,
      resource.id,
      AuditLogOperation[action.toUpperCase() as 'CREATE' | 'UPDATE'],
      raw['name'] as string | undefined,
      previous,
      raw,
      Permission.EventForm[action === 'create' ? 'Create' : 'Update'],
      snapshot.scope,
    );
    return { postCommitEffects: [() => this.publishFormInvalidation(resource.id)] };
  }

  private async applyLink(
    snapshot: ResolvedTransferResource,
    action: TransferWriteAction,
    context: TransferAdapterContext,
  ): Promise<TransferAdapterApplyResult> {
    const resource = snapshot.resource;
    const raw = dataOf(resource);
    const previous = snapshot.current ? dataOf(snapshot.current) : null;
    const beforeLink =
      action === 'update'
        ? await context.tx.eventFormLink.findFirst({ where: { id: resource.id, deletedAt: null }, select: LINK_SELECT })
        : null;
    const data = pickFields(raw, LINK_FIELDS, FORM_DATES);
    const priceTierIds = raw['priceTierIds'] === undefined ? undefined : stringArray(raw['priceTierIds']);
    const insertInSubscriptionFlow =
      raw['insertInSubscriptionFlow'] === undefined
        ? previous?.['insertInSubscriptionFlow'] === true
        : raw['insertInSubscriptionFlow'] === true;
    const requiredInSubscriptionFlow =
      insertInSubscriptionFlow &&
      (raw['requiredInSubscriptionFlow'] === undefined
        ? previous?.['requiredInSubscriptionFlow'] === true
        : raw['requiredInSubscriptionFlow'] === true);
    data['requiredInSubscriptionFlow'] = requiredInSubscriptionFlow;
    data['notifyOnPublish'] = insertInSubscriptionFlow
      ? requiredInSubscriptionFlow
        ? (raw['notifyOnPublish'] ?? previous?.['notifyOnPublish'] ?? true)
        : false
      : (raw['notifyOnPublish'] ?? previous?.['notifyOnPublish'] ?? true);
    const targetType = raw['targetType'] ?? previous?.['targetType'];
    data['allowLecturerManualPublish'] =
      targetType === 'EVENT' && !insertInSubscriptionFlow
        ? (raw['allowLecturerManualPublish'] ?? previous?.['allowLecturerManualPublish'] ?? false)
        : false;
    if (Array.isArray(data['audiences'])) data['audiences'] = [...new Set(stringArray(data['audiences']))];
    const nextAudiences = stringArray(data['audiences'] ?? beforeLink?.audiences ?? ['SUBSCRIBERS', 'ATTENDEES']);
    const nextPriceTierIds = priceTierIds ?? beforeLink?.priceTiers.map(({ priceTierId }) => priceTierId) ?? [];
    const shouldNotifyPreviousSubscribers =
      insertInSubscriptionFlow && requiredInSubscriptionFlow && data['notifyOnPublish'] !== false;
    const notificationAudienceChanged =
      !beforeLink ||
      !beforeLink.insertInSubscriptionFlow ||
      !beforeLink.requiredInSubscriptionFlow ||
      !beforeLink.notifyOnPublish ||
      !sameStringSet(beforeLink.audiences, nextAudiences) ||
      !sameStringSet(
        beforeLink.priceTiers.map(({ priceTierId }) => priceTierId),
        nextPriceTierIds,
      );
    if (shouldNotifyPreviousSubscribers && notificationAudienceChanged) data['lastNotifiedAt'] = null;
    let linkId = resource.id;
    if (action === 'create') {
      const created = await context.tx.eventFormLink.create({
        data: {
          id: resource.id,
          ...data,
          createdById: context.actor.sub,
          updatedById: context.actor.sub,
        } as Prisma.EventFormLinkUncheckedCreateInput,
        select: { id: true },
      });
      linkId = created.id;
    } else {
      const updated = await context.tx.eventFormLink.updateMany({
        where: { id: resource.id, deletedAt: null, updatedAt: new Date(snapshot.revision as string) },
        data: { ...data, updatedById: context.actor.sub } as Prisma.EventFormLinkUpdateManyMutationInput,
      });
      if (updated.count !== 1)
        throw new ConflictException('O vínculo do formulário mudou desde a prévia. Gere uma nova prévia.');
    }
    if (priceTierIds !== undefined) await this.replaceLinkTiers(context.tx, linkId, priceTierIds);
    await this.recordAudit(
      context,
      AuditLogEntityType.EVENT_FORM_LINK,
      resource.id,
      action === 'create' ? AuditLogOperation.CREATE : AuditLogOperation.UPDATE,
      undefined,
      previous,
      raw,
      Permission.EventForm.Update,
      snapshot.scope,
    );
    return { postCommitEffects: [() => this.publishFormInvalidation(String(raw['formId'] ?? previous?.['formId']))] };
  }

  private async applyCertificate(
    snapshot: ResolvedTransferResource,
    action: TransferWriteAction,
    context: TransferAdapterContext,
  ): Promise<TransferAdapterApplyResult> {
    const resource = snapshot.resource;
    const raw = dataOf(resource);
    const previous = snapshot.current ? dataOf(snapshot.current) : null;
    const data = pickFields(raw, CERTIFICATE_FIELDS, CERTIFICATE_DATE_FIELDS);
    if (typeof data['name'] === 'string') data['name'] = this.certificateValidation.normalizeRequiredName(data['name']);
    if (typeof data['certificateText'] === 'string')
      data['certificateText'] = this.certificateValidation.normalizeOptionalText(data['certificateText']);
    if (typeof data['secondPageText'] === 'string')
      data['secondPageText'] = this.certificateValidation.normalizeOptionalText(data['secondPageText']);
    if (Array.isArray(data['paymentTiers']))
      data['paymentTiers'] = [
        ...new Set(
          stringArray(data['paymentTiers'])
            .map((name) => name.trim())
            .filter(Boolean),
        ),
      ];
    if (data['attendeeEligibility'] === 'ANYONE') data['attendeeEligibility'] = null;
    let certificateFieldsValue: Prisma.InputJsonValue | Prisma.JsonValue | null =
      (previous?.['certificateFields'] as Prisma.JsonValue | null | undefined) ?? null;
    if (Object.prototype.hasOwnProperty.call(data, 'certificateFields')) {
      const normalizedFields = this.certificateValidation.normalizeCertificateFieldsJson(
        data['certificateFields'] === null ? null : JSON.stringify(data['certificateFields']),
      );
      certificateFieldsValue = normalizedFields ?? null;
      data['certificateFields'] = normalizedFields === null ? Prisma.DbNull : normalizedFields;
    }
    if (action === 'create') {
      const scope = data['scope'];
      data['issuedTo'] ??= scope === 'OTHER' ? CertificateIssuedTo.OTHER : CertificateIssuedTo.ATTENDEE;
      data['shouldAutofillSecondPage'] ??= scope !== 'OTHER';
      data['isActive'] ??= true;
      data['paymentTiers'] ??= [];
      data['attendeeEligibility'] ??= null;
    }
    const shouldResolveTypeLabel =
      action === 'create' ||
      ['certificateTypeLabel', 'issuedTo', 'certificateFields'].some((field) =>
        Object.prototype.hasOwnProperty.call(data, field),
      );
    if (shouldResolveTypeLabel) {
      const issuedTo = (data['issuedTo'] ??
        previous?.['issuedTo'] ??
        CertificateIssuedTo.ATTENDEE) as CertificateIssuedTo;
      const customLabel = Object.prototype.hasOwnProperty.call(data, 'certificateTypeLabel')
        ? (data['certificateTypeLabel'] as string | null)
        : undefined;
      data['certificateTypeLabel'] = resolveCertificateTypeLabel(issuedTo, certificateFieldsValue, customLabel);
    }
    if (action === 'create') {
      await context.tx.certificateConfig.create({
        data: {
          id: resource.id,
          ...data,
          createdById: context.actor.sub,
          updatedById: context.actor.sub,
        } as Prisma.CertificateConfigUncheckedCreateInput,
      });
    } else {
      const updated = await context.tx.certificateConfig.updateMany({
        where: { id: resource.id, deletedAt: null, updatedAt: new Date(snapshot.revision as string) },
        data: { ...data, updatedById: context.actor.sub } as Prisma.CertificateConfigUpdateManyMutationInput,
      });
      if (updated.count !== 1)
        throw new ConflictException('A configuração de certificado mudou desde a prévia. Gere uma nova prévia.');
    }
    await this.recordAudit(
      context,
      AuditLogEntityType.CERTIFICATE_CONFIG,
      resource.id,
      action === 'create' ? AuditLogOperation.CREATE : AuditLogOperation.UPDATE,
      raw['name'] as string | undefined,
      previous,
      raw,
      Permission.CertificateConfig[action === 'create' ? 'Create' : 'Update'],
      snapshot.scope,
    );
    return {};
  }

  private async applyTicketConfig(
    snapshot: ResolvedTransferResource,
    action: TransferWriteAction,
    context: TransferAdapterContext,
  ): Promise<TransferAdapterApplyResult> {
    const resource = snapshot.resource;
    const raw = dataOf(resource);
    const previous = snapshot.current ? dataOf(snapshot.current) : null;
    const data = pickFields(raw, TICKET_CONFIG_FIELDS, TICKET_DATE_FIELDS);
    normalizeTicketConfigFields(data);
    const eventId = String(raw['eventId'] ?? previous?.['eventId'] ?? '');
    await this.issuance.lockEventExpirationAlignment(context.tx, eventId, 'UPDATE');
    if (action === 'create') {
      await context.tx.ticketConfig.create({
        data: { id: resource.id, ...data } as Prisma.TicketConfigUncheckedCreateInput,
      });
    } else {
      const updated = await context.tx.ticketConfig.updateMany({
        where: { id: resource.id, updatedAt: new Date(snapshot.revision as string) },
        data: data as Prisma.TicketConfigUpdateManyMutationInput,
      });
      if (updated.count !== 1)
        throw new ConflictException('A configuração de bilhetes mudou desde a prévia. Gere uma nova prévia.');
    }
    const after = await context.tx.ticketConfig.findUniqueOrThrow({
      where: { id: resource.id },
      select: { updatedAt: true },
    });
    await this.issuance.alignActiveTicketExpirations(context.tx, eventId, {
      scope: 'ALL_ACTIVE',
      actorUserId: context.actor.sub,
      permission: action === 'create' ? Permission.TicketConfig.Create : Permission.TicketConfig.Update,
      enqueueInvalidations: false,
    });
    await this.issuance.enqueueExistingSubscriptionReconciliation(context.tx, eventId, after.updatedAt);
    await this.attendanceCategories.refreshForEvent(eventId, context.tx);
    const holders = await context.tx.eventTicket.findMany({
      where: { eventId },
      select: { holder: { select: { userId: true } } },
    });
    await this.ticketRealtime.enqueueForUsers(
      context.tx,
      holders.map(({ holder }) => holder?.userId),
      { type: 'TICKETS_CHANGED', eventId },
    );
    await this.recordAudit(
      context,
      AuditLogEntityType.TICKET_CONFIG,
      resource.id,
      action === 'create' ? AuditLogOperation.CREATE : AuditLogOperation.UPDATE,
      raw['displayName'] as string | undefined,
      previous,
      raw,
      Permission.TicketConfig[action === 'create' ? 'Create' : 'Update'],
      snapshot.scope,
    );
    return {};
  }

  private async applyTicketOption(
    snapshot: ResolvedTransferResource,
    action: TransferWriteAction,
    context: TransferAdapterContext,
  ): Promise<TransferAdapterApplyResult> {
    const resource = snapshot.resource;
    const raw = dataOf(resource);
    const previous = snapshot.current ? dataOf(snapshot.current) : null;
    const data = pickFields(raw, TICKET_OPTION_FIELDS);
    if (action === 'create') {
      await context.tx.ticketPriceOption.create({
        data: { id: resource.id, ...data } as Prisma.TicketPriceOptionUncheckedCreateInput,
      });
    } else {
      const updated = await context.tx.ticketPriceOption.updateMany({
        where: { id: resource.id, updatedAt: new Date(snapshot.revision as string) },
        data: data as Prisma.TicketPriceOptionUpdateManyMutationInput,
      });
      if (updated.count !== 1)
        throw new ConflictException('A opção de bilhete mudou desde a prévia. Gere uma nova prévia.');
    }
    await this.recordAudit(
      context,
      AuditLogEntityType.SYSTEM,
      resource.id,
      action === 'create' ? AuditLogOperation.CREATE : AuditLogOperation.UPDATE,
      'ticket-price-option',
      previous,
      raw,
      Permission.TicketConfig[action === 'create' ? 'Create' : 'Update'],
      snapshot.scope,
    );
    return {};
  }

  private async applyPrice(
    snapshot: ResolvedTransferResource,
    action: TransferWriteAction,
    context: TransferAdapterContext,
  ): Promise<TransferAdapterApplyResult> {
    const resource = snapshot.resource;
    const raw = dataOf(resource);
    const previous = snapshot.current ? dataOf(snapshot.current) : null;
    const data = pickFields(raw, PRICE_FIELDS);
    if (action === 'create') {
      await context.tx.majorEventPrice.create({
        data: { id: resource.id, ...data } as Prisma.MajorEventPriceUncheckedCreateInput,
      });
    } else {
      const latest = await context.tx.majorEventPrice.findFirst({ where: { id: resource.id }, select: PRICE_SELECT });
      if (!latest || fingerprint(priceData(latest)) !== snapshot.revision)
        throw new ConflictException('A tabela de preços mudou desde a prévia. Gere uma nova prévia.');
      await context.tx.majorEventPrice.update({
        where: { id: resource.id },
        data: data as Prisma.MajorEventPriceUpdateInput,
      });
    }
    await this.recordAudit(
      context,
      AuditLogEntityType.SYSTEM,
      resource.id,
      action === 'create' ? AuditLogOperation.CREATE : AuditLogOperation.UPDATE,
      'major-event-price',
      previous,
      raw,
      Permission.MajorEvent.Update,
      snapshot.scope,
    );
    return { postCommitEffects: [() => this.syncMajorEvent(String(snapshot.scope.majorEventId))] };
  }

  private async applyPriceTier(
    snapshot: ResolvedTransferResource,
    action: TransferWriteAction,
    context: TransferAdapterContext,
  ): Promise<TransferAdapterApplyResult> {
    const resource = snapshot.resource;
    const raw = dataOf(resource);
    const previous = snapshot.current ? dataOf(snapshot.current) : null;
    const data = pickFields(raw, PRICE_TIER_FIELDS);
    if (typeof data['name'] === 'string') data['name'] = data['name'].trim();
    if (Array.isArray(data['allowedEventIds']))
      data['allowedEventIds'] = [
        ...new Set(
          stringArray(data['allowedEventIds'])
            .map((id) => id.trim())
            .filter(Boolean),
        ),
      ];
    if (action === 'create') {
      await context.tx.priceTier.create({ data: { id: resource.id, ...data } as Prisma.PriceTierUncheckedCreateInput });
    } else {
      const current = await context.tx.priceTier.findFirst({ where: { id: resource.id }, select: TIER_SELECT });
      if (!current || fingerprint(tierData(current)) !== snapshot.revision)
        throw new ConflictException('A faixa de preço mudou desde a prévia. Gere uma nova prévia.');
      await context.tx.priceTier.update({ where: { id: resource.id }, data: data as Prisma.PriceTierUpdateInput });
      if (
        typeof previous?.['name'] === 'string' &&
        typeof raw['name'] === 'string' &&
        previous['name'] !== raw['name']
      ) {
        await this.renameTierSnapshots(
          context.tx,
          String(snapshot.scope.majorEventId),
          String(previous['name']),
          raw['name'],
        );
      }
    }
    await this.recordAudit(
      context,
      AuditLogEntityType.SYSTEM,
      resource.id,
      action === 'create' ? AuditLogOperation.CREATE : AuditLogOperation.UPDATE,
      'price-tier',
      previous,
      raw,
      Permission.MajorEvent.Update,
      snapshot.scope,
    );
    return { postCommitEffects: [() => this.syncMajorEvent(String(snapshot.scope.majorEventId))] };
  }

  private async replaceLinkTiers(tx: Prisma.TransactionClient, linkId: string, ids: readonly string[]): Promise<void> {
    const existing = await tx.eventFormLinkPriceTier.findMany({ where: { linkId }, select: { priceTierId: true } });
    const existingIds = new Set(existing.map(({ priceTierId }) => priceTierId));
    const desired = new Set(ids);
    const removed = [...existingIds].filter((id) => !desired.has(id));
    const added = [...desired].filter((id) => !existingIds.has(id));
    if (removed.length > 0)
      await tx.eventFormLinkPriceTier.deleteMany({ where: { linkId, priceTierId: { in: removed } } });
    if (added.length > 0)
      await tx.eventFormLinkPriceTier.createMany({ data: added.map((priceTierId) => ({ linkId, priceTierId })) });
  }

  private async recordAudit(
    context: TransferAdapterContext,
    entityType: AuditLogEntityType,
    entityId: string,
    operation: AuditLogOperation,
    entityLabel: string | undefined,
    before: Record<string, unknown> | null,
    after: Record<string, unknown>,
    permission: Permission,
    scope: TransferAuthorizationScope,
  ): Promise<void> {
    await this.audit.record(
      {
        entityType,
        entityId,
        entityLabel,
        operation,
        actor: context.actor,
        before: before ? jsonSafe(before) : undefined,
        after: jsonSafe(after),
        scope: {
          permission,
          eventId: scope.eventId,
          eventGroupId: scope.eventGroupId,
          majorEventId: scope.majorEventId,
        },
        summary: 'Configuração atualizada por transferência de dados.',
        squashWindowMs: 0,
      },
      context.tx,
    );
  }

  private async publishFormInvalidation(formId: string): Promise<void> {
    const payload = { type: 'EVENT_FORMS_INVALIDATED', formId, occurredAt: new Date().toISOString() };
    await Promise.all([
      this.realtime.publish(this.realtime.scope('admin-workspace'), payload),
      this.realtime.publish(this.realtime.scope(PUBLIC_CATALOG_REALTIME_CHANNEL), createPublicCatalogInvalidation()),
    ]);
  }

  private async syncMajorEvent(majorEventId: string): Promise<void> {
    const majorEvent = await this.prisma.majorEvent.findFirst({
      where: { id: majorEventId, deletedAt: null },
      select: { id: true, name: true, description: true, startDate: true, endDate: true, publicationState: true },
    });
    if (!majorEvent) return;
    await Promise.all([
      this.sitemap.refresh(),
      this.search.upsertMajorEvent(majorEvent),
      this.realtime.publish(this.realtime.scope('admin-workspace'), {
        type: 'CATALOG_INVALIDATED',
        domain: 'major-event',
        occurredAt: new Date().toISOString(),
      }),
      this.realtime.publish(this.realtime.scope(PUBLIC_CATALOG_REALTIME_CHANNEL), createPublicCatalogInvalidation()),
    ]);
  }

  private async exportScope(target: TransferTarget, includeDescendants: boolean, context: TransferAdapterContext) {
    const eventIds: string[] = [];
    const eventGroupIds: string[] = [];
    const majorEventIds: string[] = [];
    if (target.kind === 'event') eventIds.push(target.id);
    if (target.kind === 'group') {
      eventGroupIds.push(target.id);
      if (includeDescendants) {
        const events = await context.tx.event.findMany({
          where: { eventGroupId: target.id, deletedAt: null },
          select: { id: true },
        });
        eventIds.push(...events.map(({ id }) => id));
      }
    }
    if (target.kind === 'major-event') {
      majorEventIds.push(target.id);
      if (includeDescendants) {
        const groups = await context.tx.eventGroup.findMany({
          where: { majorEventId: target.id, deletedAt: null },
          select: { id: true },
        });
        eventGroupIds.push(...groups.map(({ id }) => id));
        const events = await context.tx.event.findMany({
          where: { deletedAt: null, OR: [{ majorEventId: target.id }, { eventGroupId: { in: eventGroupIds } }] },
          select: { id: true },
        });
        eventIds.push(...events.map(({ id }) => id));
      }
    }
    return { eventIds: unique(eventIds), eventGroupIds: unique(eventGroupIds), majorEventIds };
  }

  private async priceTierRenameChanges(
    context: TransferAdapterContext,
    majorEventId: string | null,
    oldName: string,
    newName: string,
  ) {
    if (!majorEventId) return [];
    const normalizedOldName = normalizeAttendancePriceTier(oldName);
    const subscriptions = await context.tx.majorEventSubscription.findMany({
      where: { majorEventId, paymentTier: { not: null } },
      select: { paymentTier: true },
    });
    const subscriptionCount = subscriptions.filter(
      ({ paymentTier }) => paymentTier && normalizeAttendancePriceTier(paymentTier) === normalizedOldName,
    ).length;
    const configs = await context.tx.certificateConfig.findMany({
      where: { OR: [{ majorEventId }, { event: { majorEventId } }, { eventGroup: { majorEventId } }] },
      select: { paymentTiers: true },
    });
    const certificateCount = configs.filter((config) =>
      config.paymentTiers.some((name) => normalizeAttendancePriceTier(name) === normalizedOldName),
    ).length;
    return [
      ...(subscriptionCount > 0
        ? [
            {
              field: `Inscrições com faixa “${oldName}” → “${newName}”`,
              before: subscriptionCount,
              after: subscriptionCount,
            },
          ]
        : []),
      ...(certificateCount > 0
        ? [
            {
              field: `Certificados com faixa “${oldName}” → “${newName}”`,
              before: certificateCount,
              after: certificateCount,
            },
          ]
        : []),
    ];
  }

  private async priceTierIdsForMajorEvent(context: TransferAdapterContext, majorEventId: string): Promise<Set<string>> {
    const existingPrice = await context.tx.majorEventPrice.findFirst({ where: { majorEventId }, select: { id: true } });
    const priceIds = new Set<string>(existingPrice ? [existingPrice.id] : []);
    for (const resource of context.document.resources) {
      if (resource.kind === 'major-event-price' && dataOf(resource)['majorEventId'] === majorEventId)
        priceIds.add(resource.id);
    }
    const existingTiers = existingPrice
      ? await context.tx.priceTier.findMany({ where: { priceId: existingPrice.id }, select: { id: true } })
      : [];
    const importedTierIds = context.document.resources
      .filter((resource) => resource.kind === 'price-tier' && priceIds.has(asId(dataOf(resource)['priceId']) ?? ''))
      .map((resource) => resource.id);
    return new Set([...existingTiers.map(({ id }) => id), ...importedTierIds]);
  }

  private async renameTierSnapshots(
    tx: Prisma.TransactionClient,
    majorEventId: string,
    oldName: string,
    newName: string,
  ): Promise<void> {
    if (!majorEventId || oldName === newName) return;
    const normalizedOldName = normalizeAttendancePriceTier(oldName);
    const subscriptions = await tx.majorEventSubscription.findMany({
      where: { majorEventId, paymentTier: { not: null } },
      select: { id: true, paymentTier: true },
    });
    const subscriptionIds = subscriptions.flatMap(({ id, paymentTier }) =>
      paymentTier && normalizeAttendancePriceTier(paymentTier) === normalizedOldName ? [id] : [],
    );
    if (subscriptionIds.length > 0) {
      await tx.majorEventSubscription.updateMany({
        where: { id: { in: subscriptionIds } },
        data: { paymentTier: newName },
      });
    }
    const configs = await tx.certificateConfig.findMany({
      where: { OR: [{ majorEventId }, { event: { majorEventId } }, { eventGroup: { majorEventId } }] },
      select: { id: true, paymentTiers: true },
    });
    for (const config of configs) {
      if (!config.paymentTiers.some((name) => normalizeAttendancePriceTier(name) === normalizedOldName)) continue;
      await tx.certificateConfig.update({
        where: { id: config.id },
        data: {
          paymentTiers: [
            ...new Set(
              config.paymentTiers.map((name) =>
                normalizeAttendancePriceTier(name) === normalizedOldName ? newName : name,
              ),
            ),
          ],
        },
      });
    }
  }

  private async assertTierRenamePermissions(
    snapshot: ResolvedTransferResource,
    context: TransferAdapterContext,
    mode: 'read' | 'write',
  ): Promise<void> {
    const majorEventId = snapshot.scope.majorEventId;
    if (!majorEventId) throw new TransferValidationException('O escopo da faixa de preço não pôde ser confirmado.');
    for (const change of snapshot.additionalChanges ?? []) {
      const permission = change.field.startsWith('Inscrições')
        ? mode === 'read'
          ? Permission.Subscription.Read
          : Permission.Subscription.Update
        : mode === 'read'
          ? Permission.CertificateConfig.Read
          : Permission.CertificateConfig.Update;
      await this.authorization.assertPermissions(context.actor, [permission], { majorEventId });
    }
  }

  private async explicitPriceTierReferenceConflict(
    context: TransferAdapterContext,
    majorEventId: string | null,
    oldName: string,
    newName: string,
  ): Promise<string | null> {
    if (!majorEventId) return null;
    const relevantSubscriptions = context.document.resources.filter(
      (resource) => resource.kind === 'major-event-subscription' && dataOf(resource)['majorEventId'] === majorEventId,
    );
    if (relevantSubscriptions.length > 0) {
      await this.authorization.assertPermissions(context.actor, [Permission.Subscription.Read], { majorEventId });
      const normalizedOldName = normalizeAttendancePriceTier(oldName);
      for (const resource of relevantSubscriptions) {
        const person = dataOf(resource)['person'];
        if (!isRecord(person)) continue;
        const match = await this.people.match(person as TransferPersonReference, context.tx);
        if (!('id' in match)) continue;
        const current = await context.tx.majorEventSubscription.findFirst({
          where: { majorEventId, personId: match.id, deletedAt: null },
          select: { paymentTier: true },
        });
        const proposedPaymentTier = dataOf(resource)['paymentTier'];
        if (
          (current?.paymentTier && normalizeAttendancePriceTier(current.paymentTier) === normalizedOldName) ||
          proposedPaymentTier === oldName ||
          proposedPaymentTier === newName
        ) {
          return 'O arquivo também importa inscrições deste grande evento que dependem desta faixa. Atualize ou omita paymentTier e aplique a renomeação em uma importação separada.';
        }
      }
    }
    const relevantCertificateConfigs = context.document.resources.filter(
      (resource) =>
        resource.kind === 'certificate-config' &&
        certificateResourceMajorEventId(resource, context.document) === majorEventId,
    );
    if (relevantCertificateConfigs.length > 0) {
      await this.authorization.assertPermissions(context.actor, [Permission.CertificateConfig.Read], { majorEventId });
      const normalizedOldName = normalizeAttendancePriceTier(oldName);
      for (const resource of relevantCertificateConfigs) {
        const current = await context.tx.certificateConfig.findFirst({
          where: { id: resource.id, deletedAt: null },
          select: { paymentTiers: true },
        });
        const currentUsesTier =
          current?.paymentTiers.some((name) => normalizeAttendancePriceTier(name) === normalizedOldName) ?? false;
        const proposedUsesTier = stringArray(dataOf(resource)['paymentTiers']).some(
          (name) => name === oldName || name === newName,
        );
        if (currentUsesTier || proposedUsesTier) {
          return 'O arquivo também importa certificados que dependem desta faixa. Atualize ou omita paymentTiers e aplique a renomeação em uma importação separada.';
        }
      }
    }
    return null;
  }
}

function readPermission(kind: TransferResourceKind): Permission {
  switch (kind) {
    case 'event-form':
    case 'form-link':
      return Permission.EventForm.Read;
    case 'certificate-config':
      return Permission.CertificateConfig.Read;
    case 'ticket-config':
    case 'ticket-price-option':
      return Permission.TicketConfig.Read;
    case 'place-preset':
      return Permission.PlacePreset.Read;
    default:
      return Permission.MajorEvent.Read;
  }
}

function writePermission(kind: TransferResourceKind, action: TransferWriteAction): Permission {
  if (kind === 'event-form') return action === 'create' ? Permission.EventForm.Create : Permission.EventForm.Update;
  if (kind === 'form-link') return Permission.EventForm.Update;
  if (kind === 'certificate-config')
    return action === 'create' ? Permission.CertificateConfig.Create : Permission.CertificateConfig.Update;
  if (kind === 'ticket-config' || kind === 'ticket-price-option')
    return action === 'create' ? Permission.TicketConfig.Create : Permission.TicketConfig.Update;
  if (kind === 'place-preset')
    return action === 'create' ? Permission.PlacePreset.Create : Permission.PlacePreset.Update;
  return Permission.MajorEvent.Update;
}

function dataOf(resource: TransferResource): Record<string, unknown> {
  return resource.data as Record<string, unknown>;
}

function resourceFromData(
  kind: TransferResourceKind,
  id: string,
  data: Record<string, unknown>,
  revision?: Date,
): TransferResource {
  return {
    kind,
    id,
    ...(revision ? { revision: revision.toISOString() } : {}),
    data: jsonSafe(data),
  } as TransferResource;
}

function pickFields(
  data: Record<string, unknown>,
  fields: readonly string[],
  dateFields: ReadonlySet<string> = new Set(),
): Record<string, unknown> {
  return Object.fromEntries(
    fields.flatMap((field) => {
      if (!Object.prototype.hasOwnProperty.call(data, field)) return [];
      const value = data[field];
      return [[field, dateFields.has(field) && typeof value === 'string' ? new Date(value) : value]];
    }),
  );
}

function normalizeTicketConfigFields(data: Record<string, unknown>): void {
  for (const [field, maximum] of [
    ['displayName', 200],
    ['displayEmoji', 32],
    ['description', 2000],
    ['transferEligibilityDescription', 2000],
  ] as const) {
    const value = data[field];
    if (typeof value !== 'string') continue;
    const normalized = value.trim();
    if (normalized.length > maximum)
      throw new TransferValidationException('Um texto da configuração de bilhetes excede o limite permitido.');
    data[field] = normalized || null;
  }
  for (const field of ['includedPriceTierIds', 'recipientAllowedPriceTierIds', 'purchaseVisiblePriceTierIds']) {
    if (Array.isArray(data[field]))
      data[field] = [
        ...new Set(
          stringArray(data[field])
            .map((value) => value.trim())
            .filter(Boolean),
        ),
      ];
  }
  for (const field of ['recipientAcademicIdPrefixes', 'purchaseAcademicIdPrefixes']) {
    if (!Array.isArray(data[field])) continue;
    const prefixes = [
      ...new Set(
        stringArray(data[field])
          .map((value) => value.trim().normalize('NFKC'))
          .filter(Boolean),
      ),
    ];
    if (prefixes.some((prefix) => prefix.length > 24))
      throw new TransferValidationException('O prefixo da matrícula é muito longo.');
    data[field] = prefixes;
  }
  for (const field of ['recipientCourseCodes', 'purchaseCourseCodes']) {
    if (!Array.isArray(data[field])) continue;
    const codes = [
      ...new Set(
        stringArray(data[field])
          .map((value) => value.trim())
          .filter(Boolean),
      ),
    ];
    if (codes.some((code) => !/^\d{1,8}$/.test(code)))
      throw new TransferValidationException('Informe códigos de curso válidos.');
    data[field] = codes;
  }
}

function formData(row: Prisma.EventFormGetPayload<{ select: typeof FORM_SELECT }>): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const field of FORM_FIELDS) data[field] = row[field];
  return data;
}

function linkData(row: Prisma.EventFormLinkGetPayload<{ select: typeof LINK_SELECT }>): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const field of LINK_FIELDS) data[field] = row[field];
  data['priceTierIds'] = row.priceTiers.map(({ priceTierId }) => priceTierId);
  return data;
}

function certificateData(
  row: Prisma.CertificateConfigGetPayload<{ select: typeof CERTIFICATE_SELECT }>,
): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const field of CERTIFICATE_FIELDS) data[field] = row[field];
  return data;
}

function ticketData(row: Prisma.TicketConfigGetPayload<{ select: typeof TICKET_SELECT }>): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const field of TICKET_CONFIG_FIELDS) data[field] = row[field];
  return data;
}

function optionData(
  row: Prisma.TicketPriceOptionGetPayload<{ select: typeof OPTION_SELECT }>,
): Record<string, unknown> {
  return Object.fromEntries(TICKET_OPTION_FIELDS.map((field) => [field, row[field]]));
}

function priceData(row: Prisma.MajorEventPriceGetPayload<{ select: typeof PRICE_SELECT }>): Record<string, unknown> {
  return Object.fromEntries(PRICE_FIELDS.map((field) => [field, row[field]]));
}

function tierData(row: Prisma.PriceTierGetPayload<{ select: typeof TIER_SELECT }>): Record<string, unknown> {
  return Object.fromEntries(PRICE_TIER_FIELDS.map((field) => [field, row[field]]));
}

function formResource(row: Prisma.EventFormGetPayload<{ select: typeof FORM_SELECT }>): TransferResource {
  const data = formData(row);
  data['elements'] = portableElements(data['elements']);
  return resourceFromData('event-form', row.id, data, row.updatedAt);
}

function linkResource(row: Prisma.EventFormLinkGetPayload<{ select: typeof LINK_SELECT }>): TransferResource {
  return resourceFromData('form-link', row.id, linkData(row), row.updatedAt);
}

function certificateResource(
  row: Prisma.CertificateConfigGetPayload<{ select: typeof CERTIFICATE_SELECT }>,
): TransferResource {
  return resourceFromData('certificate-config', row.id, certificateData(row), row.updatedAt);
}

function ticketResource(row: Prisma.TicketConfigGetPayload<{ select: typeof TICKET_SELECT }>): TransferResource {
  return resourceFromData('ticket-config', row.id, ticketData(row), row.updatedAt);
}

function optionResource(row: Prisma.TicketPriceOptionGetPayload<{ select: typeof OPTION_SELECT }>): TransferResource {
  return resourceFromData('ticket-price-option', row.id, optionData(row), row.updatedAt);
}

function priceResource(row: Prisma.MajorEventPriceGetPayload<{ select: typeof PRICE_SELECT }>): TransferResource {
  return resourceFromData('major-event-price', row.id, priceData(row));
}

function tierResource(row: Prisma.PriceTierGetPayload<{ select: typeof TIER_SELECT }>): TransferResource {
  return resourceFromData('price-tier', row.id, tierData(row));
}

function portableElements(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  return value.map((entry) => {
    if (!isRecord(entry)) return entry;
    return Object.fromEntries(Object.entries(entry).filter(([key]) => key !== 'descriptionImages'));
  });
}

function hasFormImages(form: Prisma.EventFormGetPayload<{ select: typeof FORM_SELECT }>): boolean {
  if (Array.isArray(form.descriptionImages) && form.descriptionImages.length > 0) return true;
  return (
    Array.isArray(form.elements) &&
    form.elements.some(
      (entry) => isRecord(entry) && Array.isArray(entry['descriptionImages']) && entry['descriptionImages'].length > 0,
    )
  );
}

function storedElements(
  elements: ReturnType<typeof parseElementsJson>,
  existing: Prisma.JsonValue | undefined,
): Prisma.InputJsonValue {
  const currentById = new Map<string, Record<string, unknown>>();
  if (Array.isArray(existing)) {
    for (const entry of existing)
      if (isRecord(entry) && typeof entry['id'] === 'string') currentById.set(entry['id'], entry);
  }
  return elements.map((element) => {
    const current = currentById.get(element.id);
    const imageRefs = Array.isArray(current?.['descriptionImages']) ? current['descriptionImages'] : [];
    return {
      ...element,
      descriptionImages: imageRefs,
    };
  }) as unknown as Prisma.InputJsonValue;
}

function jsonSafe(value: unknown): JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number')
    return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item) => jsonSafe(item));
  if (isRecord(value))
    return Object.fromEntries(
      Object.entries(value).flatMap(([key, item]) => (key === 'location' ? [] : [[key, jsonSafe(item)]])),
    );
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function asId(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

function resolveCertificateTypeLabel(
  issuedTo: CertificateIssuedTo,
  fields: Prisma.InputJsonValue | Prisma.JsonValue | null,
  customLabel: string | null | undefined,
): string | null {
  const custom = typeof customLabel === 'string' ? customLabel.trim() || null : null;
  if (issuedTo === CertificateIssuedTo.ATTENDEE) return 'Participação';
  if (issuedTo === CertificateIssuedTo.LECTURER) {
    const fieldRecord = isRecord(fields as unknown) ? (fields as unknown as Record<string, unknown>) : null;
    const category = fieldRecord?.['__lecturerEventCategory'];
    if (category === 'PALESTRA') return 'Palestrante';
    if (category === 'MINICURSO') return 'Ministrante';
    return custom ?? 'Palestrante/ministrante';
  }
  return custom ?? sportsCertificateTypeLabel(issuedTo) ?? 'Manual';
}

function certificateResourceMajorEventId(
  resource: TransferResource,
  document: TransferAdapterContext['document'],
): string | null {
  const data = dataOf(resource);
  const majorEventId = asId(data['majorEventId']);
  if (majorEventId) return majorEventId;
  const eventId = asId(data['eventId']);
  const event = eventId
    ? document.resources.find((entry) => entry.kind === 'event' && entry.id === eventId)
    : undefined;
  if (event) {
    const eventData = dataOf(event);
    const directMajorEventId = asId(eventData['majorEventId']);
    if (directMajorEventId) return directMajorEventId;
    const groupId = asId(eventData['eventGroupId']);
    const group = groupId
      ? document.resources.find((entry) => entry.kind === 'group' && entry.id === groupId)
      : undefined;
    return group ? asId(dataOf(group)['majorEventId']) : null;
  }
  const groupId = asId(data['eventGroupId']);
  const group = groupId
    ? document.resources.find((entry) => entry.kind === 'group' && entry.id === groupId)
    : undefined;
  return group ? asId(dataOf(group)['majorEventId']) : null;
}

function refs(resource: TransferResource, fields: readonly string[]): ResolvedTransferResource['dependencies'] {
  const data = dataOf(resource);
  return fields.flatMap((field) => {
    const kind = referenceKind(field);
    if (!kind) return [];
    const value = data[field];
    if (Array.isArray(value)) return value.flatMap((entry) => (typeof entry === 'string' ? [{ kind, id: entry }] : []));
    return typeof value === 'string' ? [{ kind, id: value }] : [];
  });
}

function referenceKind(field: string): TransferResourceKind | null {
  const values: Record<string, TransferResourceKind> = {
    ownerEventId: 'event',
    ownerMajorEventId: 'major-event',
    formId: 'event-form',
    eventId: 'event',
    majorEventId: 'major-event',
    eventGroupId: 'group',
    priceId: 'major-event-price',
    ticketConfigId: 'ticket-config',
    priceTierId: 'price-tier',
    includedPriceTierIds: 'price-tier',
    recipientAllowedPriceTierIds: 'price-tier',
    purchaseVisiblePriceTierIds: 'price-tier',
    allowedEventIds: 'event',
  };
  return values[field] ?? null;
}

function fingerprint(value: unknown): string {
  return `sha256:${createHash('sha256')
    .update(JSON.stringify(jsonSafe(value)))
    .digest('hex')}`;
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(jsonSafe(left)) === JSON.stringify(jsonSafe(right));
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value) => right.includes(value));
}
