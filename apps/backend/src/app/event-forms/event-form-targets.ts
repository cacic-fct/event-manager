import { BadRequestException } from '@nestjs/common';
import { EventForm as EventFormModel, EventFormInput, EventFormLink as EventFormLinkModel } from '@cacic-fct/shared-data-types';
import { EventFormAudience, EventFormResponseMode, EventFormResponseSource, EventFormSigilo, EventFormTargetType, Prisma } from '@prisma/client';
import {
  EventFormAudience as ContractAudience,
  EventFormResponseMode as ContractResponseMode,
  EventFormResponseSource as ContractResponseSource,
  EventFormSigilo as ContractSigilo,
} from '@cacic-fct/shared-data-types';
import { EventFormLinkRecord, EventFormRecord, NormalizedTarget, SubscriptionFlowTargetScope, TargetInput } from './event-form-records';

export function normalizeOwner(input: EventFormInput): { ownerEventId: string | null; ownerMajorEventId: string | null } {
  const ownerEventId = input.ownerEventId?.trim() || null;
  const ownerMajorEventId = input.ownerMajorEventId?.trim() || null;
  if (ownerEventId && ownerMajorEventId) {
    throw new BadRequestException('Um formulário deve pertencer a um evento ou a um grande evento, não ambos.');
  }
  if (!ownerEventId && !ownerMajorEventId) {
    throw new BadRequestException('Formulário deve pertencer a um evento ou a um grande evento.');
  }
  return { ownerEventId, ownerMajorEventId };
}

export function normalizeTarget(input: TargetInput): NormalizedTarget {
  const targetType = String(input.targetType);
  if (targetType === EventFormTargetType.EVENT) {
    const eventId = input.eventId?.trim();
    if (!eventId) {
      throw new BadRequestException('Evento do formulário não informado.');
    }
    return { targetType: EventFormTargetType.EVENT, eventId, majorEventId: null };
  }

  if (targetType !== EventFormTargetType.MAJOR_EVENT) {
    throw new BadRequestException('Tipo de alvo do formulário inválido.');
  }

  const majorEventId = input.majorEventId?.trim();
  if (!majorEventId) {
    throw new BadRequestException('Grande evento do formulário não informado.');
  }
  return { targetType: EventFormTargetType.MAJOR_EVENT, eventId: null, majorEventId };
}

export function isSameTarget(left: TargetInput, right: TargetInput): boolean {
  const leftTarget = normalizeTarget(left);
  const rightTarget = normalizeTarget(right);
  return (
    leftTarget.targetType === rightTarget.targetType &&
    leftTarget.eventId === rightTarget.eventId &&
    leftTarget.majorEventId === rightTarget.majorEventId
  );
}

export function assertSubscriptionFlowTargetAllowed(
  input: TargetInput,
  scope: SubscriptionFlowTargetScope,
): void {
  const target = normalizeTarget(input);
  if (target.targetType === EventFormTargetType.MAJOR_EVENT) {
    if (target.majorEventId === scope.majorEventId) {
      return;
    }
    throw new BadRequestException('Formulário obrigatório fora da inscrição selecionada.');
  }

  if (target.eventId && scope.selectedEventIds.has(target.eventId)) {
    return;
  }
  throw new BadRequestException('Formulário obrigatório fora dos eventos selecionados.');
}

export function findLinkForTarget(form: EventFormModel, input: TargetInput): EventFormLinkModel | null {
  const target = normalizeTarget(input);
  return (
    form.links.find(
      (link) =>
        link.targetType === target.targetType &&
        link.eventId === target.eventId &&
        link.majorEventId === target.majorEventId,
    ) ?? null
  );
}

export function ownerTargetInput(target: { ownerEventId: string | null; ownerMajorEventId: string | null }): TargetInput {
  return target.ownerEventId
    ? { targetType: EventFormTargetType.EVENT, eventId: target.ownerEventId }
    : { targetType: EventFormTargetType.MAJOR_EVENT, majorEventId: target.ownerMajorEventId };
}

