import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  MessageEvent,
  NotFoundException,
} from '@nestjs/common';
import { addDays, isFuture } from 'date-fns';
import {
  EventForm as EventFormModel,
  EventFormAudience as ContractAudience,
  EventFormDraft as EventFormDraftModel,
  EventFormInput,
  EventFormLink as EventFormLinkModel,
  EventFormResults,
  EventFormResponseMode as ContractResponseMode,
  EventFormResponse as EventFormResponseModel,
  EventFormResponseSource as ContractResponseSource,
  EventFormSigilo as ContractSigilo,
  EventFormTargetSummary,
  EventFormTargetType as ContractTargetType,
  SubmitEventFormResponseInput,
} from '@cacic-fct/shared-data-types';
import { Permission } from '@cacic-fct/shared-permissions';
import {
  FORM_ELEMENT_TYPES,
  isFormAnswerElementType,
  normalizeFormResponseAnswers,
  type FormAnswerValue,
  type FormChoiceOption,
  type FormElement,
  type FormResponseAnswer,
  type FormSchedulingAnswer,
} from '@cacic-fct/form-contracts';
import {
  EventFormAudience,
  EventFormResponseMode,
  EventFormResponseSource,
  EventFormSigilo,
  EventFormTargetType,
  Prisma,
  PublicationState,
} from '@prisma/client';
import { Observable, Subject } from 'rxjs';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { AuthorizationPolicyService } from '../authorization/authorization-policy.service';
import { CurrentUserContextService } from '../current-user/context.service';
import { GraphqlContext } from '../current-user/selects';
import { PrismaService } from '../prisma/prisma.service';
import { EventFormNotificationService } from './event-form-notification.service';

const eventFormInclude = {
  ownerEvent: {
    select: {
      id: true,
      name: true,
      emoji: true,
    },
  },
  ownerMajorEvent: {
    select: {
      id: true,
      name: true,
      emoji: true,
    },
  },
  links: {
    where: {
      deletedAt: null,
    },
    include: {
      event: {
        select: {
          id: true,
          name: true,
          emoji: true,
          majorEventId: true,
          eventGroupId: true,
          endDate: true,
        },
      },
      majorEvent: {
        select: {
          id: true,
          name: true,
          emoji: true,
          endDate: true,
        },
      },
      _count: {
        select: {
          responses: true,
        },
      },
    },
    orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
  },
  _count: {
    select: {
      responses: true,
    },
  },
} satisfies Prisma.EventFormInclude;

const responseInclude = {
  person: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
} satisfies Prisma.EventFormResponseInclude;

type EventFormRecord = Prisma.EventFormGetPayload<{ include: typeof eventFormInclude }>;
type EventFormResponseRecord = Prisma.EventFormResponseGetPayload<{ include: typeof responseInclude }>;
type EventFormLinkRecord = EventFormRecord['links'][number];

type TargetInput = {
  targetType: EventFormTargetType | ContractTargetType;
  eventId?: string | null;
  majorEventId?: string | null;
};

type ResultViewer = 'admin' | 'lecturer' | 'public' | 'self';

type SubscriptionFlowTargetScope = {
  majorEventId: string;
  selectedEventIds: Set<string>;
};

type FormResultSummary = {
  questions: Array<{
    elementId: string;
    title: string;
    type: string;
    answeredCount: number;
    buckets: Array<{ label: string; value: number }>;
    textAnswers: string[];
  }>;
};

@Injectable()
export class EventFormsService {
  private readonly resultSubjects = new Map<string, Subject<MessageEvent>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly authorizationPolicy: AuthorizationPolicyService,
    private readonly currentUserContext: CurrentUserContextService,
    private readonly formNotifications: EventFormNotificationService,
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
    if (accessibleTargets && this.isEmptyAccessibleTargets(accessibleTargets)) {
      return [];
    }
    if (accessibleTargets) {
      andFilters.push(this.buildAccessibleFormWhere(accessibleTargets));
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

    return forms.map((form) => this.toEventFormModel(form));
  }

  async getAdminForm(formId: string): Promise<EventFormModel> {
    return this.toEventFormModel(await this.requireForm(formId));
  }

  async listFormsForTarget(input: TargetInput, options: { subscriptionFlowOnly?: boolean } = {}): Promise<EventFormModel[]> {
    const target = this.normalizeTarget(input);
    const now = new Date();
    const forms = await this.prisma.eventForm.findMany({
      where: {
        deletedAt: null,
        publicationState: PublicationState.PUBLISHED,
        links: {
          some: {
            deletedAt: null,
            ...(target.targetType === EventFormTargetType.EVENT
              ? { eventId: target.eventId }
              : { majorEventId: target.majorEventId }),
            ...(options.subscriptionFlowOnly ? { insertInSubscriptionFlow: true } : {}),
            OR: [{ availableFrom: null }, { availableFrom: { lte: now } }],
            AND: [{ OR: [{ availableUntil: null }, { availableUntil: { gt: now } }] }],
          },
        },
      },
      include: eventFormInclude,
      orderBy: [{ updatedAt: 'desc' }],
    });

    return forms.map((form) => this.toEventFormModel(form));
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

    const forms = await this.listFormsForTarget(input, options);
    const eligible: EventFormModel[] = [];
    for (const form of forms) {
      const link = this.findLinkForTarget(form, input);
      if (
        link &&
        (await this.canPersonAnswerLink(person.id, link, {
          allowFutureSubscriber: Boolean(options.subscriptionFlowOnly),
        }))
      ) {
        eligible.push(this.toPublicEventFormModel(form));
      }
    }

    return eligible;
  }

  async saveForm(input: EventFormInput, user: AuthenticatedUser | undefined): Promise<EventFormModel> {
    const elements = this.parseElementsJson(input.elementsJson ?? '[]');
    const target = this.normalizeOwner(input);
    const actorId = user?.sub;

    if (input.id) {
      const existing = await this.requireForm(input.id);
      await this.authorizationPolicy.assertPermissions(user, [Permission.EventForm.Update], {
        eventFormId: existing.id,
      });
      await this.assertCanManageLinkedTargets(user, [this.ownerTargetInput(target)], Permission.EventForm.Update);
      await this.assertCanManageLinkedTargets(user, this.manageableLinksForReplace(existing.links, input.links ?? []), Permission.EventForm.Update);

      const updated = await this.prisma.$transaction(async (tx) => {
        await tx.eventForm.update({
          where: { id: existing.id },
          data: {
            name: this.normalizeName(input.name, existing.name),
            description: this.normalizeOptionalText(input.description),
            ownerEventId: target.ownerEventId,
            ownerMajorEventId: target.ownerMajorEventId,
            elements: elements as unknown as Prisma.InputJsonValue,
            sigilo: this.toDbSigilo(input.sigilo ?? existing.sigilo),
            responseMode: this.toDbResponseMode(input.responseMode ?? existing.responseMode),
            resultsPublic: input.resultsPublic ?? existing.resultsPublic,
            resultsLive: input.resultsPublic === false ? false : (input.resultsLive ?? existing.resultsLive),
            updatedById: actorId,
          },
        });
        await this.replaceLinks(tx, existing.id, input.links ?? [], actorId);

        return tx.eventForm.findUniqueOrThrow({
          where: { id: existing.id },
          include: eventFormInclude,
        });
      });

      return this.toEventFormModel(updated);
    }

    await this.authorizationPolicy.assertPermissions(user, [Permission.EventForm.Create], {
      eventId: target.ownerEventId ?? undefined,
      majorEventId: target.ownerMajorEventId ?? undefined,
      allowScopedCollection: true,
    });
    await this.assertCanManageLinkedTargets(user, input.links ?? [], Permission.EventForm.Create);

    const created = await this.prisma.$transaction(async (tx) => {
      const form = await tx.eventForm.create({
        data: {
          name: this.normalizeName(input.name, 'Formulário sem título'),
          description: this.normalizeOptionalText(input.description),
          ownerEventId: target.ownerEventId,
          ownerMajorEventId: target.ownerMajorEventId,
          elements: elements as unknown as Prisma.InputJsonValue,
          sigilo: this.toDbSigilo(input.sigilo ?? ContractSigilo.SECRET),
          responseMode: this.toDbResponseMode(input.responseMode ?? ContractResponseMode.ONE_PER_TARGET),
          resultsPublic: input.resultsPublic ?? false,
          resultsLive: input.resultsPublic === true ? (input.resultsLive ?? false) : false,
          createdById: actorId,
          updatedById: actorId,
        },
      });

      await this.replaceLinks(tx, form.id, input.links ?? [], actorId);

      return tx.eventForm.findUniqueOrThrow({
        where: { id: form.id },
        include: eventFormInclude,
      });
    });

    return this.toEventFormModel(created);
  }

