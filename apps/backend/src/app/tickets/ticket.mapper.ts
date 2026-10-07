import {
  EventAudience,
  EventTicketStatus,
  PublicationState,
  TicketTransferInitiatorType,
  TicketTransferRecipientStatus,
  TicketTransferSenderStatus,
} from '@prisma/client';
import { TicketLifecycleState } from '@cacic-fct/shared-ticketing';
import { isValidCPF, maskCPF } from '@cacic-fct/shared-utils';
import { TicketTransferView } from './ticket-transfer.service';
import {
  AdminEventTicketModel,
  AdminTicketConfigModel,
  AdminTicketEligibilityModel,
  AdminTicketEligibilityWarningModel,
  AdminTicketHistoryEntryModel,
  TicketConfigModel,
  TicketEventSummaryModel,
  TicketPersonSummaryModel,
  TicketPriceOptionModel,
  TicketPurchaseVisibilityModel,
  TicketRecipientPolicyModel,
  TicketTransferAdminIdentityModel,
  TicketTransferModel,
  WalletTicketModel,
} from './ticket.models';

type PersonSummaryRecord = {
  id: string;
  name: string;
  identityDocument?: string | null;
  isCPF?: boolean | null;
};

type EventSummaryRecord = {
  id: string;
  majorEventId?: string | null;
  name: string;
  emoji: string;
  type: string;
  startDate: Date;
  endDate: Date;
  isPubliclyListed: boolean;
  publicationState: PublicationState;
  audience: EventAudience;
  deletedAt?: Date | null;
  locationDescription?: string | null;
  eventGroup?: {
    audience: EventAudience;
    publicationState?: PublicationState;
    deletedAt?: Date | null;
    majorEvent?: MajorEventVisibilityRecord | null;
  } | null;
  majorEvent?: MajorEventVisibilityRecord | null;
};

type MajorEventVisibilityRecord = {
  audience: EventAudience;
  publicationState?: PublicationState;
  deletedAt?: Date | null;
  majorEventPrices?: Array<{ tiers: Array<{ id: string; name: string }> }>;
};

type TicketRecord = {
  id: string;
  eventId: string;
  status: EventTicketStatus;
  expiresAt: Date;
  holder: (PersonSummaryRecord & { userId: string | null }) | null;
  originalHolder?: PersonSummaryRecord | null;
  source: string;
  sourceKey: string | null;
  ticketConfig: {
    enabled: boolean;
    displayName: string | null;
    displayEmoji: string | null;
    description: string | null;
    transferEligibilityDescription: string | null;
    transferable: boolean;
    recipientSubscriptionRequirement: string;
    recipientRequiresUnesp: boolean;
    recipientAcademicIdPrefixes: string[];
    recipientCourseCodes: string[];
    recipientRequiresAccountManagerVerification: boolean;
    recipientAllowedPriceTierIds: string[];
  };
  event: EventSummaryRecord & { majorEventId?: string | null };
  history?: Array<{
    id: string;
    ticketId: string;
    operation: string;
    previousHolder: PersonSummaryRecord | null;
    newHolder: PersonSummaryRecord | null;
    actorName: string | null;
    reason: string | null;
    createdAt: Date;
  }>;
};

type TicketConfigRecord = {
  id: string;
  eventId: string;
  enabled: boolean;
  displayName: string | null;
  displayEmoji: string | null;
  description: string | null;
  transferEligibilityDescription: string | null;
  transferable: boolean;
  issueOnEventSubscription: boolean;
  issueOnMajorEventSubscription: boolean;
  includedPriceTierIds: string[];
  recipientSubscriptionRequirement: string;
  recipientRequiresUnesp: boolean;
  recipientAcademicIdPrefixes: string[];
  recipientCourseCodes: string[];
  recipientRequiresAccountManagerVerification: boolean;
  recipientAllowedPriceTierIds: string[];
  purchaseEnabled: boolean;
  purchaseLimit?: number | null;
  purchaseRequiresUnesp: boolean;
  purchaseAcademicIdPrefixes: string[];
  purchaseCourseCodes: string[];
  purchaseRequiresAccountManagerVerification: boolean;
  purchaseVisiblePriceTierIds: string[];
  expirationMode: string;
  customExpiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  priceOptions: Array<{ id: string; priceTierId: string | null; label: string; amountCents: number }>;
  event: EventSummaryRecord & {
    majorEventId: string | null;
    eventGroup?: NonNullable<EventSummaryRecord['eventGroup']> & { majorEventId: string | null } | null;
  };
};

