import {
  EventForm as EventFormModel,
  EventFormDraft as EventFormDraftModel,
  EventFormLink as EventFormLinkModel,
  EventFormResponse as EventFormResponseModel,
  EventFormTargetSummary,
} from '@cacic-fct/shared-data-types';
import { FormElement, FormImage, FormImageReference } from '@cacic-fct/form-contracts';
import { EventFormSigilo, EventFormTargetType, Prisma } from '@prisma/client';
import {
  EventFormLinkRecord,
  EventFormRecord,
  EventFormResponseRecord,
  ResultViewer,
  TargetInput,
} from './event-form-records';
import { arePublicResultsReleasedForLink } from './event-form-results-visibility';
import { isSameTarget } from './event-form-targets';
import { toEventFormImageModel } from './event-form-image.utils';

export function toEventFormModel(form: EventFormRecord): EventFormModel {
  const images = form.images ?? [];
  const assetsById = new Map(images.map((image) => [image.id, image]));
  const elements = Array.isArray(form.elements)
    ? (form.elements as unknown as FormElement[]).map((element) => ({
        ...element,
        descriptionImages: hydrateImages(element.descriptionImages, assetsById),
      }))
    : [];
  return {
    id: form.id,
    name: form.name,
    description: form.description,
    descriptionImages: hydrateImages(
      Array.isArray(form.descriptionImages) ? (form.descriptionImages as FormImageReference[]) : [],
      assetsById,
    ),
    ownerEventId: form.ownerEventId,
    ownerMajorEventId: form.ownerMajorEventId,
    owner: form.ownerEvent
      ? toTargetSummary(EventFormTargetType.EVENT, form.ownerEvent)
      : form.ownerMajorEvent
        ? toTargetSummary(EventFormTargetType.MAJOR_EVENT, form.ownerMajorEvent)
        : null,
    elementsJson: JSON.stringify(elements),
    sigilo: form.sigilo,
    responseMode: form.responseMode,
    resultsPublic: form.resultsPublic,
    resultsLive: form.resultsLive,
    allowResponseEdits: form.allowResponseEdits,
    publicationState: form.publicationState,
    scheduledPublishAt: form.scheduledPublishAt,
    publishedAt: form.publishedAt,
    unpublishedAt: form.unpublishedAt,
    links: form.links.map((link) => toLinkModel(link)),
    responseCount: form._count.responses,
    deletedAt: form.deletedAt,
    createdAt: form.createdAt,
    createdById: form.createdById,
    updatedAt: form.updatedAt,
    updatedById: form.updatedById,
  };
}

function hydrateImages(
  references: readonly FormImageReference[] | undefined,
  assetsById: ReadonlyMap<string, EventFormRecord['images'][number]>,
): FormImage[] {
  return (references ?? []).flatMap((reference) => {
    const asset = assetsById.get(reference.id);
    return asset ? [{ ...toEventFormImageModel(asset), altText: reference.altText, caption: reference.caption }] : [];
  });
}

export function toPublicEventFormModel(form: EventFormModel, target?: TargetInput): EventFormModel {
  const links = target ? form.links.filter((link) => isSameTarget(link, target)) : form.links;
  const visibleLinks = links.map((link) =>
    arePublicResultsReleasedForLink(form, link)
      ? link
      : {
          ...link,
          responseCount: 0,
        },
  );

  return {
    ...form,
    responseCount: visibleLinks.reduce((total, link) => total + link.responseCount, 0),
    links: visibleLinks,
  };
}

export function toLinkModel(link: EventFormLinkRecord): EventFormLinkModel {
  return {
    id: link.id,
    formId: link.formId,
    targetType: link.targetType,
    eventId: link.eventId,
    majorEventId: link.majorEventId,
    priceTierIds: link.priceTiers?.map(({ priceTierId }) => priceTierId) ?? [],
    target: link.event
      ? toTargetSummary(EventFormTargetType.EVENT, link.event)
      : link.majorEvent
        ? toTargetSummary(EventFormTargetType.MAJOR_EVENT, link.majorEvent)
        : null,
    audience: link.audience,
    insertInSubscriptionFlow: link.insertInSubscriptionFlow,
    requiredInSubscriptionFlow: link.requiredInSubscriptionFlow,
    displayOrder: link.displayOrder,
    availableFrom: link.availableFrom,
    availableUntil: link.availableUntil,
    notifyOnPublish: link.notifyOnPublish,
    allowLecturerManualPublish: link.allowLecturerManualPublish,
    lastNotifiedAt: link.lastNotifiedAt,
    responseCount: link._count.responses,
    createdAt: link.createdAt,
    updatedAt: link.updatedAt,
  };
}

export function toDraftModel(draft: {
  id: string;
  sourceFormId: string;
  name: string;
  payload: Prisma.JsonValue;
  createdById: string | null;
  createdByName: string | null;
  createdByEmail: string | null;
  updatedById: string | null;
  updatedByName: string | null;
  updatedByEmail: string | null;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
}): EventFormDraftModel {
  return {
    id: draft.id,
    sourceFormId: draft.sourceFormId,
    name: draft.name,
    payloadJson: JSON.stringify(draft.payload),
    createdById: draft.createdById,
    createdByName: draft.createdByName,
    createdByEmail: draft.createdByEmail,
    updatedById: draft.updatedById,
    updatedByName: draft.updatedByName,
    updatedByEmail: draft.updatedByEmail,
    createdAt: draft.createdAt,
    updatedAt: draft.updatedAt,
    expiresAt: draft.expiresAt,
  };
}

export function toResponseModel(
  response: EventFormResponseRecord,
  sigilo: EventFormSigilo,
  viewer: ResultViewer,
  options: { includeAnswers?: boolean } = {},
): EventFormResponseModel {
  const canShowIdentityValue = canShowIdentity(sigilo, viewer);
  const canShowSubmittedAt = sigilo !== EventFormSigilo.ANONYMOUS || viewer === 'self';
  const includeAnswers = (options.includeAnswers ?? true) && canShowIndividualAnswers(sigilo, viewer);

  return {
    id: response.id,
    formId: response.formId,
    linkId: response.linkId,
    targetType: response.targetType,
    eventId: response.eventId,
    majorEventId: response.majorEventId,
    personId: canShowIdentityValue ? response.personId : null,
    respondentName: canShowIdentityValue ? response.person.name : null,
    respondentEmail: canShowIdentityValue ? response.person.email : null,
    answersJson: JSON.stringify(includeAnswers ? response.answers : []),
    source: response.source,
    submittedAt: canShowSubmittedAt ? response.submittedAt : null,
    updatedAt: response.updatedAt,
  };
}

export function canShowIdentity(sigilo: EventFormSigilo, viewer: ResultViewer): boolean {
  if (viewer === 'self') {
    return true;
  }
  if (sigilo === EventFormSigilo.ANONYMOUS) {
    return false;
  }
  if (viewer === 'admin') {
    return true;
  }
  return sigilo === EventFormSigilo.PUBLIC || sigilo === EventFormSigilo.PARTIALLY_SECRET;
}

export function canShowIndividualAnswers(sigilo: EventFormSigilo, viewer: ResultViewer): boolean {
  if (viewer === 'self' || viewer === 'admin') {
    return true;
  }
  return sigilo === EventFormSigilo.PUBLIC;
}

function toTargetSummary(
  type: EventFormTargetType,
  target: { id: string; name: string; emoji?: string | null },
): EventFormTargetSummary {
  return {
    type,
    id: target.id,
    name: target.name,
    emoji: target.emoji ?? null,
  };
}