  async saveDraft(
    input: { sourceFormId: string; draftId?: string | null; input: EventFormInput },
    user: AuthenticatedUser | undefined,
  ): Promise<EventFormDraftModel> {
    const form = await this.requireForm(input.sourceFormId);
    await this.authorizationPolicy.assertPermissions(user, [Permission.EventForm.Update], {
      eventFormId: form.id,
    });

    const payload = JSON.parse(
      JSON.stringify({
        ...input.input,
        elementsJson: JSON.stringify(this.parseElementsJson(input.input.elementsJson ?? JSON.stringify(form.elements))),
      }),
    ) as Prisma.InputJsonObject;
    const actor = this.actorInfo(user);
    const expiresAt = addDays(new Date(), 30);

    const draft = input.draftId
      ? await this.updateDraftForSourceForm(input.draftId, form.id, {
          name: this.normalizeName(input.input.name, form.name),
          payload,
          updatedById: actor.id,
          updatedByName: actor.name,
          updatedByEmail: actor.email,
          expiresAt,
        })
      : await this.prisma.eventFormDraft.create({
          data: {
            sourceFormId: form.id,
            name: this.normalizeName(input.input.name, form.name),
            payload,
            createdById: actor.id,
            createdByName: actor.name,
            createdByEmail: actor.email,
            updatedById: actor.id,
            updatedByName: actor.name,
            updatedByEmail: actor.email,
            expiresAt,
          },
        });

    return this.toDraftModel(draft);
  }

  async listDrafts(sourceFormId: string): Promise<EventFormDraftModel[]> {
    const drafts = await this.prisma.eventFormDraft.findMany({
      where: {
        sourceFormId,
        expiresAt: {
          gt: new Date(),
        },
      },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    });

    return drafts.map((draft) => this.toDraftModel(draft));
  }

  async publishForm(
    formId: string,
    scheduledPublishAt: Date | null | undefined,
    user: AuthenticatedUser | undefined,
  ): Promise<EventFormModel> {
    const form = await this.requireForm(formId);
    await this.authorizationPolicy.assertPermissions(user, [Permission.EventForm.Publish], {
      eventFormId: form.id,
    });
    await this.assertCanManageLinkedTargets(user, this.formTargetInputs(form), Permission.EventForm.Publish);

    if (scheduledPublishAt && isFuture(scheduledPublishAt)) {
      const scheduled = await this.prisma.eventForm.update({
        where: { id: form.id },
        data: {
          publicationState: PublicationState.SCHEDULED,
          scheduledPublishAt,
          publicationScheduledBy: user?.sub,
          publicationUpdatedBy: user?.sub,
          unpublishedAt: null,
        },
        include: eventFormInclude,
      });
      return this.toEventFormModel(scheduled);
    }

    return this.publishFormNow(form.id, user?.sub);
  }

  async publishLecturerForm(
    context: GraphqlContext,
    formId: string,
    eventId: string,
  ): Promise<EventFormModel> {
    const person = await this.currentUserContext.requireCurrentPerson(context);
    await this.assertPersonIsEventLecturer(person.id, eventId);
    const form = await this.requireForm(formId);
    const link = this.findEventLinkRecord(form, eventId);
    if (!link) {
      throw new NotFoundException('Formulário não vinculado a este evento.');
    }
    if (!link.allowLecturerManualPublish) {
      throw new ForbiddenException('Publicação por ministrantes não habilitada para este vínculo.');
    }
    if (form.links.some((item) => item.id !== link.id)) {
      throw new ForbiddenException('Publicação por ministrantes só está disponível para formulários exclusivos deste evento.');
    }

    const authenticatedUser = this.currentUserContext.getAuthenticatedUser(context);
    return this.publishFormNow(form.id, authenticatedUser?.sub ?? person.id);
  }

  async unpublishForm(formId: string, user: AuthenticatedUser | undefined): Promise<EventFormModel> {
    const form = await this.requireForm(formId);
    await this.authorizationPolicy.assertPermissions(user, [Permission.EventForm.Publish], {
      eventFormId: form.id,
    });
    await this.assertCanManageLinkedTargets(user, this.formTargetInputs(form), Permission.EventForm.Publish);

    const updated = await this.prisma.eventForm.update({
      where: { id: form.id },
      data: {
        publicationState: PublicationState.UNPUBLISHED,
        scheduledPublishAt: null,
        unpublishedAt: new Date(),
        publicationUpdatedBy: user?.sub,
      },
      include: eventFormInclude,
    });

    return this.toEventFormModel(updated);
  }

  async deleteForm(formId: string, user: AuthenticatedUser | undefined): Promise<EventFormModel> {
    const form = await this.requireForm(formId);
    await this.authorizationPolicy.assertPermissions(user, [Permission.EventForm.Delete], {
      eventFormId: form.id,
    });
    await this.assertCanManageLinkedTargets(user, this.formTargetInputs(form), Permission.EventForm.Delete);

    const updated = await this.prisma.eventForm.update({
      where: { id: form.id },
      data: {
        deletedAt: new Date(),
        updatedById: user?.sub,
        links: {
          updateMany: {
            where: { deletedAt: null },
            data: { deletedAt: new Date(), updatedById: user?.sub },
          },
        },
      },
      include: eventFormInclude,
    });

    return this.toEventFormModel(updated);
  }

  async submitCurrentUserResponse(
    context: GraphqlContext,
    input: SubmitEventFormResponseInput,
  ): Promise<EventFormResponseModel> {
    const person = await this.currentUserContext.requireCurrentPerson(context);
    const result = await this.runSerializableFormTransaction((tx) =>
      this.submitResponseForPerson(tx, person.id, input, {
        requireSubscriptionFlowLink: false,
      }),
    );

    await this.emitResultsDelta(result.formId);

    return this.toResponseModel(result.response, result.sigilo, 'self');
  }

  async submitSubscriptionFlowResponses(
    tx: Prisma.TransactionClient,
    personId: string,
    inputs: readonly SubmitEventFormResponseInput[] | null | undefined,
    scope: SubscriptionFlowTargetScope,
  ): Promise<string[]> {
    const submittedFormIds: string[] = [];
    for (const input of inputs ?? []) {
      this.assertSubscriptionFlowTargetAllowed(input, scope);
      const result = await this.submitResponseForPerson(tx, personId, input, {
        requireSubscriptionFlowLink: true,
      });
      submittedFormIds.push(result.formId);
    }

    await this.assertRequiredSubscriptionFlowResponses(tx, personId, scope);
    return submittedFormIds;
  }

  async emitResultsDeltas(formIds: readonly string[]): Promise<void> {
    for (const formId of [...new Set(formIds)]) {
      await this.emitResultsDelta(formId);
    }
  }