export function mapTicketEventSummary(event: EventSummaryRecord): TicketEventSummaryModel {
  const publicUrl = isEventPubliclyVisible(event) ? `/event/${event.id}` : null;
  return {
    id: event.id,
    name: event.name,
    emoji: event.emoji,
    type: event.type,
    startsAt: event.startDate,
    endsAt: event.endDate,
    locationDescription: event.locationDescription ?? null,
    publicUrl,
  };
}

export function mapTicketPersonSummary(person: PersonSummaryRecord): TicketPersonSummaryModel {
  return {
    personId: person.id,
    fullName: person.name,
    firstName: firstName(person.name),
    avatarUrl: null,
    redactedIdentityDocument: redactIdentityDocument(person.identityDocument, person.isCPF),
  };
}

export function mapWalletTicket(
  ticket: TicketRecord,
  includeAztecPayload: boolean,
  now = new Date(),
): WalletTicketModel {
  const status = ticket.status === EventTicketStatus.CONSUMED
    ? TicketLifecycleState.Consumed
    : ticket.status === EventTicketStatus.REVOKED
      ? TicketLifecycleState.Revoked
      : ticket.expiresAt <= now
        ? TicketLifecycleState.Expired
        : !ticket.ticketConfig.enabled
          ? TicketLifecycleState.Unavailable
          : TicketLifecycleState.Active;
  const name = ticket.ticketConfig.displayName?.trim() || ticket.event.name;
  const emoji = ticket.ticketConfig.displayEmoji?.trim() || ticket.event.emoji;
  const transferEligibilityDescription = describeTransferEligibility(ticket.ticketConfig, ticket.event);
  return {
    id: ticket.id,
    eventId: ticket.eventId,
    name,
    emoji,
    description: ticket.ticketConfig.description,
    transferEligibilityDescription,
    status,
    transferable: ticket.ticketConfig.enabled && ticket.ticketConfig.transferable,
    effectiveExpiresAt: ticket.expiresAt,
    event: mapTicketEventSummary(ticket.event),
    holder: ticket.holder ? mapTicketPersonSummary(ticket.holder) : null,
    aztecPayload:
      includeAztecPayload && status === TicketLifecycleState.Active && ticket.holder?.userId
        ? `ticket:${ticket.id}:${ticket.holder.userId}`
        : null,
  };
}

function describeTransferEligibility(
  config: TicketRecord['ticketConfig'],
  event: EventSummaryRecord,
): string | null {
  const configuredDescription = config.transferEligibilityDescription?.trim() || null;
  if (!config.transferable) return configuredDescription;

  const criteria: string[] = [];
  const isMajorEventSubscription = Boolean(event.majorEventId || event.eventGroup?.majorEvent);
  if (config.recipientSubscriptionRequirement === 'REQUIRED') {
    criteria.push(isMajorEventSubscription
      ? 'É necessário estar inscrito no grande evento.'
      : 'É necessário estar inscrito neste evento.');
  } else if (config.recipientSubscriptionRequirement === 'NONE') {
    criteria.push(isMajorEventSubscription
      ? 'O destinatário não pode estar inscrito no grande evento.'
      : 'O destinatário não pode estar inscrito neste evento.');
  }
  if (config.recipientRequiresUnesp) criteria.push('É necessário possuir vínculo UNESP.');
  if (config.recipientAcademicIdPrefixes.length > 0) {
    criteria.push(`Matrícula com prefixo ${formatList(config.recipientAcademicIdPrefixes)}.`);
  }
  if (config.recipientCourseCodes.length > 0) {
    const courses = config.recipientCourseCodes.map((code) =>
      code === '12' ? 'Ciência da Computação (código 12)' : `curso de código ${code}`,
    );
    criteria.push(`Curso exigido: ${formatList(courses)}.`);
  }
  if (config.recipientRequiresAccountManagerVerification) {
    criteria.push('A verificação pela Conta do Aluno é obrigatória.');
  }
  if (config.recipientAllowedPriceTierIds.length > 0) {
    const majorEvent = event.majorEvent ?? event.eventGroup?.majorEvent;
    const tiers = majorEvent?.majorEventPrices?.flatMap(({ tiers: priceTiers }) => priceTiers) ?? [];
    const allowedTierNames = config.recipientAllowedPriceTierIds.map((tierId) =>
      tiers.find((tier) => tier.id === tierId)?.name ?? 'faixa de preço ativa',
    );
    criteria.push(`Faixas de preço permitidas: ${formatList(allowedTierNames)}.`);
  }

  const audienceSummary = criteria.length === 0
    ? 'Qualquer pessoa com conta ativa pode receber este bilhete.'
    : criteria.join(' ');
  return [audienceSummary, configuredDescription].filter((value): value is string => Boolean(value)).join('\n\n');
}

