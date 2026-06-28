import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  MessageEvent,
  NotFoundException,
} from '@nestjs/common';
import {
  EventForm as EventFormModel,
  EventFormAudience as ContractAudience,
  EventFormDraft as EventFormDraftModel,
  EventFormInput,
  EventFormLink as EventFormLinkModel,
  EventFormResults,
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
import { NovuNotificationsService } from '../notifications/novu-notifications.service';

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
    private readonly notifications: NovuNotificationsService,
  ) {}

  async listAdminForms(
    user: AuthenticatedUser | undefined,
    filters: { query?: string | null; eventId?: string | null; majorEventId?: string | null } = {},
  ): Promise<EventFormModel[]> {
    const where: Prisma.EventFormWhereInput = {
      deletedAt: null,
    };
    const accessibleTargets = await this.authorizationPolicy.accessibleEventTargets(user, Permission.EventForm.Read);
    if (accessibleTargets && this.isEmptyAccessibleTargets(accessibleTargets)) {
      return [];
    }
    if (accessibleTargets) {
      where.AND = [this.buildAccessibleFormWhere(accessibleTargets)];
    }

    const normalizedQuery = filters.query?.trim();
    if (normalizedQuery) {
      where.name = {
        contains: normalizedQuery,
        mode: 'insensitive',
      };
    }
    if (filters.eventId) {
      where.links = {
        some: {
          eventId: filters.eventId,
          deletedAt: null,
        },
      };
    }
    if (filters.majorEventId) {
      where.links = {
        some: {
          majorEventId: filters.majorEventId,
          deletedAt: null,
        },
      };
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
        eligible.push(form);
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

    const created = await this.prisma.$transaction(async (tx) => {
      const form = await tx.eventForm.create({
        data: {
          name: this.normalizeName(input.name, 'Formulário sem título'),
          description: this.normalizeOptionalText(input.description),
          ownerEventId: target.ownerEventId,
          ownerMajorEventId: target.ownerMajorEventId,
          elements: elements as unknown as Prisma.InputJsonValue,
          sigilo: this.toDbSigilo(input.sigilo ?? ContractSigilo.SECRET),
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
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60_000);

    const draft = input.draftId
      ? await this.prisma.eventFormDraft.update({
          where: { id: input.draftId },
          data: {
            name: this.normalizeName(input.input.name, form.name),
            payload,
            updatedById: actor.id,
            updatedByName: actor.name,
            updatedByEmail: actor.email,
            expiresAt,
          },
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

    if (scheduledPublishAt && scheduledPublishAt.getTime() > Date.now()) {
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
    if (!this.formHasEventLink(form, eventId)) {
      throw new NotFoundException('Formulário não vinculado a este evento.');
    }

    const authenticatedUser = this.currentUserContext.getAuthenticatedUser(context);
    return this.publishFormNow(form.id, authenticatedUser?.sub ?? person.id);
  }

  async unpublishForm(formId: string, user: AuthenticatedUser | undefined): Promise<EventFormModel> {
    const form = await this.requireForm(formId);
    await this.authorizationPolicy.assertPermissions(user, [Permission.EventForm.Publish], {
      eventFormId: form.id,
    });

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
    const target = this.normalizeTarget(input);
    const form = await this.requirePublishedForm(input.formId);
    const link = await this.requireActiveLinkForTarget(form.id, target, input.linkId ?? undefined);
    await this.assertPersonCanAnswerLink(person.id, link, {
      allowFutureSubscriber: input.source === ContractResponseSource.SUBSCRIPTION_FLOW,
    });
    const answers = this.normalizeAnswers(input.answersJson, form.elements as unknown as FormElement[], link.enforceRequiredAnswers);

    const response = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.eventFormResponse.findFirst({
        where: {
          formId: form.id,
          personId: person.id,
          targetType: target.targetType,
          eventId: target.eventId,
          majorEventId: target.majorEventId,
        },
        select: {
          id: true,
        },
      });

      if (existing) {
        return tx.eventFormResponse.update({
          where: {
            id: existing.id,
          },
          data: {
            linkId: link.id,
            answers: answers as unknown as Prisma.InputJsonValue,
            source: this.toDbResponseSource(input.source ?? ContractResponseSource.PUBLIC_FORM),
          },
          include: responseInclude,
        });
      }

      return tx.eventFormResponse.create({
        data: {
          formId: form.id,
          linkId: link.id,
          targetType: target.targetType,
          eventId: target.eventId,
          majorEventId: target.majorEventId,
          personId: person.id,
          answers: answers as unknown as Prisma.InputJsonValue,
          source: this.toDbResponseSource(input.source ?? ContractResponseSource.PUBLIC_FORM),
        },
        include: responseInclude,
      });
    });

    await this.emitResultsDelta(form.id);

    return this.toResponseModel(response, form.sigilo, 'self');
  }

  async getCurrentUserResponse(
    context: GraphqlContext,
    input: TargetInput & { formId: string },
  ): Promise<EventFormResponseModel | null> {
    const person = await this.currentUserContext.requireCurrentPerson(context);
    const target = this.normalizeTarget(input);
    const response = await this.prisma.eventFormResponse.findFirst({
      where: {
        formId: input.formId,
        personId: person.id,
        targetType: target.targetType,
        eventId: target.eventId,
        majorEventId: target.majorEventId,
      },
      include: responseInclude,
    });

    if (!response) {
      return null;
    }

    const form = await this.requireForm(input.formId);
    return this.toResponseModel(response, form.sigilo, 'self');
  }

  async getResults(formId: string, viewer: ResultViewer = 'admin'): Promise<EventFormResults> {
    const form = await this.requireForm(formId);
    const responses = await this.prisma.eventFormResponse.findMany({
      where: {
        formId,
      },
      include: responseInclude,
      orderBy: {
        submittedAt: 'desc',
      },
    });
    const elements = form.elements as unknown as FormElement[];
    const summary = this.buildSummary(elements, responses);

    return {
      form: this.toEventFormModel(form),
      responseCount: responses.length,
      anonymous: form.sigilo === EventFormSigilo.ANONYMOUS,
      answersReleased: this.canShowIndividualAnswers(form.sigilo, viewer),
      summaryJson: JSON.stringify(summary),
      responses: this.canShowIndividualAnswers(form.sigilo, viewer)
        ? responses.map((response) => this.toResponseModel(response, form.sigilo, viewer))
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
    if (!this.formHasEventLink(form, eventId)) {
      throw new NotFoundException('Formulário não vinculado a este evento.');
    }

    return this.getResults(formId, 'lecturer');
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

  private async notifyEligiblePeople(form: EventFormRecord): Promise<void> {
    for (const link of form.links) {
      if (!link.notifyOnPublish || link.lastNotifiedAt) {
        continue;
      }

      const targetEndDate = link.event?.endDate ?? link.majorEvent?.endDate;
      if (!targetEndDate || targetEndDate.getTime() < Date.now()) {
        continue;
      }

      const recipients = await this.findNotificationRecipients(link);
      if (recipients.length === 0) {
        continue;
      }

      await this.notifications.notifyEventFormAvailable({
        formId: form.id,
        formName: form.name,
        targetType: link.targetType,
        targetId: link.eventId ?? link.majorEventId ?? '',
        targetName: link.event?.name ?? link.majorEvent?.name ?? form.name,
        recipients,
      });

      await this.prisma.eventFormLink.update({
        where: { id: link.id },
        data: {
          lastNotifiedAt: new Date(),
        },
      });
    }
  }

  private async findNotificationRecipients(link: EventFormLinkRecord) {
    const people = new Map<string, Parameters<NovuNotificationsService['mapPersonToRecipient']>[0]>();

    if (link.eventId) {
      if (link.audience !== EventFormAudience.ATTENDEES) {
        const subscriptions = await this.prisma.eventSubscription.findMany({
          where: {
            eventId: link.eventId,
            deletedAt: null,
          },
          select: {
            person: this.notificationPersonSelect(),
          },
        });
        for (const subscription of subscriptions) {
          people.set(subscription.person.id, subscription.person);
        }
      }
      if (link.audience !== EventFormAudience.SUBSCRIBERS) {
        const attendances = await this.prisma.eventAttendance.findMany({
          where: {
            eventId: link.eventId,
          },
          select: {
            person: this.notificationPersonSelect(),
          },
        });
        for (const attendance of attendances) {
          people.set(attendance.person.id, attendance.person);
        }
      }
    }

    if (link.majorEventId) {
      if (link.audience !== EventFormAudience.ATTENDEES) {
        const subscriptions = await this.prisma.majorEventSubscription.findMany({
          where: {
            majorEventId: link.majorEventId,
            deletedAt: null,
          },
          select: {
            person: this.notificationPersonSelect(),
          },
        });
        for (const subscription of subscriptions) {
          people.set(subscription.person.id, subscription.person);
        }
      }
      if (link.audience !== EventFormAudience.SUBSCRIBERS) {
        const attendances = await this.prisma.eventAttendance.findMany({
          where: {
            event: {
              majorEventId: link.majorEventId,
            },
          },
          select: {
            person: this.notificationPersonSelect(),
          },
        });
        for (const attendance of attendances) {
          people.set(attendance.person.id, attendance.person);
        }
      }
    }

    return [...people.values()].map((person) => this.notifications.mapPersonToRecipient(person));
  }

  private notificationPersonSelect() {
    return {
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        userId: true,
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    } satisfies Prisma.PeopleDefaultArgs;
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

  private async requirePublishedForm(formId: string): Promise<EventFormRecord> {
    const form = await this.requireForm(formId);
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
        requiredInSubscriptionFlow: link.requiredInSubscriptionFlow ?? false,
        enforceRequiredAnswers: link.enforceRequiredAnswers ?? true,
        displayOrder: link.displayOrder ?? 0,
        availableFrom: link.availableFrom ?? null,
        availableUntil: link.availableUntil ?? null,
        notifyOnPublish: link.notifyOnPublish ?? true,
        updatedById: actorId,
      } satisfies Prisma.EventFormLinkUncheckedUpdateInput;

      if (link.id) {
        await tx.eventFormLink.update({
          where: { id: link.id },
          data,
        });
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
        if (element.required && this.isEmptyAnswer(answersById.get(element.id) ?? null)) {
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
      case 'date':
      case 'time':
      case 'singleChoice':
      case 'selectionDropdown':
        return typeof value === 'string' && value.trim() ? value.trim() : null;
      case 'multipleChoice':
        return Array.isArray(value)
          ? [...new Set(value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean))]
          : null;
      case 'linearScale':
      case 'starRating':
        return typeof value === 'number' && Number.isFinite(value) ? value : null;
      case 'singleSelectionGrid':
        return this.normalizeGridAnswer(value, false);
      case 'multipleSelectionGrid':
        return this.normalizeGridAnswer(value, true);
      case 'scheduling':
        return this.normalizeSchedulingAnswer(value);
      default:
        return null;
    }
  }

  private normalizeGridAnswer(value: FormAnswerValue, multiple: boolean): FormAnswerValue {
    if (!this.isRecord(value)) {
      return null;
    }

    if (multiple) {
      const answer: Record<string, string[]> = {};
      for (const [rowId, rawValue] of Object.entries(value)) {
        if (Array.isArray(rawValue)) {
          answer[rowId] = rawValue.filter((item): item is string => typeof item === 'string');
        }
      }

      return Object.keys(answer).length > 0 ? answer : null;
    }

    const answer: Record<string, string> = {};
    for (const [rowId, rawValue] of Object.entries(value)) {
      if (typeof rawValue === 'string') {
        answer[rowId] = rawValue;
      }
    }

    return Object.keys(answer).length > 0 ? answer : null;
  }

  private normalizeSchedulingAnswer(value: FormAnswerValue): FormSchedulingAnswer | null {
    if (!this.isRecord(value) || typeof value['slotId'] !== 'string') {
      return null;
    }

    const record = value as Record<string, unknown>;
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

    return {
      slotId: value['slotId'],
      invitees,
    };
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

  private buildSummary(elements: readonly FormElement[], responses: readonly EventFormResponseRecord[]): FormResultSummary {
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
          textAnswers: this.buildTextAnswers(element, values),
        };
      }),
    };
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

  private formHasEventLink(form: EventFormRecord, eventId: string): boolean {
    return form.links.some((link) => link.eventId === eventId || link.event?.id === eventId);
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
  ): EventFormResponseModel {
    const canShowIdentity = this.canShowIdentity(sigilo, viewer);
    const canShowSubmittedAt = sigilo !== EventFormSigilo.ANONYMOUS || viewer === 'self';

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
      answersJson: JSON.stringify(response.answers),
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

  private toDbResponseSource(value: ContractResponseSource | EventFormResponseSource): EventFormResponseSource {
    return value as EventFormResponseSource;
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
    return `"${value.replace(/"/g, '""')}"`;
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