  private async submitResponseForPerson(
    tx: Prisma.TransactionClient,
    personId: string,
    input: SubmitEventFormResponseInput,
    options: { requireSubscriptionFlowLink: boolean },
  ): Promise<{ formId: string; response: EventFormResponseRecord; sigilo: EventFormSigilo }> {
    const target = this.normalizeTarget(input);
    const form = await this.requirePublishedFormWithClient(tx, input.formId);
    const link = await this.requireActiveLinkForTargetWithClient(tx, form.id, target, input.linkId ?? undefined);
    if (options.requireSubscriptionFlowLink && !link.insertInSubscriptionFlow) {
      throw new NotFoundException('Formulário não disponível no fluxo de inscrição.');
    }
    await this.assertPersonCanAnswerLink(personId, link, {
      allowFutureSubscriber: options.requireSubscriptionFlowLink && link.insertInSubscriptionFlow,
    });
    const answers = this.normalizeAnswers(input.answersJson, form.elements as unknown as FormElement[], link.enforceRequiredAnswers);
    const responseSource = link.insertInSubscriptionFlow ? ContractResponseSource.SUBSCRIPTION_FLOW : ContractResponseSource.PUBLIC_FORM;

    const existingWhere = this.responseLookupWhere(form, personId, target, link.id);
    if (existingWhere) {
      await this.lockSingleResponseSlot(tx, form, personId, target);
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
            source: this.toDbResponseSource(responseSource),
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
            source: this.toDbResponseSource(responseSource),
          },
          include: responseInclude,
        });

    return {
      formId: form.id,
      response,
      sigilo: form.sigilo,
    };
  }

  private async assertRequiredSubscriptionFlowResponses(
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
        this.responseLookupWhere(link.form, personId, target, link.id) ??
        this.responseTargetWhere(link.formId, personId, target);
      const response = await tx.eventFormResponse.findFirst({
        where: responseWhere,
        select: {
          id: true,
        },
      });

      if (!response) {
        throw new BadRequestException(`Responda o formulário obrigatório "${link.form.name}" para concluir a inscrição.`);
      }
    }
  }

  async getCurrentUserResponse(
    context: GraphqlContext,
    input: TargetInput & { formId: string; linkId?: string | null },
  ): Promise<EventFormResponseModel | null> {
    const person = await this.currentUserContext.requireCurrentPerson(context);
    const target = this.normalizeTarget(input);
    const form = await this.requireForm(input.formId);
    const response = await this.prisma.eventFormResponse.findFirst({
      where: this.responseLookupWhere(form, person.id, target, input.linkId ?? undefined) ?? this.responseTargetWhere(form.id, person.id, target),
      include: responseInclude,
      orderBy: {
        submittedAt: 'desc',
      },
    });

    if (!response) {
      return null;
    }

    return this.toResponseModel(response, form.sigilo, 'self');
  }

  async getCurrentUserResults(
    context: GraphqlContext,
    input: TargetInput & { formId: string },
  ): Promise<EventFormResults> {
    const target = this.normalizeTarget(input);
    const authenticatedUser = this.currentUserContext.getAuthenticatedUser(context);
    const form = await this.requirePublishedForm(input.formId);

    if (await this.canAdminViewResults(authenticatedUser, form.id)) {
      try {
        await this.authorizationPolicy.assertPermissions(authenticatedUser, [Permission.EventForm.Results], {
          eventId: target.eventId ?? undefined,
          majorEventId: target.majorEventId ?? undefined,
        });
        return this.getResults(form.id, 'admin', { target });
      } catch (error) {
        if (!(error instanceof ForbiddenException)) {
          throw error;
        }
      }
    }

    if (!form.resultsPublic) {
      throw new NotFoundException('Resultados do formulário não disponíveis.');
    }

    const link = this.findLinkRecordForTarget(form, target);
    if (!link) {
      throw new NotFoundException('Formulário não vinculado a este evento ou grande evento.');
    }

    const person = await this.currentUserContext.requireCurrentPerson(context);
    await this.assertPersonCanViewPublicResults(person.id, link);

    return this.getResults(form.id, 'public', { target });
  }

  async getAdminResults(user: AuthenticatedUser | undefined, formId: string): Promise<EventFormResults> {
    const accessibleTargets = await this.authorizationPolicy.accessibleEventTargets(user, Permission.EventForm.Results);
    if (accessibleTargets && this.isEmptyAccessibleTargets(accessibleTargets)) {
      throw new NotFoundException('Resultados do formulário não disponíveis.');
    }
    return this.getResults(formId, 'admin', {
      accessibleTargets: accessibleTargets ?? undefined,
    });
  }

  async getAdminExportResults(user: AuthenticatedUser | undefined, formId: string): Promise<EventFormResults> {
    const accessibleTargets = await this.authorizationPolicy.accessibleEventTargets(user, Permission.EventForm.Export);
    if (accessibleTargets && this.isEmptyAccessibleTargets(accessibleTargets)) {
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
      target?: ReturnType<EventFormsService['normalizeTarget']>;
      accessibleTargets?: {
        eventIds: Set<string>;
        majorEventIds: Set<string>;
        eventGroupIds: Set<string>;
      };
    } = {},
  ): Promise<EventFormResults> {
    const form = await this.requireForm(formId);
    const responseWhere = this.resultResponseWhere(form, options);
    const responses = await this.prisma.eventFormResponse.findMany({
      where: responseWhere,
      include: responseInclude,
      orderBy: {
        submittedAt: 'desc',
      },
    });
    const elements = form.elements as unknown as FormElement[];
    const answersReleased = this.canShowIndividualAnswers(form.sigilo, viewer);
    const identitiesReleased = this.canShowIdentity(form.sigilo, viewer);
    const summary = this.buildSummary(elements, responses, answersReleased);

    return {
      form: this.toEventFormModel(form),
      responseCount: responses.length,
      anonymous: form.sigilo === EventFormSigilo.ANONYMOUS,
      answersReleased,
      summaryJson: JSON.stringify(summary),
      responses: answersReleased || identitiesReleased
        ? responses.map((response) => this.toResponseModel(response, form.sigilo, viewer, { includeAnswers: answersReleased }))
        : [],
    };
  }

  async getLecturerResults(
    context: GraphqlContext,
    formId: string,
    eventId: string,
  ): Promise<EventFormResults> {
    const person = await this.currentUserContext.requireCurrentPerson(context);
    await this.assertPersonIsEventLecturer(person.id, eventId);
    const form = await this.requireForm(formId);
    const link = this.findEventLinkRecord(form, eventId);
    if (!link) {
      throw new NotFoundException('Formulário não vinculado a este evento.');
    }
    if (!form.resultsPublic) {
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

  async listLecturerForms(
    context: GraphqlContext,
    eventId: string,
  ): Promise<EventFormModel[]> {
    const person = await this.currentUserContext.requireCurrentPerson(context);
    await this.assertPersonIsEventLecturer(person.id, eventId);
    return this.listFormsForTarget({ targetType: EventFormTargetType.EVENT, eventId });
  }

  watchResults(formId: string): Observable<MessageEvent> {
    let subject = this.resultSubjects.get(formId);
    if (!subject) {
      subject = new Subject<MessageEvent>();
      this.resultSubjects.set(formId, subject);
    }
    return subject.asObservable();
  }

  async exportResultsCsv(formId: string, viewer: ResultViewer = 'admin'): Promise<string> {
    const results = await this.getResults(formId, viewer);
    return this.resultsToCsv(results);
  }

  async exportAdminResultsCsv(user: AuthenticatedUser | undefined, formId: string): Promise<string> {
    const results = await this.getAdminExportResults(user, formId);
    return this.resultsToCsv(results);
  }

  async publishDueScheduledForms(): Promise<number> {
    const dueForms = await this.prisma.eventForm.findMany({
      where: {
        deletedAt: null,
        publicationState: PublicationState.SCHEDULED,
        scheduledPublishAt: {
          lte: new Date(),
        },
      },
      select: {
        id: true,
      },
      take: 100,
      orderBy: {
        scheduledPublishAt: 'asc',
      },
    });

    for (const form of dueForms) {
      await this.publishFormNow(form.id, undefined);
    }

    return dueForms.length;
  }

  async notifyDueAvailableLinks(): Promise<number> {
    const now = new Date();
    const forms = await this.prisma.eventForm.findMany({
      where: {
        deletedAt: null,
        publicationState: PublicationState.PUBLISHED,
        links: {
          some: {
            deletedAt: null,
            notifyOnPublish: true,
            lastNotifiedAt: null,
            AND: [
              { OR: [{ availableFrom: null }, { availableFrom: { lte: now } }] },
              { OR: [{ availableUntil: null }, { availableUntil: { gt: now } }] },
            ],
            OR: [
              { event: { endDate: { gte: now } } },
              { majorEvent: { endDate: { gte: now } } },
            ],
          },
        },
      },
      include: eventFormInclude,
      take: 100,
      orderBy: [{ publishedAt: 'asc' }, { updatedAt: 'asc' }],
    });

    let notifiedLinks = 0;
    for (const form of forms) {
      notifiedLinks += await this.notifyEligiblePeople(form);
    }

    return notifiedLinks;
  }

  private async publishFormNow(formId: string, actorId: string | undefined): Promise<EventFormModel> {
    const published = await this.prisma.eventForm.update({
      where: { id: formId },
      data: {
        publicationState: PublicationState.PUBLISHED,
        scheduledPublishAt: null,
        publishedAt: new Date(),
        unpublishedAt: null,
        publicationUpdatedBy: actorId,
      },
      include: eventFormInclude,
    });

    await this.notifyEligiblePeople(published);
    return this.toEventFormModel(published);
  }

  private resultsToCsv(results: EventFormResults): string {
    const elements = this.parseElementsJson(results.form.elementsJson).filter((element) => isFormAnswerElementType(element.type));
    const rows = [
      [
        'Resposta',
        'Pessoa',
        'E-mail',
        'Enviado em',
        ...elements.map((element) => element.title),
      ],
    ];

    for (const response of results.responses) {
      const answers = this.parseAnswersJson(response.answersJson);
      const answersByElementId = new Map(answers.map((answer) => [answer.elementId, answer.value]));
      rows.push([
        response.id,
        response.respondentName ?? '',
        response.respondentEmail ?? '',
        response.submittedAt ? response.submittedAt.toISOString() : '',
        ...elements.map((element) => this.answerToCsvCell(element, answersByElementId.get(element.id) ?? null)),
      ]);
    }

    return rows.map((row) => row.map((cell) => this.csvCell(cell)).join(',')).join('\n');
  }

  private async notifyEligiblePeople(form: EventFormRecord): Promise<number> {
    return this.formNotifications.notifyEligiblePeople(form);
  }

  private async requireForm(formId: string): Promise<EventFormRecord> {
    const form = await this.prisma.eventForm.findFirst({
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

  private async updateDraftForSourceForm(
    draftId: string,
    sourceFormId: string,
    data: Prisma.EventFormDraftUpdateManyMutationInput,
  ) {
    const updated = await this.prisma.eventFormDraft.updateMany({
      where: {
        id: draftId,
        sourceFormId,
      },
      data,
    });
    if (updated.count === 0) {
      throw new NotFoundException('Rascunho não encontrado para este formulário.');
    }

    return this.prisma.eventFormDraft.findUniqueOrThrow({
      where: { id: draftId },
    });
  }

  private async requirePublishedForm(formId: string): Promise<EventFormRecord> {
    const form = await this.requireForm(formId);
    if (form.publicationState !== PublicationState.PUBLISHED) {
      throw new NotFoundException(`Event form ${formId} is not published.`);
    }
    return form;
  }

  private async requirePublishedFormWithClient(
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

  private async requireActiveLinkForTarget(
    formId: string,
    target: ReturnType<EventFormsService['normalizeTarget']>,
    linkId?: string,
  ): Promise<EventFormLinkRecord> {
    const form = await this.requireForm(formId);
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
    if (!this.isLinkAvailable(link)) {
      throw new NotFoundException('Formulário não disponível para este período.');
    }
    return link;
  }

  private async requireActiveLinkForTargetWithClient(
    tx: Prisma.TransactionClient,
    formId: string,
    target: ReturnType<EventFormsService['normalizeTarget']>,
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
    if (!this.isLinkAvailable(link)) {
      throw new NotFoundException('Formulário não disponível para este período.');
    }
    return link;
  }

  private async replaceLinks(
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
      const target = this.normalizeTarget(link);
      const data = {
        targetType: target.targetType,
        eventId: target.eventId,
        majorEventId: target.majorEventId,
        audience: this.toDbAudience(link.audience ?? ContractAudience.SUBSCRIBERS_OR_ATTENDEES),
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

  private async assertCanManageLinkedTargets(
    user: AuthenticatedUser | undefined,
    links: readonly TargetInput[],
    permission: Permission,
  ): Promise<void> {
    for (const link of links) {
      const target = this.normalizeTarget(link);
      await this.authorizationPolicy.assertPermissions(user, [permission], {
        eventId: target.eventId ?? undefined,
        majorEventId: target.majorEventId ?? undefined,
      });
    }
  }

  private ownerTargetInput(target: { ownerEventId: string | null; ownerMajorEventId: string | null }): TargetInput {
    return target.ownerEventId
      ? { targetType: EventFormTargetType.EVENT, eventId: target.ownerEventId }
      : { targetType: EventFormTargetType.MAJOR_EVENT, majorEventId: target.ownerMajorEventId };
  }

  private formTargetInputs(form: EventFormRecord): TargetInput[] {
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

  private manageableLinksForReplace(
    existingLinks: readonly EventFormLinkRecord[],
    nextLinks: readonly NonNullable<EventFormInput['links']>[number][],
  ): TargetInput[] {
    const affectedLinks: TargetInput[] = [...nextLinks];
    const nextLinksById = new Map(nextLinks.flatMap((link) => (link.id ? [[link.id, link] as const] : [])));

    for (const existingLink of existingLinks) {
      const nextLink = nextLinksById.get(existingLink.id);
      if (!nextLink || !this.isSameTarget(existingLink, nextLink)) {
        affectedLinks.push(existingLink);
      }
    }

    return affectedLinks;
  }

  private isSameTarget(left: TargetInput, right: TargetInput): boolean {
    const leftTarget = this.normalizeTarget(left);
    const rightTarget = this.normalizeTarget(right);
    return (
      leftTarget.targetType === rightTarget.targetType &&
      leftTarget.eventId === rightTarget.eventId &&
      leftTarget.majorEventId === rightTarget.majorEventId
    );
  }

  private isLinkAvailable(link: Pick<EventFormLinkRecord, 'availableFrom' | 'availableUntil'>): boolean {
    const now = Date.now();
    return (!link.availableFrom || link.availableFrom.getTime() <= now) && (!link.availableUntil || link.availableUntil.getTime() > now);
  }

  private parseElementsJson(value: string): FormElement[] {
    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch {
      throw new BadRequestException('JSON dos itens do formulário inválido.');
    }

    if (!Array.isArray(parsed)) {
      throw new BadRequestException('Itens do formulário devem ser uma lista.');
    }

    return parsed.map((item, index) => this.normalizeElement(item, index));
  }

  private normalizeElement(value: unknown, index: number): FormElement {
    if (!this.isRecord(value)) {
      throw new BadRequestException(`Item ${index + 1} do formulário é inválido.`);
    }

    const type = value['type'];
    if (typeof type !== 'string' || !(FORM_ELEMENT_TYPES as readonly string[]).includes(type)) {
      throw new BadRequestException(`Tipo do item ${index + 1} do formulário é inválido.`);
    }

    const id = this.stringValue(value['id']) || `element-${index + 1}`;
    const title = this.stringValue(value['title']) || this.defaultTitle(type);
    const options = Array.isArray(value['options']) ? value['options'].map((option, optionIndex) => this.normalizeOption(option, optionIndex)) : [];

    return {
      id,
      type,
      title,
      description: this.stringValue(value['description']) || undefined,
      descriptionImages: [],
      required: Boolean(value['required']),
      options,
      settings: this.isRecord(value['settings']) ? value['settings'] : undefined,
    } as FormElement;
  }

  private normalizeOption(value: unknown, index: number): FormChoiceOption {
    if (!this.isRecord(value)) {
      return {
        id: `option-${index + 1}`,
        label: `Opção ${index + 1}`,
      };
    }
    return {
      id: this.stringValue(value['id']) || `option-${index + 1}`,
      label: this.stringValue(value['label']) || `Opção ${index + 1}`,
      description: this.stringValue(value['description']) || undefined,
    };
  }

  private normalizeAnswers(
    answersJson: string,
    elements: readonly FormElement[],
    enforceRequiredAnswers: boolean,
  ): FormResponseAnswer[] {
    const answers = this.parseAnswersJson(answersJson);
    const normalized = normalizeFormResponseAnswers(answers);
    const answerElements = elements.filter((element) => isFormAnswerElementType(element.type));
    const elementsById = new Map(answerElements.map((element) => [element.id, element]));
    const answersById = new Map(normalized.map((answer) => [answer.elementId, answer.value]));

    for (const answer of normalized) {
      const element = elementsById.get(answer.elementId);
      if (!element) {
        throw new BadRequestException(`Resposta enviada para item desconhecido: ${answer.elementId}.`);
      }
      answersById.set(answer.elementId, this.normalizeAnswerValue(element, answer.value));
    }

    if (enforceRequiredAnswers) {
      for (const element of answerElements) {
        if (element.required && this.isMissingRequiredAnswer(element, answersById.get(element.id) ?? null)) {
          throw new BadRequestException(`A pergunta "${element.title}" é obrigatória.`);
        }
      }
    }

    return [...answersById.entries()].map(([elementId, value]) => ({ elementId, value }));
  }

  private parseAnswersJson(value: string): FormResponseAnswer[] {
    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch {
      throw new BadRequestException('JSON das respostas inválido.');
    }
    if (!Array.isArray(parsed)) {
      throw new BadRequestException('Respostas devem ser uma lista.');
    }
    return parsed
      .filter((item): item is Record<string, unknown> => this.isRecord(item))
      .map((item) => ({
        elementId: this.stringValue(item['elementId']),
        value: item['value'] as FormAnswerValue,
      }))
      .filter((answer) => answer.elementId);
  }

  private normalizeAnswerValue(element: FormElement, value: FormAnswerValue): FormAnswerValue {
    switch (element.type) {
      case 'shortText':
      case 'longText':
        return typeof value === 'string' && value.trim() ? value.trim() : null;
      case 'date':
        return this.normalizeDateAnswer(element, value);
      case 'time':
        return this.normalizeTimeAnswer(element, value);
      case 'singleChoice':
      case 'selectionDropdown':
        return this.normalizeChoiceAnswer(element, value);
      case 'multipleChoice':
        return this.normalizeMultipleChoiceAnswer(element, value);
      case 'linearScale':
        return this.normalizeLinearScaleAnswer(element, value);
      case 'starRating':
        return this.normalizeStarRatingAnswer(element, value);
      case 'singleSelectionGrid':
        return this.normalizeGridAnswer(element, value, false);
      case 'multipleSelectionGrid':
        return this.normalizeGridAnswer(element, value, true);
      case 'scheduling':
        return this.normalizeSchedulingAnswer(element, value);
      default:
        return null;
    }
  }

  private normalizeChoiceAnswer(element: FormElement, value: FormAnswerValue): FormAnswerValue {
    if (typeof value !== 'string') {
      return null;
    }
    const normalized = value.trim();
    if (!normalized) {
      return null;
    }
    if (!this.optionIds(element).has(normalized)) {
      throw new BadRequestException(`Opção inválida para a pergunta "${element.title}".`);
    }
    return normalized;
  }

  private normalizeMultipleChoiceAnswer(element: FormElement, value: FormAnswerValue): FormAnswerValue {
    if (!Array.isArray(value)) {
      return null;
    }
    const optionIds = this.optionIds(element);
    const normalized = [...new Set(value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean))];
    const invalid = normalized.find((item) => !optionIds.has(item));
    if (invalid) {
      throw new BadRequestException(`Opção inválida para a pergunta "${element.title}".`);
    }
    return normalized.length > 0 ? normalized : null;
  }

  private normalizeDateAnswer(element: FormElement, value: FormAnswerValue): FormAnswerValue {
    if (typeof value !== 'string') {
      return null;
    }
    const normalized = value.trim();
    if (!normalized) {
      return null;
    }
    if (!this.isValidIsoDate(normalized)) {
      throw new BadRequestException(`Data inválida para a pergunta "${element.title}".`);
    }
    return normalized;
  }

  private isValidIsoDate(value: string): boolean {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) {
      return false;
    }

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(0, month - 1, day));
    date.setUTCFullYear(year);

    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    );
  }

  private normalizeTimeAnswer(element: FormElement, value: FormAnswerValue): FormAnswerValue {
    if (typeof value !== 'string') {
      return null;
    }
    const normalized = value.trim();
    if (!normalized) {
      return null;
    }
    const match = /^(\d{2}):(\d{2})$/.exec(normalized);
    const hour = match ? Number(match[1]) : Number.NaN;
    const minute = match ? Number(match[2]) : Number.NaN;
    if (!match || hour > 23 || minute > 59) {
      throw new BadRequestException(`Hora inválida para a pergunta "${element.title}".`);
    }
    return normalized;
  }

  private normalizeLinearScaleAnswer(element: FormElement, value: FormAnswerValue): FormAnswerValue {
    if (typeof value !== 'number' || !Number.isInteger(value)) {
      return null;
    }
    const min = element.settings?.linearScale?.min ?? 1;
    const max = element.settings?.linearScale?.max ?? 5;
    if (value < min || value > max) {
      throw new BadRequestException(`Valor fora da escala da pergunta "${element.title}".`);
    }
    return value;
  }

  private normalizeStarRatingAnswer(element: FormElement, value: FormAnswerValue): FormAnswerValue {
    if (typeof value !== 'number' || !Number.isInteger(value)) {
      return null;
    }
    const max = element.settings?.starRating?.max ?? 5;
    if (value < 1 || value > max) {
      throw new BadRequestException(`Valor fora da avaliação da pergunta "${element.title}".`);
    }
    return value;
  }

  private normalizeGridAnswer(element: FormElement, value: FormAnswerValue, multiple: boolean): FormAnswerValue {
    if (!this.isRecord(value)) {
      return null;
    }

    const rowIds = new Set((element.settings?.grid?.rows ?? []).map((row) => row.id));
    const columnIds = new Set((element.settings?.grid?.columns ?? []).map((column) => column.id));
    if (multiple) {
      const answer: Record<string, string[]> = {};
      for (const [rowId, rawValue] of Object.entries(value)) {
        if (!rowIds.has(rowId)) {
          throw new BadRequestException(`Linha inválida para a pergunta "${element.title}".`);
        }
        if (Array.isArray(rawValue)) {
          const normalized = [...new Set(rawValue.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean))];
          const invalid = normalized.find((item) => !columnIds.has(item));
          if (invalid) {
            throw new BadRequestException(`Coluna inválida para a pergunta "${element.title}".`);
          }
          if (normalized.length > 0) {
            answer[rowId] = normalized;
          }
        }
      }

      return Object.keys(answer).length > 0 ? answer : null;
    }

    const answer: Record<string, string> = {};
    for (const [rowId, rawValue] of Object.entries(value)) {
      if (!rowIds.has(rowId)) {
        throw new BadRequestException(`Linha inválida para a pergunta "${element.title}".`);
      }
      if (typeof rawValue === 'string') {
        const normalized = rawValue.trim();
        if (!columnIds.has(normalized)) {
          throw new BadRequestException(`Coluna inválida para a pergunta "${element.title}".`);
        }
        answer[rowId] = normalized;
      }
    }

    return Object.keys(answer).length > 0 ? answer : null;
  }

  private normalizeSchedulingAnswer(element: FormElement, value: FormAnswerValue): FormSchedulingAnswer | null {
    if (!this.isRecord(value) || typeof value['slotId'] !== 'string') {
      return null;
    }

    const record = value as Record<string, unknown>;
    const slotId = value['slotId'].trim();
    if (!slotId) {
      return null;
    }
    if (!this.schedulingSlotIds(element).has(slotId)) {
      throw new BadRequestException(`Horário inválido para a pergunta "${element.title}".`);
    }
    const inviteesValue = record['invitees'];
    const invitees = Array.isArray(inviteesValue)
      ? inviteesValue
          .filter((invitee): invitee is Record<string, unknown> => this.isRecord(invitee))
          .map((invitee) => ({
            name: this.stringValue(invitee['name']),
            email: this.stringValue(invitee['email']) || undefined,
          }))
          .filter((invitee) => invitee.name)
      : [];
    const maxInvitees = element.settings?.scheduling?.maxInvitees ?? 0;
    if (invitees.length > maxInvitees) {
      throw new BadRequestException(`Número de convidados acima do limite da pergunta "${element.title}".`);
    }

    return {
      slotId,
      invitees,
    };
  }

  private isMissingRequiredAnswer(element: FormElement, value: FormAnswerValue): boolean {
    if (this.isEmptyAnswer(value)) {
      return true;
    }
    if (element.type === 'singleSelectionGrid' || element.type === 'multipleSelectionGrid') {
      if (!this.isRecord(value)) {
        return true;
      }
      const rows = element.settings?.grid?.rows ?? [];
      const answer = value as Record<string, FormAnswerValue>;
      return rows.length > 0 && rows.some((row) => this.isEmptyAnswer(answer[row.id] ?? null));
    }
    if (element.type === 'scheduling') {
      if (!this.isSchedulingAnswer(value)) {
        return true;
      }
      if (!value.slotId) {
        return true;
      }
      return element.settings?.scheduling?.inviteeMode === 'required' && value.invitees.length === 0;
    }
    return false;
  }

  private isSchedulingAnswer(value: FormAnswerValue): value is FormSchedulingAnswer {
    return this.isRecord(value) && typeof value['slotId'] === 'string' && Array.isArray(value['invitees']);
  }

  private isEmptyAnswer(value: FormAnswerValue): boolean {
    if (value === null || value === undefined) {
      return true;
    }
    if (typeof value === 'string') {
      return value.trim().length === 0;
    }
    if (Array.isArray(value)) {
      return value.length === 0;
    }
    if (typeof value === 'object') {
      return Object.keys(value).length === 0;
    }
    return false;
  }

  private optionIds(element: FormElement): Set<string> {
    return new Set(element.options.map((option) => option.id));
  }

  private schedulingSlotIds(element: FormElement): Set<string> {
    const settings = element.settings?.scheduling;
    if (!settings) {
      return new Set();
    }

    const slotIds = new Set<string>();
    const stepMinutes = Math.max(settings.slotIntervalMinutes, 1);
    const durationMinutes = Math.max(settings.durationMinutes, 1);
    for (const window of settings.availability) {
      const start = this.parseLocalTimeMinutes(window.startTime);
      const end = this.parseLocalTimeMinutes(window.endTime);
      if (start === null || end === null || end <= start) {
        continue;
      }
      for (let cursor = start; cursor + durationMinutes <= end; cursor += stepMinutes) {
        slotIds.add(
          `${window.id}:${this.formatLocalTimeMinutes(cursor)}-${this.formatLocalTimeMinutes(cursor + durationMinutes)}`,
        );
      }
    }
    return slotIds;
  }

  private parseLocalTimeMinutes(time: string): number | null {
    const match = /^(\d{2}):(\d{2})$/.exec(time);
    if (!match) {
      return null;
    }
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
      return null;
    }
    return hours * 60 + minutes;
  }

  private formatLocalTimeMinutes(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${String(hours).padStart(2, '0')}:${String(remainingMinutes).padStart(2, '0')}`;
  }

  private buildSummary(
    elements: readonly FormElement[],
    responses: readonly EventFormResponseRecord[],
    includeTextAnswers: boolean,
  ): FormResultSummary {
    const answerElements = elements.filter((element) => isFormAnswerElementType(element.type));

    return {
      questions: answerElements.map((element) => {
        const values = responses
          .map((response) => this.valueForElement(response.answers as unknown as FormResponseAnswer[], element.id))
          .filter((value) => !this.isEmptyAnswer(value));

        return {
          elementId: element.id,
          title: element.title,
          type: element.type,
          answeredCount: values.length,
          buckets: this.buildBuckets(element, values),
          textAnswers: includeTextAnswers ? this.buildTextAnswers(element, values) : [],
        };
      }),
    };
  }

  private resultResponseWhere(
    form: EventFormRecord,
    options: {
      target?: ReturnType<EventFormsService['normalizeTarget']>;
      accessibleTargets?: {
        eventIds: Set<string>;
        majorEventIds: Set<string>;
        eventGroupIds: Set<string>;
      };
    },
  ): Prisma.EventFormResponseWhereInput {
    const where: Prisma.EventFormResponseWhereInput = { formId: form.id };
    if (form.responseMode === EventFormResponseMode.SINGLE_PER_FORM) {
      if (options.target) {
        return {
          ...where,
          targetType: options.target.targetType,
          eventId: options.target.eventId,
          majorEventId: options.target.majorEventId,
        };
      }
      if (options.accessibleTargets && !this.formIntersectsAccessibleTargets(form, options.accessibleTargets)) {
        return { ...where, id: { in: [] } };
      }
      return options.accessibleTargets ? this.withAccessibleResponseTargets(where, options.accessibleTargets) : where;
    }

    if (options.target) {
      return {
        ...where,
        targetType: options.target.targetType,
        eventId: options.target.eventId,
        majorEventId: options.target.majorEventId,
      };
    }

    const targets = options.accessibleTargets;
    if (!targets) {
      return where;
    }

    return this.withAccessibleResponseTargets(where, targets);
  }

  private withAccessibleResponseTargets(
    where: Prisma.EventFormResponseWhereInput,
    targets: {
      eventIds: Set<string>;
      majorEventIds: Set<string>;
      eventGroupIds: Set<string>;
    },
  ): Prisma.EventFormResponseWhereInput {
    const targetWhere: Prisma.EventFormResponseWhereInput[] = [];
    const eventIds = [...targets.eventIds];
    const majorEventIds = [...targets.majorEventIds];
    const eventGroupIds = [...targets.eventGroupIds];
    if (eventIds.length > 0) {
      targetWhere.push({ eventId: { in: eventIds } });
    }
    if (majorEventIds.length > 0) {
      targetWhere.push({ majorEventId: { in: majorEventIds } });
      targetWhere.push({ event: { majorEventId: { in: majorEventIds } } });
    }
    if (eventGroupIds.length > 0) {
      targetWhere.push({ event: { eventGroupId: { in: eventGroupIds } } });
    }

    return targetWhere.length > 0 ? { ...where, OR: targetWhere } : { ...where, id: { in: [] } };
  }

  private formIntersectsAccessibleTargets(
    form: EventFormRecord,
    targets: {
      eventIds: Set<string>;
      majorEventIds: Set<string>;
      eventGroupIds: Set<string>;
    },
  ): boolean {
    if (form.ownerEventId && targets.eventIds.has(form.ownerEventId)) {
      return true;
    }
    if (form.ownerMajorEventId && targets.majorEventIds.has(form.ownerMajorEventId)) {
      return true;
    }
    return form.links.some((link) => this.linkIntersectsAccessibleTargets(link, targets));
  }

  private linkIntersectsAccessibleTargets(
    link: EventFormLinkRecord,
    targets: {
      eventIds: Set<string>;
      majorEventIds: Set<string>;
      eventGroupIds: Set<string>;
    },
  ): boolean {
    if (link.eventId && targets.eventIds.has(link.eventId)) {
      return true;
    }
    if (link.majorEventId && targets.majorEventIds.has(link.majorEventId)) {
      return true;
    }
    if (link.event?.eventGroupId && targets.eventGroupIds.has(link.event.eventGroupId)) {
      return true;
    }
    if (link.event?.majorEventId && targets.majorEventIds.has(link.event.majorEventId)) {
      return true;
    }
    return false;
  }

  private buildBuckets(element: FormElement, values: readonly FormAnswerValue[]): Array<{ label: string; value: number }> {
    const buckets = new Map<string, number>();
    const optionLabels = new Map(element.options.map((option) => [option.id, option.label]));
    const add = (key: string | number) => {
      const label = optionLabels.get(String(key)) ?? String(key);
      buckets.set(label, (buckets.get(label) ?? 0) + 1);
    };

    for (const value of values) {
      if (typeof value === 'string' || typeof value === 'number') {
        add(value);
      } else if (Array.isArray(value)) {
        value.forEach(add);
      } else if (this.isRecord(value)) {
        for (const entry of Object.values(value)) {
          if (typeof entry === 'string' || typeof entry === 'number') {
            add(entry);
          } else if (Array.isArray(entry)) {
            entry.forEach((item) => add(String(item)));
          }
        }
      }
    }

    if (['shortText', 'longText', 'date', 'time', 'scheduling'].includes(element.type)) {
      return [];
    }

    return [...buckets.entries()].map(([label, value]) => ({ label, value }));
  }

  private buildTextAnswers(element: FormElement, values: readonly FormAnswerValue[]): string[] {
    if (element.type !== 'shortText' && element.type !== 'longText') {
      return [];
    }

    return values.filter((value): value is string => typeof value === 'string');
  }

  private valueForElement(answers: readonly FormResponseAnswer[], elementId: string): FormAnswerValue {
    return answers.find((answer) => answer.elementId === elementId)?.value ?? null;
  }

  private async canPersonAnswerLink(
    personId: string,
    link: Pick<EventFormLinkModel, 'audience' | 'eventId' | 'majorEventId'>,
    options: { allowFutureSubscriber?: boolean } = {},
  ): Promise<boolean> {
    const [isSubscriber, isAttendee] = await Promise.all([
      this.isPersonSubscriber(personId, link, options),
      this.isPersonAttendee(personId, link),
    ]);

    switch (link.audience) {
      case ContractAudience.SUBSCRIBERS:
      case EventFormAudience.SUBSCRIBERS:
        return isSubscriber;
      case ContractAudience.ATTENDEES:
      case EventFormAudience.ATTENDEES:
        return isAttendee;
      default:
        return isSubscriber || isAttendee;
    }
  }

  private async assertPersonCanAnswerLink(
    personId: string,
    link: EventFormLinkRecord,
    options: { allowFutureSubscriber?: boolean } = {},
  ): Promise<void> {
    if (!(await this.canPersonAnswerLink(personId, this.toLinkModel(link), options))) {
      throw new ForbiddenException('Você não pode responder este formulário.');
    }
  }

  private async assertPersonCanViewPublicResults(personId: string, link: EventFormLinkRecord): Promise<void> {
    const linkModel = this.toLinkModel(link);
    const [isSubscriber, isAttendee, isLecturer] = await Promise.all([
      this.isPersonSubscriber(personId, linkModel, {}),
      this.isPersonAttendee(personId, linkModel),
      this.isPersonLecturerForLink(personId, linkModel),
    ]);

    if (!isSubscriber && !isAttendee && !isLecturer) {
      throw new ForbiddenException('Você não pode visualizar os resultados deste formulário.');
    }
  }

  private async assertPersonIsEventLecturer(personId: string, eventId: string): Promise<void> {
    const lecturer = await this.prisma.eventLecturer.findUnique({
      where: {
        eventId_personId: {
          eventId,
          personId,
        },
      },
      select: {
        eventId: true,
      },
    });
    if (!lecturer) {
      throw new ForbiddenException('Você não é ministrante deste evento.');
    }
  }

  private findEventLinkRecord(form: EventFormRecord, eventId: string): EventFormLinkRecord | null {
    return form.links.find((link) => link.eventId === eventId || link.event?.id === eventId) ?? null;
  }

  private findLinkRecordForTarget(
    form: EventFormRecord,
    target: ReturnType<EventFormsService['normalizeTarget']>,
  ): EventFormLinkRecord | null {
    return (
      form.links.find(
        (link) =>
          link.targetType === target.targetType &&
          link.eventId === target.eventId &&
          link.majorEventId === target.majorEventId,
      ) ?? null
    );
  }

  private async canAdminViewResults(user: AuthenticatedUser | undefined, formId: string): Promise<boolean> {
    try {
      await this.authorizationPolicy.assertPermissions(user, [Permission.EventForm.Results], {
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

  private async isPersonSubscriber(
    personId: string,
    link: Pick<EventFormLinkModel, 'eventId' | 'majorEventId'>,
    options: { allowFutureSubscriber?: boolean },
  ): Promise<boolean> {
    if (options.allowFutureSubscriber) {
      return true;
    }

    if (link.eventId) {
      return Boolean(
        await this.prisma.eventSubscription.findFirst({
          where: {
            eventId: link.eventId,
            personId,
            deletedAt: null,
          },
          select: { id: true },
        }),
      );
    }

    if (link.majorEventId) {
      return Boolean(
        await this.prisma.majorEventSubscription.findFirst({
          where: {
            majorEventId: link.majorEventId,
            personId,
            deletedAt: null,
          },
          select: { id: true },
        }),
      );
    }

    return false;
  }

  private async isPersonAttendee(
    personId: string,
    link: Pick<EventFormLinkModel, 'eventId' | 'majorEventId'>,
  ): Promise<boolean> {
    if (link.eventId) {
      return Boolean(
        await this.prisma.eventAttendance.findFirst({
          where: {
            eventId: link.eventId,
            personId,
          },
          select: { eventId: true },
        }),
      );
    }

    if (link.majorEventId) {
      return Boolean(
        await this.prisma.eventAttendance.findFirst({
          where: {
            personId,
            event: {
              majorEventId: link.majorEventId,
            },
          },
          select: { eventId: true },
        }),
      );
    }

    return false;
  }

  private async isPersonLecturerForLink(
    personId: string,
    link: Pick<EventFormLinkModel, 'eventId' | 'majorEventId'>,
  ): Promise<boolean> {
    if (link.eventId) {
      return Boolean(
        await this.prisma.eventLecturer.findUnique({
          where: {
            eventId_personId: {
              eventId: link.eventId,
              personId,
            },
          },
          select: { eventId: true },
        }),
      );
    }

    if (link.majorEventId) {
      return Boolean(
        await this.prisma.eventLecturer.findFirst({
          where: {
            personId,
            event: {
              majorEventId: link.majorEventId,
            },
          },
          select: { eventId: true },
        }),
      );
    }

    return false;
  }

  private toEventFormModel(form: EventFormRecord): EventFormModel {
    return {
      id: form.id,
      name: form.name,
      description: form.description,
      ownerEventId: form.ownerEventId,
      ownerMajorEventId: form.ownerMajorEventId,
      owner: form.ownerEvent
        ? this.toTargetSummary(EventFormTargetType.EVENT, form.ownerEvent)
        : form.ownerMajorEvent
          ? this.toTargetSummary(EventFormTargetType.MAJOR_EVENT, form.ownerMajorEvent)
          : null,
      elementsJson: JSON.stringify(form.elements),
      sigilo: form.sigilo,
      responseMode: form.responseMode,
      resultsPublic: form.resultsPublic,
      resultsLive: form.resultsLive,
      publicationState: form.publicationState,
      scheduledPublishAt: form.scheduledPublishAt,
      publishedAt: form.publishedAt,
      unpublishedAt: form.unpublishedAt,
      links: form.links.map((link) => this.toLinkModel(link)),
      responseCount: form._count.responses,
      deletedAt: form.deletedAt,
      createdAt: form.createdAt,
      createdById: form.createdById,
      updatedAt: form.updatedAt,
      updatedById: form.updatedById,
    };
  }

  private toPublicEventFormModel(form: EventFormModel): EventFormModel {
    if (form.resultsPublic) {
      return form;
    }

    return {
      ...form,
      responseCount: 0,
      links: form.links.map((link) => ({
        ...link,
        responseCount: 0,
      })),
    };
  }

  private toLinkModel(link: EventFormLinkRecord): EventFormLinkModel {
    return {
      id: link.id,
      formId: link.formId,
      targetType: link.targetType,
      eventId: link.eventId,
      majorEventId: link.majorEventId,
      target: link.event
        ? this.toTargetSummary(EventFormTargetType.EVENT, link.event)
        : link.majorEvent
          ? this.toTargetSummary(EventFormTargetType.MAJOR_EVENT, link.majorEvent)
          : null,
      audience: link.audience,
      insertInSubscriptionFlow: link.insertInSubscriptionFlow,
      requiredInSubscriptionFlow: link.requiredInSubscriptionFlow,
      enforceRequiredAnswers: link.enforceRequiredAnswers,
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

  private toTargetSummary(
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

  private toDraftModel(draft: {
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

  private toResponseModel(
    response: EventFormResponseRecord,
    sigilo: EventFormSigilo,
    viewer: ResultViewer,
    options: { includeAnswers?: boolean } = {},
  ): EventFormResponseModel {
    const canShowIdentity = this.canShowIdentity(sigilo, viewer);
    const canShowSubmittedAt = sigilo !== EventFormSigilo.ANONYMOUS || viewer === 'self';
    const includeAnswers = options.includeAnswers ?? true;

    return {
      id: response.id,
      formId: response.formId,
      linkId: response.linkId,
      targetType: response.targetType,
      eventId: response.eventId,
      majorEventId: response.majorEventId,
      personId: canShowIdentity ? response.personId : null,
      respondentName: canShowIdentity ? response.person.name : null,
      respondentEmail: canShowIdentity ? response.person.email : null,
      answersJson: JSON.stringify(includeAnswers ? response.answers : []),
      source: response.source,
      submittedAt: canShowSubmittedAt ? response.submittedAt : null,
      updatedAt: response.updatedAt,
    };
  }

  private canShowIdentity(sigilo: EventFormSigilo, viewer: ResultViewer): boolean {
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

  private canShowIndividualAnswers(sigilo: EventFormSigilo, viewer: ResultViewer): boolean {
    if (viewer === 'self' || viewer === 'admin') {
      return true;
    }
    return sigilo === EventFormSigilo.PUBLIC;
  }

  private buildAccessibleFormWhere(accessibleTargets: {
    eventIds: Set<string>;
    majorEventIds: Set<string>;
    eventGroupIds: Set<string>;
  }): Prisma.EventFormWhereInput {
    const eventIds = [...accessibleTargets.eventIds];
    const majorEventIds = [...accessibleTargets.majorEventIds];
    const eventGroupIds = [...accessibleTargets.eventGroupIds];
    const or: Prisma.EventFormWhereInput[] = [];

    if (eventIds.length > 0) {
      or.push({ ownerEventId: { in: eventIds } });
      or.push({ links: { some: { eventId: { in: eventIds }, deletedAt: null } } });
    }

    if (majorEventIds.length > 0) {
      or.push({ ownerMajorEventId: { in: majorEventIds } });
      or.push({ ownerEvent: { majorEventId: { in: majorEventIds } } });
      or.push({
        OR: [
          { links: { some: { majorEventId: { in: majorEventIds }, deletedAt: null } } },
          { links: { some: { event: { majorEventId: { in: majorEventIds } }, deletedAt: null } } },
        ],
      });
    }

    if (eventGroupIds.length > 0) {
      or.push({ links: { some: { event: { eventGroupId: { in: eventGroupIds } }, deletedAt: null } } });
    }

    return { OR: or };
  }

  private isEmptyAccessibleTargets(targets: { eventIds: Set<string>; majorEventIds: Set<string>; eventGroupIds: Set<string> }) {
    return targets.eventIds.size === 0 && targets.majorEventIds.size === 0 && targets.eventGroupIds.size === 0;
  }

  private normalizeOwner(input: EventFormInput): { ownerEventId: string | null; ownerMajorEventId: string | null } {
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

  private normalizeTarget(input: TargetInput): {
    targetType: EventFormTargetType;
    eventId: string | null;
    majorEventId: string | null;
  } {
    if (String(input.targetType) === EventFormTargetType.EVENT) {
      const eventId = input.eventId?.trim();
      if (!eventId) {
        throw new BadRequestException('Evento do formulário não informado.');
      }
      return { targetType: EventFormTargetType.EVENT, eventId, majorEventId: null };
    }

    const majorEventId = input.majorEventId?.trim();
    if (!majorEventId) {
      throw new BadRequestException('Grande evento do formulário não informado.');
    }
    return { targetType: EventFormTargetType.MAJOR_EVENT, eventId: null, majorEventId };
  }

  private assertSubscriptionFlowTargetAllowed(
    input: TargetInput,
    scope: SubscriptionFlowTargetScope,
  ): void {
    const target = this.normalizeTarget(input);
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

  private findLinkForTarget(form: EventFormModel, input: TargetInput): EventFormLinkModel | null {
    const target = this.normalizeTarget(input);
    return (
      form.links.find(
        (link) =>
          link.targetType === target.targetType &&
          link.eventId === target.eventId &&
          link.majorEventId === target.majorEventId,
      ) ?? null
    );
  }

  private toDbSigilo(value: ContractSigilo | EventFormSigilo): EventFormSigilo {
    return value as EventFormSigilo;
  }

  private toDbAudience(value: ContractAudience | EventFormAudience): EventFormAudience {
    return value as EventFormAudience;
  }

  private toDbResponseMode(value: ContractResponseMode | EventFormResponseMode): EventFormResponseMode {
    return value as EventFormResponseMode;
  }

  private toDbResponseSource(value: ContractResponseSource | EventFormResponseSource): EventFormResponseSource {
    return value as EventFormResponseSource;
  }

  private responseLookupWhere(
    form: Pick<EventFormRecord, 'id' | 'responseMode'>,
    personId: string,
    target: ReturnType<EventFormsService['normalizeTarget']>,
    linkId?: string,
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

    return {
      ...this.responseTargetWhere(form.id, personId, target),
      ...(linkId ? { linkId } : {}),
    };
  }

  private async lockSingleResponseSlot(
    tx: Prisma.TransactionClient,
    form: Pick<EventFormRecord, 'id' | 'responseMode'>,
    personId: string,
    target: ReturnType<EventFormsService['normalizeTarget']>,
  ): Promise<void> {
    const targetKey =
      form.responseMode === EventFormResponseMode.SINGLE_PER_FORM
        ? 'form'
        : `${target.targetType}:${target.eventId ?? target.majorEventId ?? ''}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`event-form-response:${form.id}:${personId}:${targetKey}`}, 0))`;
  }

  private async runSerializableFormTransaction<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await this.prisma.$transaction(operation, {
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

  private responseTargetWhere(
    formId: string,
    personId: string,
    target: ReturnType<EventFormsService['normalizeTarget']>,
  ): Prisma.EventFormResponseWhereInput {
    return {
      formId,
      personId,
      targetType: target.targetType,
      eventId: target.eventId,
      majorEventId: target.majorEventId,
    };
  }

  private normalizeName(value: string | null | undefined, fallback: string): string {
    const normalized = value?.trim();
    return normalized || fallback;
  }

  private normalizeOptionalText(value: string | null | undefined): string | null {
    const normalized = value?.trim();
    return normalized || null;
  }

  private stringValue(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
  }

  private defaultTitle(type: string): string {
    switch (type) {
      case 'section':
        return 'Nova seção';
      case 'statement':
        return 'Texto informativo';
      default:
        return 'Pergunta sem título';
    }
  }

  private answerToCsvCell(element: FormElement, value: FormAnswerValue): string {
    if (value === null || value === undefined) {
      return '';
    }
    if (typeof value === 'string' || typeof value === 'number') {
      if (element.options.length > 0) {
        return element.options.find((option) => option.id === String(value))?.label ?? String(value);
      }
      return String(value);
    }
    if (Array.isArray(value)) {
      return value
        .map((item) => element.options.find((option) => option.id === item)?.label ?? item)
        .join('; ');
    }
    return JSON.stringify(value);
  }

  private csvCell(value: string): string {
    const neutralizedValue = /^[=+\-@]/.test(value) ? `'${value}` : value;
    return `"${neutralizedValue.replace(/"/g, '""')}"`;
  }

  private actorInfo(user: AuthenticatedUser | undefined): { id?: string; name?: string; email?: string } {
    return {
      id: user?.sub,
      name: (typeof user?.claims['name'] === 'string' ? user.claims['name'] : undefined) ?? user?.preferredUsername,
      email: user?.email,
    };
  }

  private async emitResultsDelta(formId: string): Promise<void> {
    const subject = this.resultSubjects.get(formId);
    if (!subject) {
      return;
    }

    const responseCount = await this.prisma.eventFormResponse.count({
      where: {
        formId,
      },
    });

    subject.next({
      type: 'message',
      data: {
        formId,
        responseCount,
        updatedAt: new Date().toISOString(),
      },
    });
  }
}