function formatList(values: readonly string[]): string {
  return values.join(', ');
}

export function mapTicketConfig(config: TicketConfigRecord): TicketConfigModel {
  const recipientPolicy: TicketRecipientPolicyModel = {
    subscriptionRequirement: config.recipientSubscriptionRequirement as TicketRecipientPolicyModel['subscriptionRequirement'],
    requiresUnesp: config.recipientRequiresUnesp,
    requiredAcademicIdPrefixes: config.recipientAcademicIdPrefixes,
    requiredCourseCodes: config.recipientCourseCodes,
    requiresAccountManagerVerification: config.recipientRequiresAccountManagerVerification,
    allowedPriceTierIds: config.recipientAllowedPriceTierIds,
  };
  const purchaseVisibility: TicketPurchaseVisibilityModel = {
    subscriptionRequirement: 'REQUIRED',
    requiresUnesp: config.purchaseRequiresUnesp,
    requiredAcademicIdPrefixes: config.purchaseAcademicIdPrefixes,
    requiredCourseCodes: config.purchaseCourseCodes,
    requiresAccountManagerVerification: config.purchaseRequiresAccountManagerVerification,
    allowedPriceTierIds: config.purchaseVisiblePriceTierIds,
    requiresValidatedSubscription: true,
  };
  const priceOptions: TicketPriceOptionModel[] = config.priceOptions.map((option) => ({ ...option }));
  return {
    id: config.id,
    eventId: config.eventId,
    enabled: config.enabled,
    displayName: config.displayName,
    displayEmoji: config.displayEmoji,
    description: config.description,
    transferEligibilityDescription: config.transferEligibilityDescription,
    transferable: config.transferable,
    issueOnEventSubscription: config.issueOnEventSubscription,
    issueOnMajorEventSubscription: config.issueOnMajorEventSubscription,
    includedPriceTierIds: config.includedPriceTierIds,
    recipientPolicy,
    purchaseEnabled: config.purchaseEnabled,
    purchaseLimit: config.purchaseLimit ?? null,
    purchaseVisibility,
    priceOptions,
    expirationMode: config.expirationMode as TicketConfigModel['expirationMode'],
    customExpiresAt: config.customExpiresAt,
    createdAt: config.createdAt,
    updatedAt: config.updatedAt,
  };
}

export function mapAdminTicketConfig(
  config: TicketConfigRecord,
  warnings: readonly AdminTicketEligibilityWarningModel[] = [],
): AdminTicketConfigModel {
  return Object.assign(new AdminTicketConfigModel(), mapTicketConfig(config), {
    event: mapTicketEventSummary(config.event),
    majorEventId: config.event.majorEventId ?? config.event.eventGroup?.majorEventId ?? null,
    warnings: [...warnings],
  });
}

export function mapAdminEligibilityWarnings(
  value: { eligible: boolean; warnings: readonly { code: string; message: string }[] },
): AdminTicketEligibilityModel {
  return {
    eligible: value.eligible,
    warnings: value.warnings.map((warning) => Object.assign(new AdminTicketEligibilityWarningModel(), warning)),
  };
}