export function formOwnerTargetInput(form: Pick<EventFormRecord, 'ownerEventId' | 'ownerMajorEventId'>): TargetInput {
  return form.ownerEventId
    ? { targetType: EventFormTargetType.EVENT, eventId: form.ownerEventId }
    : { targetType: EventFormTargetType.MAJOR_EVENT, majorEventId: form.ownerMajorEventId };
}

export function formTargetInputs(form: EventFormRecord): TargetInput[] {
  const targets: TargetInput[] = [];
  if (form.ownerEventId) {
    targets.push({ targetType: EventFormTargetType.EVENT, eventId: form.ownerEventId });
  }
  if (form.ownerMajorEventId) {
    targets.push({ targetType: EventFormTargetType.MAJOR_EVENT, majorEventId: form.ownerMajorEventId });
  }
  targets.push(...form.links);
  return targets;
}

export function manageableLinksForReplace(
  existingLinks: readonly EventFormLinkRecord[],
  nextLinks: readonly NonNullable<EventFormInput['links']>[number][],
): TargetInput[] {
  const affectedLinks: TargetInput[] = [...nextLinks];
  const nextLinksById = new Map(nextLinks.flatMap((link) => (link.id ? [[link.id, link] as const] : [])));

  for (const existingLink of existingLinks) {
    const nextLink = nextLinksById.get(existingLink.id);
    if (!nextLink || !isSameTarget(existingLink, nextLink)) {
      affectedLinks.push(existingLink);
    }
  }

  return affectedLinks;
}

export function isLinkAvailable(link: Pick<EventFormLinkRecord, 'availableFrom' | 'availableUntil'>): boolean {
  const now = Date.now();
  return (!link.availableFrom || link.availableFrom.getTime() <= now) && (!link.availableUntil || link.availableUntil.getTime() > now);
}

export function findEventLinkRecord(form: EventFormRecord, eventId: string): EventFormLinkRecord | null {
  return form.links.find((link) => link.eventId === eventId || link.event?.id === eventId) ?? null;
}

export function findLinkRecordForTarget(form: EventFormRecord, target: NormalizedTarget): EventFormLinkRecord | null {
  return (
    form.links.find(
      (link) =>
        link.targetType === target.targetType &&
        link.eventId === target.eventId &&
        link.majorEventId === target.majorEventId,
    ) ?? null
  );
}

export function responseLookupWhere(
  form: Pick<EventFormRecord, 'id' | 'responseMode'>,
  personId: string,
  target: NormalizedTarget,
): Prisma.EventFormResponseWhereInput | null {
  if (form.responseMode === EventFormResponseMode.MULTIPLE_PER_TARGET) {
    return null;
  }

  if (form.responseMode === EventFormResponseMode.SINGLE_PER_FORM) {
    return {
      formId: form.id,
      personId,
    };
  }

  return responseTargetWhere(form.id, personId, target);
}

export function responseTargetWhere(
  formId: string,
  personId: string,
  target: NormalizedTarget,
): Prisma.EventFormResponseWhereInput {
  return {
    formId,
    personId,
    targetType: target.targetType,
    eventId: target.eventId,
    majorEventId: target.majorEventId,
  };
}

export function toDbSigilo(value: ContractSigilo | EventFormSigilo): EventFormSigilo {
  return value as EventFormSigilo;
}

export function toDbAudience(value: ContractAudience | EventFormAudience): EventFormAudience {
  return value as EventFormAudience;
}

export function toDbResponseMode(value: ContractResponseMode | EventFormResponseMode): EventFormResponseMode {
  return value as EventFormResponseMode;
}

export function toDbResponseSource(value: ContractResponseSource | EventFormResponseSource): EventFormResponseSource {
  return value as EventFormResponseSource;
}
