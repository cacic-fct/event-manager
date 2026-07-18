import { Injectable } from '@nestjs/common';
import {
  EventForm as EventFormModel,
  EventFormPreviousSubscriberCountInput,
  RequiredSubscriptionFormInterruption,
} from '@cacic-fct/shared-data-types';
import { Permission } from '@cacic-fct/shared-permissions';
import { EventFormAudience, EventFormTargetType, Prisma, PublicationState } from '@prisma/client';
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
import { findLinkForTarget, normalizeTarget, responseLookupWhere, responseTargetWhere } from './event-form-targets';

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

  async listCurrentUserRequiredSubscriptionFormInterruptions(
    context: GraphqlContext,
  ): Promise<RequiredSubscriptionFormInterruption[]> {
    const authenticatedUser = this.currentUserContext.getAuthenticatedUser(context);
    const { person } = await this.currentUserContext.resolveCurrentUserContext(authenticatedUser);
    if (!person) {
      return [];
    }

    const now = new Date();
    const links = await this.prisma.eventFormLink.findMany({
      where: {
        deletedAt: null,
        insertInSubscriptionFlow: true,
        requiredInSubscriptionFlow: true,
        audience: {
          not: EventFormAudience.ATTENDEES,
        },
        AND: [
          { OR: [{ availableFrom: null }, { availableFrom: { lte: now } }] },
          { OR: [{ availableUntil: null }, { availableUntil: { gt: now } }] },
        ],
        form: {
          deletedAt: null,
          publicationState: PublicationState.PUBLISHED,
        },
        OR: [
          {
            event: {
              endDate: { gt: now },
              subscriptions: {
                some: {
                  personId: person.id,
                  deletedAt: null,
                },
              },
            },
          },
          {
            majorEvent: {
              endDate: { gt: now },
              subscriptions: {
                some: {
                  personId: person.id,
                  deletedAt: null,
                },
              },
            },
          },
        ],
      },
      select: {
        id: true,
        targetType: true,
        eventId: true,
        majorEventId: true,
        displayOrder: true,
        form: {
          select: {
            id: true,
            responseMode: true,
          },
        },
      },
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
    });

    const interruptions: RequiredSubscriptionFormInterruption[] = [];
    for (const link of links) {
      const target = normalizeTarget(link);
      const response = await this.prisma.eventFormResponse.findFirst({
        where: {
          ...(responseLookupWhere(link.form, person.id, target) ?? responseTargetWhere(link.form.id, person.id, target)),
          deletedAt: null,
        },
        select: { id: true },
      });
      if (response) {
        continue;
      }

      interruptions.push({
        formId: link.form.id,
        linkId: link.id,
        targetType: link.targetType,
        eventId: link.eventId,
        majorEventId: link.majorEventId,
        displayOrder: link.displayOrder,
      });
    }
    return interruptions;
  }

  async countPreviousSubscribers(
    user: AuthenticatedUser | undefined,
    input: EventFormPreviousSubscriberCountInput,
  ): Promise<number> {
    const target = normalizeTarget(input);
    await this.authorizationPolicy.assertPermissions(user, [Permission.EventForm.Update], {
      eventId: target.eventId ?? undefined,
      majorEventId: target.majorEventId ?? undefined,
    });

    if (!input.formId || !input.linkId) {
      return target.eventId
        ? this.prisma.eventSubscription.count({
            where: {
              eventId: target.eventId,
              deletedAt: null,
            },
          })
        : this.prisma.majorEventSubscription.count({
            where: {
              majorEventId: target.majorEventId ?? undefined,
              deletedAt: null,
            },
          });
    }

    const link = await this.prisma.eventFormLink.findFirst({
      where: {
        id: input.linkId,
        formId: input.formId,
        deletedAt: null,
      },
      select: {
        targetType: true,
        eventId: true,
        majorEventId: true,
        form: {
          select: {
            id: true,
            responseMode: true,
          },
        },
      },
    });
    if (!link) {
      return 0;
    }

    const subscribers = link.eventId
      ? await this.prisma.eventSubscription.findMany({
          where: {
            eventId: link.eventId,
            deletedAt: null,
          },
          select: { personId: true },
        })
      : await this.prisma.majorEventSubscription.findMany({
          where: {
            majorEventId: link.majorEventId ?? '',
            deletedAt: null,
          },
          select: { personId: true },
        });
    if (subscribers.length === 0) {
      return 0;
    }

    const responses = await this.prisma.eventFormResponse.findMany({
      where: {
        formId: link.form.id,
        personId: {
          in: subscribers.map((subscription) => subscription.personId),
        },
        deletedAt: null,
        ...(link.form.responseMode === 'MULTIPLE_PER_TARGET'
          ? { linkId: input.linkId }
          : link.form.responseMode === 'ONE_PER_TARGET'
            ? {
                targetType: link.targetType,
                eventId: link.eventId,
                majorEventId: link.majorEventId,
              }
            : {}),
      },
      select: { personId: true },
    });
    return Math.max(0, subscribers.length - new Set(responses.map((response) => response.personId)).size);
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
