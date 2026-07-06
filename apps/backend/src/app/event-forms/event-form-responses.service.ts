import { Injectable } from '@nestjs/common';
import {
  EventFormResponse as EventFormResponseModel,
  SubmitEventFormResponseInput,
} from '@cacic-fct/shared-data-types';
import { Prisma } from '@prisma/client';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuditRecordOptions } from '../audit-log/audit-log.types';
import { CurrentUserContextService } from '../current-user/context.service';
import { GraphqlContext } from '../current-user/selects';
import { PrismaService } from '../prisma/prisma.service';
import { eventFormResponseAuditRecord } from './event-form-audit';
import { toResponseModel } from './event-form-model.mapper';
import { responseInclude, SubscriptionFlowTargetScope, TargetInput } from './event-form-records';
import {
  archiveResponsesForSubscriptionScope,
  assertRequiredSubscriptionFlowResponses,
  restoreResponsesForSubscriptionScope,
  submitResponseForPerson,
} from './event-form-response-submission';
import { EventFormResultEventsService } from './event-form-result-events.service';
import { requireEventForm, runSerializableFormTransaction } from './event-form-service-support';
import {
  assertSubscriptionFlowTargetAllowed,
  normalizeTarget,
  responseLookupWhere,
  responseTargetWhere,
} from './event-form-targets';

@Injectable()
export class EventFormResponsesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly currentUserContext: CurrentUserContextService,
    private readonly resultEvents: EventFormResultEventsService,
    private readonly auditLog: AuditLogService,
  ) {}

  async submitCurrentUserResponse(
    context: GraphqlContext,
    input: SubmitEventFormResponseInput,
  ): Promise<EventFormResponseModel> {
    const person = await this.currentUserContext.requireCurrentPerson(context);
    const actor = this.currentUserContext.getAuthenticatedUser(context);
    const result = await runSerializableFormTransaction(this.prisma, async (tx) => {
      const submitted = await submitResponseForPerson(this.prisma, tx, person.id, input, {
        requireSubscriptionFlowLink: false,
      });
      await this.auditLog.record(
        eventFormResponseAuditRecord(
          submitted.form,
          submitted.response,
          submitted.operation,
          actor,
          submitted.previousResponse,
        ),
        tx,
      );
      return submitted;
    });

    await this.resultEvents.emitResultsDelta(result.formId);

    return toResponseModel(result.response, result.sigilo, 'self');
  }

  async submitSubscriptionFlowResponses(
    tx: Prisma.TransactionClient,
    personId: string,
    inputs: readonly SubmitEventFormResponseInput[] | null | undefined,
    scope: SubscriptionFlowTargetScope,
    actor?: AuditRecordOptions['actor'],
  ): Promise<string[]> {
    const submittedFormIds: string[] = [];
    for (const input of inputs ?? []) {
      assertSubscriptionFlowTargetAllowed(input, scope);
      const result = await submitResponseForPerson(this.prisma, tx, personId, input, {
        requireSubscriptionFlowLink: true,
      });
      await this.auditLog.record(
        eventFormResponseAuditRecord(
          result.form,
          result.response,
          result.operation,
          actor,
          result.previousResponse,
        ),
        tx,
      );
      submittedFormIds.push(result.formId);
    }

    submittedFormIds.push(...(await restoreResponsesForSubscriptionScope(tx, personId, scope)));
    await assertRequiredSubscriptionFlowResponses(tx, personId, scope);
    return [...new Set(submittedFormIds)];
  }

  async archiveResponsesForSubscriptionScope(
    tx: Prisma.TransactionClient,
    personId: string,
    scope: SubscriptionFlowTargetScope,
    deletedAt = new Date(),
  ): Promise<string[]> {
    return archiveResponsesForSubscriptionScope(tx, personId, scope, deletedAt);
  }

  async getCurrentUserResponse(
    context: GraphqlContext,
    input: TargetInput & { formId: string; linkId?: string | null },
  ): Promise<EventFormResponseModel | null> {
    const person = await this.currentUserContext.requireCurrentPerson(context);
    const target = normalizeTarget(input);
    const form = await requireEventForm(this.prisma, input.formId);
    const response = await this.prisma.eventFormResponse.findFirst({
      where: responseLookupWhere(form, person.id, target) ?? responseTargetWhere(form.id, person.id, target),
      include: responseInclude,
      orderBy: {
        submittedAt: 'desc',
      },
    });

    if (!response) {
      return null;
    }

    return toResponseModel(response, form.sigilo, 'self');
  }
}
