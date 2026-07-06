import { Permission } from '@cacic-fct/shared-permissions';
import { AuditLogEntityType, AuditLogOperation } from '@prisma/client';
import { AuditRecordOptions } from '../audit-log/audit-log.types';
import { EventFormRecord, EventFormResponseRecord } from './event-form-records';

export function eventFormAuditRecord(
  form: EventFormRecord,
  operation: AuditLogOperation,
  actor: AuditRecordOptions['actor'],
  before: EventFormRecord | null,
  after: EventFormRecord | null,
  summary: string,
): AuditRecordOptions {
  return {
    entityType: AuditLogEntityType.EVENT_FORM,
    entityId: form.id,
    entityLabel: form.name,
    operation,
    actor,
    before: before ? eventFormAuditSnapshot(before) : null,
    after: after ? eventFormAuditSnapshot(after) : null,
    summary,
    scope: {
      permission: eventFormPermissionForOperation(operation),
      ...eventFormAuditScope(form),
    },
  };
}

export function eventFormResponseAuditRecord(
  form: EventFormRecord,
  response: EventFormResponseRecord,
  operation: AuditLogOperation,
  actor: AuditRecordOptions['actor'],
  before: EventFormResponseRecord | null,
): AuditRecordOptions {
  return {
    entityType: AuditLogEntityType.EVENT_FORM_RESPONSE,
    entityId: response.id,
    entityLabel: form.name,
    operation,
    actor,
    before: before ? eventFormResponseAuditSnapshot(before) : null,
    after: eventFormResponseAuditSnapshot(response),
    summary:
      operation === AuditLogOperation.CREATE
        ? `Resposta enviada para o formulário "${form.name}".`
        : `Resposta atualizada no formulário "${form.name}".`,
    scope: {
      permission: Permission.EventForm.Results,
      eventId: response.eventId,
      majorEventId: response.majorEventId,
    },
    metadata: {
      formId: form.id,
      linkId: response.linkId,
      responseSource: response.source,
    },
  };
}

function eventFormPermissionForOperation(operation: AuditLogOperation): Permission {
  switch (operation) {
    case AuditLogOperation.CREATE:
      return Permission.EventForm.Create;
    case AuditLogOperation.DELETE:
      return Permission.EventForm.Delete;
    default:
      return Permission.EventForm.Update;
  }
}

function eventFormAuditSnapshot(form: EventFormRecord): Record<string, unknown> {
  return {
    id: form.id,
    name: form.name,
    description: form.description,
    ownerEventId: form.ownerEventId,
    ownerMajorEventId: form.ownerMajorEventId,
    elements: form.elements,
    sigilo: form.sigilo,
    responseMode: form.responseMode,
    resultsPublic: form.resultsPublic,
    resultsLive: form.resultsLive,
    allowResponseEdits: form.allowResponseEdits,
    publicationState: form.publicationState,
    scheduledPublishAt: form.scheduledPublishAt,
    publishedAt: form.publishedAt,
    unpublishedAt: form.unpublishedAt,
    deletedAt: form.deletedAt,
    links: form.links.map((link) => ({
      id: link.id,
      targetType: link.targetType,
      eventId: link.eventId,
      majorEventId: link.majorEventId,
      audience: link.audience,
      insertInSubscriptionFlow: link.insertInSubscriptionFlow,
      requiredInSubscriptionFlow: link.requiredInSubscriptionFlow,
      enforceRequiredAnswers: link.enforceRequiredAnswers,
      displayOrder: link.displayOrder,
      availableFrom: link.availableFrom,
      availableUntil: link.availableUntil,
      notifyOnPublish: link.notifyOnPublish,
      allowLecturerManualPublish: link.allowLecturerManualPublish,
      deletedAt: link.deletedAt,
    })),
  };
}

function eventFormResponseAuditSnapshot(response: EventFormResponseRecord): Record<string, unknown> {
  return {
    id: response.id,
    formId: response.formId,
    linkId: response.linkId,
    targetType: response.targetType,
    eventId: response.eventId,
    majorEventId: response.majorEventId,
    source: response.source,
    submittedAt: response.submittedAt,
    updatedAt: response.updatedAt,
  };
}

function eventFormAuditScope(form: EventFormRecord): { eventId?: string | null; majorEventId?: string | null; eventGroupId?: string | null } {
  if (form.ownerEventId) {
    return {
      eventId: form.ownerEventId,
      majorEventId: form.ownerEvent?.majorEventId ?? null,
      eventGroupId: form.ownerEvent?.eventGroupId ?? null,
    };
  }
  if (form.ownerMajorEventId) {
    return { majorEventId: form.ownerMajorEventId };
  }
  if (form.links.length !== 1) {
    return {};
  }

  const link = form.links[0];
  if (link.eventId) {
    return {
      eventId: link.eventId,
      majorEventId: link.event?.majorEventId ?? null,
      eventGroupId: link.event?.eventGroupId ?? null,
    };
  }
  if (link.majorEventId) {
    return { majorEventId: link.majorEventId };
  }
  return {};
}
