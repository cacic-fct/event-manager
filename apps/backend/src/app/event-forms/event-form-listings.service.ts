import { Injectable } from '@nestjs/common';
import { EventForm as EventFormModel } from '@cacic-fct/shared-data-types';
import { Permission } from '@cacic-fct/shared-permissions';
import { EventFormTargetType, Prisma, PublicationState } from '@prisma/client';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { AuthorizationPolicyService } from '../authorization/authorization-policy.service';
import { CurrentUserContextService } from '../current-user/context.service';
import { GraphqlContext } from '../current-user/selects';
import { PrismaService } from '../prisma/prisma.service';
import { buildAccessibleFormWhere, isEmptyAccessibleTargets } from './event-form-access';
import { assertPersonIsEventLecturer, canPersonAnswerLink, canPersonViewPublicResults } from './event-form-eligibility';
import { toEventFormModel, toPublicEventFormModel } from './event-form-model.mapper';
import { arePublicResultsReleasedForLink } from './event-form-results-visibility';
import { eventFormInclude, TargetInput } from './event-form-records';
import { requireEventForm } from './event-form-service-support';
import { findLinkForTarget, normalizeTarget } from './event-form-targets';

@Injectable()
export class EventFormListingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorizationPolicy: AuthorizationPolicyService,
    private readonly currentUserContext: CurrentUserContextService,
  ) {}

  async listAdminForms(
    user: AuthenticatedUser | undefined,
    filters: { query?: string | null; eventId?: string | null; majorEventId?: string | null } = {},
  ): Promise<EventFormModel[]> {
    const where: Prisma.EventFormWhereInput = {
      deletedAt: null,
    };
    const andFilters: Prisma.EventFormWhereInput[] = [];
    const accessibleTargets = await this.authorizationPolicy.accessibleEventTargets(user, Permission.EventForm.Read);
    if (accessibleTargets && isEmptyAccessibleTargets(accessibleTargets)) {
      return [];
    }
    if (accessibleTargets) {
      andFilters.push(buildAccessibleFormWhere(accessibleTargets));
    }

    const normalizedQuery = filters.query?.trim();
    if (normalizedQuery) {
      where.name = {
        contains: normalizedQuery,
        mode: 'insensitive',
      };
    }
    if (filters.eventId) {
      andFilters.push({
        OR: [
          { ownerEventId: filters.eventId },
          { links: { some: { eventId: filters.eventId, deletedAt: null } } },
        ],
      });
    }
    if (filters.majorEventId) {
      andFilters.push({
        OR: [
          { ownerMajorEventId: filters.majorEventId },
          { ownerEvent: { majorEventId: filters.majorEventId } },
          { links: { some: { majorEventId: filters.majorEventId, deletedAt: null } } },
          { links: { some: { event: { majorEventId: filters.majorEventId }, deletedAt: null } } },
        ],
      });
    }
    if (andFilters.length > 0) {
      where.AND = andFilters;
    }

    const forms = await this.prisma.eventForm.findMany({
      where,
      include: eventFormInclude,
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    });

    return forms.map((form) => toEventFormModel(form));
  }

  async getAdminForm(user: AuthenticatedUser | undefined, formId: string): Promise<EventFormModel> {
    await this.authorizationPolicy.assertPermissions(user, [Permission.EventForm.Read], {
      eventFormId: formId,
    });
    return toEventFormModel(await requireEventForm(this.prisma, formId));
  }

  async listFormsForTarget(
    input: TargetInput,
    options: { subscriptionFlowOnly?: boolean; includeReleasedResults?: boolean } = {},
  ): Promise<EventFormModel[]> {
    const target = normalizeTarget(input);
    const now = new Date();
    const targetWhere =
      target.targetType === EventFormTargetType.EVENT
        ? { eventId: target.eventId }
        : { majorEventId: target.majorEventId };
    const activeLinkWhere = {
      deletedAt: null,
      ...targetWhere,
      ...(options.subscriptionFlowOnly ? { insertInSubscriptionFlow: true } : {}),
      OR: [{ availableFrom: null }, { availableFrom: { lte: now } }],
      AND: [{ OR: [{ availableUntil: null }, { availableUntil: { gt: now } }] }],
    } satisfies Prisma.EventFormLinkWhereInput;
    const targetLinkWhere = {
      deletedAt: null,
      ...targetWhere,
      ...(options.subscriptionFlowOnly ? { insertInSubscriptionFlow: true } : {}),
    } satisfies Prisma.EventFormLinkWhereInput;
    const linkAvailabilityWhere: Prisma.EventFormWhereInput = options.includeReleasedResults
      ? {
          OR: [
            { links: { some: activeLinkWhere } },
            {
              resultsPublic: true,
              OR: [
                {
                  links: {
                    some: {
                      ...targetLinkWhere,
                      availableUntil: { lte: now },
                    },
                  },
                },
                {
                  resultsLive: true,
                  links: {
                    some: {
                      ...targetLinkWhere,
                      OR: [{ availableFrom: null }, { availableFrom: { lte: now } }],
                    },
                  },
                },
              ],
            },
          ],
        }
      : { links: { some: activeLinkWhere } };
    const forms = await this.prisma.eventForm.findMany({
      where: {
        deletedAt: null,
        publicationState: PublicationState.PUBLISHED,
        ...linkAvailabilityWhere,
      },
      include: eventFormInclude,
      orderBy: [{ updatedAt: 'desc' }],
    });

    return forms.map((form) => toEventFormModel(form));
  }

  async listCurrentUserForms(
    context: GraphqlContext,
    input: TargetInput,
    options: { subscriptionFlowOnly?: boolean } = {},
  ): Promise<EventFormModel[]> {
    const authenticatedUser = this.currentUserContext.getAuthenticatedUser(context);
    const { person } = await this.currentUserContext.resolveCurrentUserContext(authenticatedUser);
    if (!person) {
      return [];
    }

    const forms = await this.listFormsForTarget(input, {
      ...options,
      includeReleasedResults: options.subscriptionFlowOnly !== true,
    });
    const eligible: EventFormModel[] = [];
    for (const form of forms) {
      const link = findLinkForTarget(form, input);
      if (link && (await this.canListCurrentUserForm(person.id, form, link, options))) {
        eligible.push(toPublicEventFormModel(form, input));
      }
    }

    return eligible;
  }

  private async canListCurrentUserForm(
    personId: string,
    form: EventFormModel,
    link: EventFormModel['links'][number],
    options: { subscriptionFlowOnly?: boolean },
  ): Promise<boolean> {
    if (
      await canPersonAnswerLink(this.prisma, personId, link, {
        allowFutureSubscriber: Boolean(options.subscriptionFlowOnly),
      })
    ) {
      return true;
    }

    return (
      options.subscriptionFlowOnly !== true &&
      arePublicResultsReleasedForLink(form, link) &&
      (await canPersonViewPublicResults(this.prisma, personId, link))
    );
  }

  async listLecturerForms(
    context: GraphqlContext,
    eventId: string,
  ): Promise<EventFormModel[]> {
    const person = await this.currentUserContext.requireCurrentPerson(context);
    await assertPersonIsEventLecturer(this.prisma, person.id, eventId);
    return this.listFormsForTarget({ targetType: EventFormTargetType.EVENT, eventId });
  }
}
