import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { EventFormAudience as ContractAudience, EventFormInput } from '@cacic-fct/shared-data-types';
import { Permission } from '@cacic-fct/shared-permissions';
import {
  EventFormResponseMode,
  EventFormTargetType,
  Prisma,
  PublicationState,
} from '@prisma/client';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { AuthorizationPolicyService } from '../authorization/authorization-policy.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  eventFormInclude,
  EventFormLinkRecord,
  EventFormRecord,
  NormalizedTarget,
  TargetInput,
} from './event-form-records';
import {
  isLinkAvailable,
  normalizeTarget,
  toDbAudience,
} from './event-form-targets';

export async function requireEventForm(
  prisma: PrismaService,
  formId: string,
): Promise<EventFormRecord> {
  const form = await prisma.eventForm.findFirst({
    where: {
      id: formId,
      deletedAt: null,
    },
    include: eventFormInclude,
  });

  if (!form) {
    throw new NotFoundException(`Event form ${formId} was not found.`);
  }

  return form;
}

export async function updateDraftForSourceForm(
  prisma: PrismaService,
  draftId: string,
  sourceFormId: string,
  data: Prisma.EventFormDraftUpdateManyMutationInput,
) {
  const updated = await prisma.eventFormDraft.updateMany({
    where: {
      id: draftId,
      sourceFormId,
    },
    data,
  });
  if (updated.count === 0) {
    throw new NotFoundException('Rascunho não encontrado para este formulário.');
  }

  return prisma.eventFormDraft.findUniqueOrThrow({
    where: { id: draftId },
  });
}

export async function requirePublishedEventForm(
  prisma: PrismaService,
  formId: string,
): Promise<EventFormRecord> {
  const form = await requireEventForm(prisma, formId);
  if (form.publicationState !== PublicationState.PUBLISHED) {
    throw new NotFoundException(`Event form ${formId} is not published.`);
  }
  return form;
}

export async function requirePublishedEventFormWithClient(
  tx: Prisma.TransactionClient,
  formId: string,
): Promise<EventFormRecord> {
  const form = await tx.eventForm.findFirst({
    where: {
      id: formId,
      deletedAt: null,
    },
    include: eventFormInclude,
  });
  if (!form) {
    throw new NotFoundException(`Event form ${formId} was not found.`);
  }
  if (form.publicationState !== PublicationState.PUBLISHED) {
    throw new NotFoundException(`Event form ${formId} is not published.`);
  }
  return form;
}

export async function requireActiveLinkForTarget(
  prisma: PrismaService,
  formId: string,
  target: NormalizedTarget,
  linkId?: string,
): Promise<EventFormLinkRecord> {
  const form = await requireEventForm(prisma, formId);
  return findAvailableTargetLink(form, target, linkId);
}

export async function requireActiveLinkForTargetWithClient(
  tx: Prisma.TransactionClient,
  formId: string,
  target: NormalizedTarget,
  linkId?: string,
): Promise<EventFormLinkRecord> {
  const form = await tx.eventForm.findFirst({
    where: {
      id: formId,
      deletedAt: null,
    },
    include: eventFormInclude,
  });
  if (!form) {
    throw new NotFoundException(`Event form ${formId} was not found.`);
  }
  return findAvailableTargetLink(form, target, linkId);
}