export function mapTicketTransfer(
  transfer: import('./ticket-transfer.service').TicketTransferRecord,
  view: TicketTransferView,
  service: import('./ticket-transfer.service').TicketTransferService,
  now = new Date(),
): TicketTransferModel {
  const isAuthor = view === 'AUTHOR';
  const isRecipient = view === 'RECIPIENT';
  const senderFacing = isAuthor || view === 'ADMIN_SENDER';
  const effectiveUpdatedAt = senderFacing && transfer.senderStatus === TicketTransferSenderStatus.PENDING
    ? transfer.createdAt
    : senderFacing && transfer.senderStatus === TicketTransferSenderStatus.CANCELED
      ? transfer.canceledAt ?? transfer.createdAt
      : senderFacing && transfer.senderStatus === TicketTransferSenderStatus.ACCEPTED
        ? transfer.acceptedAt ?? transfer.createdAt
        : transfer.updatedAt;
  const ignoredForList = isRecipient && transfer.recipientStatus !== TicketTransferRecipientStatus.PENDING;
  const canceledForList = isAuthor && transfer.senderStatus === TicketTransferSenderStatus.CANCELED;
  const ticket = mapWalletTicket(transfer.ticket, false, now);
  const model = new TicketTransferModel();
  Object.assign(model, {
    id: transfer.id,
    ticket,
    event: mapTicketEventSummary(transfer.event),
    sender: transfer.sender ? mapTicketPersonSummary(transfer.sender) : null,
    recipient: isRecipient && transfer.recipient ? mapTicketPersonSummary(transfer.recipient) : null,
    submittedDestinationIdentityDocument: isAuthor ? service.revealSubmittedDocument(transfer) : null,
    senderStatus: transfer.senderStatus,
    recipientStatus: senderFacing ? TicketTransferRecipientStatus.PENDING : transfer.recipientStatus,
    ignoreReason: senderFacing ? null : transfer.ignoreReason,
    initiatedByAdmin: transfer.initiatorType === TicketTransferInitiatorType.ADMIN,
    initiatingAdmin:
      (isRecipient || view === 'ADMIN_SENDER') && transfer.initiatingAdmin
        ? Object.assign(new TicketTransferAdminIdentityModel(), {
            personId: transfer.initiatingAdmin.id,
            firstName: firstName(transfer.initiatingAdmin.name),
            avatarUrl: null,
          })
        : null,
    createdAt: transfer.createdAt,
    updatedAt: effectiveUpdatedAt,
    expiresFromListAt: ignoredForList || canceledForList
      ? new Date(transfer.event.endDate.getTime() + 30 * 24 * 60 * 60 * 1_000)
      : null,
    canCancel:
      isAuthor && transfer.senderStatus === TicketTransferSenderStatus.PENDING,
    canAccept:
      isRecipient &&
      transfer.senderStatus === TicketTransferSenderStatus.PENDING &&
      transfer.recipientStatus === TicketTransferRecipientStatus.PENDING &&
      transfer.ticket.ticketConfig.enabled &&
      transfer.ticket.status === EventTicketStatus.ACTIVE &&
      (transfer.initiatorType === TicketTransferInitiatorType.ADMIN || transfer.ticket.expiresAt > now),
  });
  return model;
}

export function mapAdminEventTicket(ticket: TicketRecord): AdminEventTicketModel {
  const model = new AdminEventTicketModel();
  Object.assign(model, mapWalletTicket(ticket, true), {
    originalHolder: ticket.originalHolder ? mapTicketPersonSummary(ticket.originalHolder) : null,
    source: ticket.source,
    sourceReference: ticket.sourceKey,
    lastHistoryEntry: ticket.history?.[0] ? mapAdminTicketHistory(ticket.history[0]) : null,
  });
  return model;
}

export function mapAdminTicketHistory(row: {
  id: string;
  ticketId: string;
  operation: string;
  previousHolder: PersonSummaryRecord | null;
  newHolder: PersonSummaryRecord | null;
  actorName: string | null;
  reason: string | null;
  createdAt: Date;
}): AdminTicketHistoryEntryModel {
  return Object.assign(new AdminTicketHistoryEntryModel(), {
    id: row.id,
    ticketId: row.ticketId,
    operation: row.operation,
    previousHolder: row.previousHolder ? mapTicketPersonSummary(row.previousHolder) : null,
    newHolder: row.newHolder ? mapTicketPersonSummary(row.newHolder) : null,
    actorName: row.actorName,
    reason: row.reason,
    createdAt: row.createdAt,
  });
}

export function isEventPubliclyVisible(event: EventSummaryRecord): boolean {
  return event.isPubliclyListed &&
    event.deletedAt == null &&
    event.publicationState === PublicationState.PUBLISHED &&
    event.audience === EventAudience.PUBLIC &&
    (!event.eventGroup || (
      event.eventGroup.deletedAt == null &&
      event.eventGroup.audience === EventAudience.PUBLIC &&
      (!event.eventGroup.publicationState || event.eventGroup.publicationState === PublicationState.PUBLISHED) &&
      (!event.eventGroup.majorEvent || (
        event.eventGroup.majorEvent.deletedAt == null &&
        event.eventGroup.majorEvent.audience === EventAudience.PUBLIC &&
        (!event.eventGroup.majorEvent.publicationState || event.eventGroup.majorEvent.publicationState === PublicationState.PUBLISHED)
      ))
    )) &&
    (!event.majorEvent || (
      event.majorEvent.deletedAt == null &&
      event.majorEvent.audience === EventAudience.PUBLIC &&
      (!event.majorEvent.publicationState || event.majorEvent.publicationState === PublicationState.PUBLISHED)
    ));
}

function redactIdentityDocument(value: string | null | undefined, isCPF: boolean | null | undefined): string | null {
  if (!value?.trim()) return null;
  const digits = value.replace(/\D/g, '');
  const isCpf = isCPF === true || (isCPF == null && isValidCPF(value));
  return isCpf && digits.length === 11 ? maskCPF(value) : '••••';
}

function firstName(name: string): string {
  return name.trim().split(/\s+/u)[0] ?? '';
}
