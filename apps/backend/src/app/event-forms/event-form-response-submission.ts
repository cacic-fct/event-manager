import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  EventFormResponseSource as ContractResponseSource,
  SubmitEventFormResponseInput,
} from '@cacic-fct/shared-data-types';
import { type FormElement } from '@cacic-fct/form-contracts';
import {
  EventFormAudience,
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
  toDbResponseSource,
} from './event-form-targets';

export async function submitResponseForPerson(
  prisma: PrismaService,
  tx: Prisma.TransactionClient,
  personId: string,
  input: SubmitEventFormResponseInput,
  options: { requireSubscriptionFlowLink: boolean },
): Promise<{ formId: string; response: EventFormResponseRecord; sigilo: EventFormSigilo }> {
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
        select: {
          id: true,
        },
        orderBy: {
          submittedAt: 'desc',
        },
      })
    : null;

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
    formId: form.id,
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
      where: responseWhere,
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
