import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { EventFormResults } from '@cacic-fct/shared-data-types';
import { type FormElement } from '@cacic-fct/form-contracts';
import { Permission } from '@cacic-fct/shared-permissions';
import { EventFormSigilo, EventFormTargetType } from '@prisma/client';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { AuthorizationPolicyService } from '../authorization/authorization-policy.service';
import { CurrentUserContextService } from '../current-user/context.service';
import { GraphqlContext } from '../current-user/selects';
import { PrismaService } from '../prisma/prisma.service';
import { AccessibleEventTargets, isEmptyAccessibleTargets, resultResponseWhere } from './event-form-access';
import { assertPersonCanViewPublicResults, assertPersonIsEventLecturer } from './event-form-eligibility';
import {
  canShowIdentity,
  canShowIndividualAnswers,
  toEventFormModel,
  toPublicEventFormModel,
  toResponseModel,
} from './event-form-model.mapper';
import { buildFormResultSummary, eventFormResultsToCsv } from './event-form-results';
import { arePublicResultsReleasedForLink } from './event-form-results-visibility';
import { EventFormRecord, NormalizedTarget, responseInclude, ResultViewer, TargetInput } from './event-form-records';
import {
  canAdminViewEventFormResults,
  requireEventForm,
  requirePublishedEventForm,
} from './event-form-service-support';
import { findEventLinkRecord, findLinkRecordForTarget, normalizeTarget } from './event-form-targets';

type CurrentUserResultsAccess = {
  form: EventFormRecord;
  target: NormalizedTarget;
  viewer: 'admin' | 'public';
};

@Injectable()
export class EventFormResultsAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorizationPolicy: AuthorizationPolicyService,
    private readonly currentUserContext: CurrentUserContextService,
  ) {}

  async getCurrentUserResults(
    context: GraphqlContext,
    input: TargetInput & { formId: string },
  ): Promise<EventFormResults> {
    const access = await this.resolveCurrentUserResultsAccess(context, input);

    if (access.viewer === 'admin') {
      return this.getResults(access.form.id, 'admin', { target: access.target });
    }

    return this.getResults(access.form.id, 'public', { target: access.target });
  }

  async assertCurrentUserLiveResultsAccess(
    context: GraphqlContext,
    input: TargetInput & { formId: string },
  ): Promise<void> {
    await this.resolveCurrentUserResultsAccess(context, input, { requireLiveUpdates: true });
  }

  private async resolveCurrentUserResultsAccess(
    context: GraphqlContext,
    input: TargetInput & { formId: string },
    options: { requireLiveUpdates?: boolean } = {},
  ): Promise<CurrentUserResultsAccess> {
    const target = normalizeTarget(input);
    const authenticatedUser = this.currentUserContext.getAuthenticatedUser(context);
    const form = await requirePublishedEventForm(this.prisma, input.formId);

    if (
      !options.requireLiveUpdates &&
      (await canAdminViewEventFormResults(this.authorizationPolicy, authenticatedUser, form.id))
    ) {
      try {
        await this.authorizationPolicy.assertPermissions(authenticatedUser, [Permission.EventForm.Results], {
          eventId: target.eventId ?? undefined,
          majorEventId: target.majorEventId ?? undefined,
        });
        return { form, target, viewer: 'admin' };
      } catch (error) {
        if (!(error instanceof ForbiddenException)) {
          throw error;
        }
      }
    }

    const link = findLinkRecordForTarget(form, target);
    if (!link) {
      throw new NotFoundException('Formulário não vinculado a este evento ou grande evento.');
    }
    if (!arePublicResultsReleasedForLink(form, link) || (options.requireLiveUpdates && !form.resultsLive)) {
      throw new NotFoundException('Resultados do formulário não disponíveis.');
    }

    const person = await this.currentUserContext.requireCurrentPerson(context);
    await assertPersonCanViewPublicResults(this.prisma, person.id, link);

    return { form, target, viewer: 'public' };
  }

  async getAdminResults(user: AuthenticatedUser | undefined, formId: string): Promise<EventFormResults> {
    return this.getAdminResultsForPermission(user, formId, Permission.EventForm.Results);
  }

  async getAdminExportResults(user: AuthenticatedUser | undefined, formId: string): Promise<EventFormResults> {
    return this.getAdminResultsForPermission(user, formId, Permission.EventForm.Export);
  }

  private async getAdminResultsForPermission(
    user: AuthenticatedUser | undefined,
    formId: string,
    permission: Permission,
  ): Promise<EventFormResults> {
    const accessibleTargets = await this.authorizationPolicy.accessibleEventTargets(user, permission);
    if (accessibleTargets && isEmptyAccessibleTargets(accessibleTargets)) {
      throw new NotFoundException('Resultados do formulário não disponíveis.');
    }
    return this.getResults(formId, 'admin', {
      accessibleTargets: accessibleTargets ?? undefined,
    });
  }

  async getResults(
    formId: string,
    viewer: ResultViewer = 'admin',
    options: {
      target?: NormalizedTarget;
      accessibleTargets?: AccessibleEventTargets;
    } = {},
  ): Promise<EventFormResults> {
    const form = await requireEventForm(this.prisma, formId);
    const responseWhere = resultResponseWhere(form, options);
    const responses = await this.prisma.eventFormResponse.findMany({
      where: responseWhere,
      include: responseInclude,
      orderBy: {
        submittedAt: 'desc',
      },
    });
    const elements = form.elements as unknown as FormElement[];
    const answersReleased = canShowIndividualAnswers(form.sigilo, viewer);
    const identitiesReleased = canShowIdentity(form.sigilo, viewer);
    const summary = buildFormResultSummary(elements, responses, answersReleased);

    return {
      form:
        viewer === 'public' && options.target
          ? toPublicEventFormModel(toEventFormModel(form), options.target)
          : toEventFormModel(form),
      responseCount: responses.length,
      anonymous: form.sigilo === EventFormSigilo.ANONYMOUS,
      answersReleased,
      summaryJson: JSON.stringify(summary),
      responses: answersReleased || identitiesReleased
        ? responses.map((response) => toResponseModel(response, form.sigilo, viewer, { includeAnswers: answersReleased }))
        : [],
    };
  }

  async getLecturerResults(
    context: GraphqlContext,
    formId: string,
    eventId: string,
  ): Promise<EventFormResults> {
    const person = await this.currentUserContext.requireCurrentPerson(context);
    await assertPersonIsEventLecturer(this.prisma, person.id, eventId);
    const form = await requireEventForm(this.prisma, formId);
    const link = findEventLinkRecord(form, eventId);
    if (!link) {
      throw new NotFoundException('Formulário não vinculado a este evento.');
    }
    if (!arePublicResultsReleasedForLink(form, link)) {
      throw new NotFoundException('Resultados do formulário não disponíveis.');
    }

    return this.getResults(formId, 'lecturer', {
      target: {
        targetType: EventFormTargetType.EVENT,
        eventId,
        majorEventId: null,
      },
    });
  }

  async exportResultsCsv(formId: string, viewer: ResultViewer = 'admin'): Promise<string> {
    const results = await this.getResults(formId, viewer);
    return eventFormResultsToCsv(results);
  }

  async exportAdminResultsCsv(user: AuthenticatedUser | undefined, formId: string): Promise<string> {
    const results = await this.getAdminExportResults(user, formId);
    return eventFormResultsToCsv(results);
  }
}
