import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  EventFormResponseSource as ContractResponseSource,
  SubmitEventFormResponseInput,
} from '@cacic-fct/shared-data-types';
import { type FormElement } from '@cacic-fct/form-contracts';
import {
  AuditLogOperation,
  EventFormAudience,
  EventFormResponseSource,
  EventFormSigilo,
  EventFormTargetType,
  Prisma,
  PublicationState,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { assertStoredResponseHasCurrentRequiredAnswers, normalizeAnswers } from './event-form-answer-normalization';
import { assertPersonCanAnswerLink } from './event-form-eligibility';
import { EventFormResponseRecord, responseInclude, SubscriptionFlowTargetScope } from './event-form-records';
import {
  lockSingleResponseSlot,
  requireActiveLinkForTargetWithClient,
  requirePublishedEventFormWithClient,
} from './event-form-service-support';
import {
  normalizeTarget,
  responseLookupWhere,
  responseTargetWhere,
  subscriptionScopeResponseTargetWhere,
  toDbResponseSource,
} from './event-form-targets';

export async function submitResponseForPerson(
  prisma: PrismaService,
  tx: Prisma.TransactionClient,
  personId: string,
  input: SubmitEventFormResponseInput,
  options: { requireSubscriptionFlowLink: boolean },
): Promise<{
  form: Awaited<ReturnType<typeof requirePublishedEventFormWithClient>>;
  formId: string;
  operation: AuditLogOperation;
  previousResponse: EventFormResponseRecord | null;
  response: EventFormResponseRecord;
  sigilo: EventFormSigilo;
}> {
  const target = normalizeTarget(input);
  const form = await requirePublishedEventFormWithClient(tx, input.formId);
  const link = await requireActiveLinkForTargetWithClient(tx, form.id, target, input.linkId ?? undefined);
  if (options.requireSubscriptionFlowLink && !link.insertInSubscriptionFlow) {
    throw new NotFoundException('Formulário não disponível no fluxo de inscrição.');
  }
  await assertPersonCanAnswerLink(prisma, personId, link, {
    allowFutureSubscriber: options.requireSubscriptionFlowLink && link.insertInSubscriptionFlow,
  });
  const answers = normalizeAnswers(input.answersJson, form.elements as unknown as FormElement[], link.enforceRequiredAnswers);
  const responseSource = link.insertInSubscriptionFlow
    ? ContractResponseSource.SUBSCRIPTION_FLOW
    : ContractResponseSource.PUBLIC_FORM;

  const existingWhere = responseLookupWhere(form, personId, target);
  if (existingWhere) {
    await lockSingleResponseSlot(tx, form, personId, target);
  }
  const existing = existingWhere
    ? await tx.eventFormResponse.findFirst({
        where: existingWhere,
        include: responseInclude,
        orderBy: {
          submittedAt: 'desc',
        },
      })
    : null;
  if (existing && !form.allowResponseEdits) {
    throw new BadRequestException('Este formulário não permite editar respostas já enviadas.');
  }

  const response = existing
    ? await tx.eventFormResponse.update({
        where: {
          id: existing.id,
        },
        data: {
          linkId: link.id,
          targetType: target.targetType,
          eventId: target.eventId,
          majorEventId: target.majorEventId,
          answers: answers as unknown as Prisma.InputJsonValue,
          source: toDbResponseSource(responseSource),
          deletedAt: null,
        },
        include: responseInclude,
      })
    : await tx.eventFormResponse.create({
        data: {
          formId: form.id,
          linkId: link.id,
          targetType: target.targetType,
          eventId: target.eventId,
          majorEventId: target.majorEventId,
          personId,
          answers: answers as unknown as Prisma.InputJsonValue,
          source: toDbResponseSource(responseSource),
        },
        include: responseInclude,
      });

  return {
    form,
    formId: form.id,
    operation: existing ? AuditLogOperation.UPDATE : AuditLogOperation.CREATE,
    previousResponse: existing,
    response,
    sigilo: form.sigilo,
  };
}

export async function assertRequiredSubscriptionFlowResponses(
  tx: Prisma.TransactionClient,
  personId: string,
  scope: SubscriptionFlowTargetScope,
): Promise<void> {
  const now = new Date();
  const selectedEventIds = [...scope.selectedEventIds];
  const requiredLinks = await tx.eventFormLink.findMany({
    where: {
      deletedAt: null,
      insertInSubscriptionFlow: true,
      requiredInSubscriptionFlow: true,
      audience: {
        not: EventFormAudience.ATTENDEES,
      },
      OR: [
        {
          targetType: EventFormTargetType.MAJOR_EVENT,
          majorEventId: scope.majorEventId,
        },
        {
          targetType: EventFormTargetType.EVENT,
          eventId: {
            in: selectedEventIds,
          },
        },
      ],
      AND: [
        { OR: [{ availableFrom: null }, { availableFrom: { lte: now } }] },
        { OR: [{ availableUntil: null }, { availableUntil: { gt: now } }] },
      ],
      form: {
        deletedAt: null,
        publicationState: PublicationState.PUBLISHED,
      },
    },
    include: {
      form: {
        select: {
          id: true,
          name: true,
          responseMode: true,
          elements: true,
        },
      },
    },
  });

  for (const link of requiredLinks) {
    const target =
      link.targetType === EventFormTargetType.EVENT
        ? { targetType: EventFormTargetType.EVENT, eventId: link.eventId, majorEventId: null }
        : { targetType: EventFormTargetType.MAJOR_EVENT, eventId: null, majorEventId: link.majorEventId };
    const responseWhere =
      responseLookupWhere(link.form, personId, target) ??
      responseTargetWhere(link.formId, personId, target);
    const response = await tx.eventFormResponse.findFirst({
      where: {
        ...responseWhere,
        deletedAt: null,
      },
      select: {
        id: true,
        answers: true,
      },
    });

    if (!response) {
      throw new BadRequestException(`Responda o formulário obrigatório "${link.form.name}" para concluir a inscrição.`);
    }
    if (link.enforceRequiredAnswers) {
      assertStoredResponseHasCurrentRequiredAnswers(link.form, response.answers);
    }
  }
}

export async function archiveResponsesForSubscriptionScope(
  tx: Prisma.TransactionClient,
  personId: string,
  scope: SubscriptionFlowTargetScope,
  deletedAt = new Date(),
): Promise<string[]> {
  const targetWhere = subscriptionScopeResponseTargetWhere(scope);
  if (targetWhere.length === 0) {
    return [];
  }

  const responses = await tx.eventFormResponse.findMany({
    where: {
      personId,
      deletedAt: null,
      source: EventFormResponseSource.SUBSCRIPTION_FLOW,
      OR: targetWhere,
    },
    select: {
      id: true,
      formId: true,
    },
  });
  if (responses.length === 0) {
    return [];
  }

  await tx.eventFormResponse.updateMany({
    where: {
      id: {
        in: responses.map((response) => response.id),
      },
    },
    data: {
      deletedAt,
    },
  });

  return uniqueFormIds(responses);
}

export async function restoreResponsesForSubscriptionScope(
  tx: Prisma.TransactionClient,
  personId: string,
  scope: SubscriptionFlowTargetScope,
): Promise<string[]> {
  const targetWhere = subscriptionScopeResponseTargetWhere(scope);
  if (targetWhere.length === 0) {
    return [];
  }

  const responses = await tx.eventFormResponse.findMany({
    where: {
      personId,
      deletedAt: {
        not: null,
      },
      source: EventFormResponseSource.SUBSCRIPTION_FLOW,
      OR: targetWhere,
    },
    select: {
      id: true,
      formId: true,
    },
  });
  if (responses.length === 0) {
    return [];
  }

  await tx.eventFormResponse.updateMany({
    where: {
      id: {
        in: responses.map((response) => response.id),
      },
    },
    data: {
      deletedAt: null,
    },
  });

  return uniqueFormIds(responses);
}

function uniqueFormIds(responses: readonly { formId: string }[]): string[] {
  return [...new Set(responses.map((response) => response.formId))];
}
