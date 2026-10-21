import { BadRequestException } from '@nestjs/common';
import type { TransferResource } from '@cacic-fct/shared-data-transfer';
import { normalizeAudienceInput } from '../audiences/audience-input';
import { assertAudiencePublicationReady, type AudiencePublicationTarget } from '../audiences/audience-publication';
import type { ResolvedTransferResource, TransferAdapterContext } from './data-transfer-adapter';
import { TransferValidationException } from './transfer-validation.exception';

const publicationDates = ['scheduledPublishAt', 'publishedAt', 'unpublishedAt'] as const;
const publicationFields = ['publicationState', ...publicationDates];
const audienceFields = ['audience', 'audienceCourseCodes', 'invitationPersonIds'];
const incompatibleDatesMessage = 'As datas de publicação são incompatíveis com o estado informado.';

function publicationDateFor(state: unknown): (typeof publicationDates)[number] | null {
  switch (state) {
    case 'SCHEDULED':
      return 'scheduledPublishAt';
    case 'PUBLISHED':
      return 'publishedAt';
    case 'UNPUBLISHED':
      return 'unpublishedAt';
    default:
      return null;
  }
}

/** Keep preview/apply deterministic and invitation ordering independent of the source file. */
export function normalizeEventTreeTransferResource(
  resource: TransferResource,
  current: TransferResource | null,
): TransferResource {
  const input = resource.data as Record<string, unknown>;
  if (Array.isArray(input['invitationPersonIds'])) {
    resource = {
      ...resource,
      data: { ...resource.data, invitationPersonIds: [...input['invitationPersonIds']].sort() },
    } as TransferResource;
  }
  if (resource.kind !== 'event' && resource.kind !== 'major-event') return resource;
  const data = { ...resource.data };
  const state = data.publicationState;
  if (state === undefined) return resource;
  const previous = current?.data as Record<string, unknown> | undefined;
  for (const field of publicationDates) {
    if (field !== publicationDateFor(state)) {
      if (data[field] != null) throw new TransferValidationException(incompatibleDatesMessage);
      data[field] = null;
    } else if (data[field] === undefined) {
      data[field] = previous?.['publicationState'] === state ? ((previous[field] as string | null) ?? null) : null;
    }
  }
  return { ...resource, data } as TransferResource;
}

export function transferPublicationActor(data: Record<string, unknown>, actorId: string | undefined) {
  if (!publicationFields.some((field) => data[field] !== undefined)) return {};
  return {
    publicationUpdatedBy: actorId,
    ...(data['publicationState'] === undefined
      ? {}
      : {
          publicationScheduledBy: data['publicationState'] === 'SCHEDULED' ? actorId : null,
        }),
  };
}

/** Uses only executable proposed parents when validating a partial plan. */
export async function validateTransferAudienceAndPublication(
  snapshot: ResolvedTransferResource,
  context: TransferAdapterContext,
): Promise<void> {
  const data = { ...snapshot.current?.data, ...snapshot.resource.data } as Record<string, unknown>;
  const input = snapshot.resource.data as Record<string, unknown>;
  const ids = input['invitationPersonIds'] as string[] | undefined;
  if (ids !== undefined) {
    const people = ids.length
      ? await context.tx.people.findMany({
          where: { id: { in: ids }, deletedAt: null, mergedIntoId: null },
          select: { id: true },
        })
      : [];
    if (people.length !== ids.length) {
      throw new TransferValidationException(
        'Os convidados devem ser pessoas ativas já cadastradas no destino. Revise os IDs informados.',
      );
    }
  }
  if (audienceFields.some((field) => input[field] !== undefined)) {
    try {
      normalizeAudienceInput(data as Parameters<typeof normalizeAudienceInput>[0]);
    } catch (error: unknown) {
      if (!(error instanceof BadRequestException)) throw error;
      throw new TransferValidationException('Revise o público-alvo, os cursos permitidos e a lista de convidados.');
    }
  }
  if (snapshot.resource.kind === 'group') return;
  const touchesPublication = publicationFields.some((field) => input[field] !== undefined);
  const touchesPolicy = [...audienceFields, 'attendanceEligibility'].some((field) => input[field] !== undefined);
  if (!touchesPublication && !touchesPolicy) return;
  const state = data['publicationState'] ?? 'DRAFT';
  if (touchesPublication) validatePublicationDates(data, state);
  if (state !== 'PUBLISHED' && state !== 'SCHEDULED') return;

  const target = publicationAudience(data);
  const groupId = data['eventGroupId'];
  if (typeof groupId === 'string') target.eventGroup = await parentAudience('group', groupId, context);
  const majorId = data['majorEventId'];
  target.majorEvent =
    typeof majorId === 'string' ? await parentAudience('major-event', majorId, context) : target.eventGroup?.majorEvent;
  try {
    assertAudiencePublicationReady(target);
  } catch (error: unknown) {
    if (!(error instanceof BadRequestException)) throw error;
    throw new TransferValidationException(error.message);
  }
}

function validatePublicationDates(data: Record<string, unknown>, state: unknown): void {
  for (const field of publicationDates) {
    if (field !== publicationDateFor(state) && data[field] != null) {
      throw new TransferValidationException(incompatibleDatesMessage);
    }
  }
  if (state === 'SCHEDULED') {
    const scheduled = data['scheduledPublishAt'];
    if (typeof scheduled !== 'string' || new Date(scheduled).getTime() <= Date.now()) {
      throw new TransferValidationException('A publicação agendada precisa ter uma data e hora no futuro.');
    }
  }
}

function publicationAudience(data: Record<string, unknown>): AudiencePublicationTarget {
  const ids = data['invitationPersonIds'];
  return {
    audience: typeof data['audience'] === 'string' ? data['audience'] : undefined,
    attendanceEligibility: typeof data['attendanceEligibility'] === 'string' ? data['attendanceEligibility'] : null,
    audienceInvitations: Array.isArray(ids) ? ids.map((personId: string) => ({ personId })) : [],
  };
}

async function parentAudience(
  kind: 'group' | 'major-event',
  id: string,
  context: TransferAdapterContext,
): Promise<AudiencePublicationTarget> {
  const select = {
    audience: true,
    audienceCourseCodes: true,
    attendanceEligibility: true,
    audienceInvitations: { where: { person: { deletedAt: null, mergedIntoId: null } }, select: { personId: true } },
    ...(kind === 'group' ? { majorEventId: true } : {}),
  } as const;
  const current =
    kind === 'group'
      ? await context.tx.eventGroup.findFirst({ where: { id, deletedAt: null }, select })
      : await context.tx.majorEvent.findFirst({ where: { id, deletedAt: null }, select });
  const proposed = context.document.resources.find((resource) => resource.kind === kind && resource.id === id);
  const data: Record<string, unknown> = {
    ...current,
    invitationPersonIds: current?.audienceInvitations.map((invitation) => invitation.personId) ?? [],
    ...proposed?.data,
  };
  const target = publicationAudience(data);
  if (kind === 'group' && typeof data['majorEventId'] === 'string') {
    target.majorEvent = await parentAudience('major-event', data['majorEventId'], context);
  }
  return target;
}