export async function replaceEventFormLinks(
  tx: Prisma.TransactionClient,
  formId: string,
  links: readonly NonNullable<EventFormInput['links']>[number][],
  actorId: string | undefined,
): Promise<void> {
  const nextLinkIds = new Set(links.map((link) => link.id).filter((id): id is string => Boolean(id)));
  await tx.eventFormLink.updateMany({
    where: {
      formId,
      deletedAt: null,
      ...(nextLinkIds.size > 0 ? { id: { notIn: [...nextLinkIds] } } : {}),
    },
    data: {
      deletedAt: new Date(),
      updatedById: actorId,
    },
  });

  for (const link of links) {
    const target = normalizeTarget(link);
    const data = {
      targetType: target.targetType,
      eventId: target.eventId,
      majorEventId: target.majorEventId,
      audience: toDbAudience(link.audience ?? ContractAudience.SUBSCRIBERS_OR_ATTENDEES),
      insertInSubscriptionFlow: link.insertInSubscriptionFlow ?? false,
      requiredInSubscriptionFlow: link.insertInSubscriptionFlow ? (link.requiredInSubscriptionFlow ?? false) : false,
      enforceRequiredAnswers: link.enforceRequiredAnswers ?? true,
      displayOrder: link.displayOrder ?? 0,
      availableFrom: link.availableFrom ?? null,
      availableUntil: link.availableUntil ?? null,
      notifyOnPublish: link.insertInSubscriptionFlow ? false : (link.notifyOnPublish ?? true),
      allowLecturerManualPublish:
        target.targetType === EventFormTargetType.EVENT && !link.insertInSubscriptionFlow
          ? (link.allowLecturerManualPublish ?? false)
          : false,
      updatedById: actorId,
    } satisfies Prisma.EventFormLinkUncheckedUpdateInput;

    if (link.id) {
      const updated = await tx.eventFormLink.updateMany({
        where: { id: link.id, formId, deletedAt: null },
        data,
      });
      if (updated.count === 0) {
        throw new BadRequestException('Vínculo de formulário inválido para este formulário.');
      }
    } else {
      await tx.eventFormLink.create({
        data: {
          formId,
          ...data,
          createdById: actorId,
        },
      });
    }
  }
}

export async function assertCanManageLinkedTargets(
  authorizationPolicy: AuthorizationPolicyService,
  user: AuthenticatedUser | undefined,
  links: readonly TargetInput[],
  permission: Permission,
): Promise<void> {
  for (const link of links) {
    const target = normalizeTarget(link);
    await authorizationPolicy.assertPermissions(user, [permission], {
      eventId: target.eventId ?? undefined,
      majorEventId: target.majorEventId ?? undefined,
    });
  }
}

export async function canAdminViewEventFormResults(
  authorizationPolicy: AuthorizationPolicyService,
  user: AuthenticatedUser | undefined,
  formId: string,
): Promise<boolean> {
  try {
    await authorizationPolicy.assertPermissions(user, [Permission.EventForm.Results], {
      eventFormId: formId,
    });
    return true;
  } catch (error) {
    if (!(error instanceof ForbiddenException)) {
      throw error;
    }
    return false;
  }
}

export async function lockSingleResponseSlot(
  tx: Prisma.TransactionClient,
  form: Pick<EventFormRecord, 'id' | 'responseMode'>,
  personId: string,
  target: NormalizedTarget,
): Promise<void> {
  const targetKey =
    form.responseMode === EventFormResponseMode.SINGLE_PER_FORM
      ? 'form'
      : `${target.targetType}:${target.eventId ?? target.majorEventId ?? ''}`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`event-form-response:${form.id}:${personId}:${targetKey}`}, 0))`;
}

export async function runSerializableFormTransaction<T>(
  prisma: PrismaService,
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if (attempt < maxAttempts && error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
        continue;
      }
      throw error;
    }
  }

  throw new BadRequestException('Não foi possível salvar a resposta do formulário.');
}

export function normalizeFormName(value: string | null | undefined, fallback: string): string {
  const normalized = value?.trim();
  return normalized || fallback;
}

export function normalizeOptionalFormText(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized || null;
}

export function eventFormActorInfo(user: AuthenticatedUser | undefined): { id?: string; name?: string; email?: string } {
  return {
    id: user?.sub,
    name: (typeof user?.claims['name'] === 'string' ? user.claims['name'] : undefined) ?? user?.preferredUsername,
    email: user?.email,
  };
}

function findAvailableTargetLink(
  form: Pick<EventFormRecord, 'links'>,
  target: NormalizedTarget,
  linkId?: string,
): EventFormLinkRecord {
  const link = form.links.find(
    (item) =>
      (!linkId || item.id === linkId) &&
      item.targetType === target.targetType &&
      item.eventId === target.eventId &&
      item.majorEventId === target.majorEventId,
  );
  if (!link) {
    throw new NotFoundException('Formulário não vinculado a este evento ou grande evento.');
  }
  if (!isLinkAvailable(link)) {
    throw new NotFoundException('Formulário não disponível para este período.');
  }
  return link;
}
