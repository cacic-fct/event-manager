import { Injectable } from '@nestjs/common';
import {
  EventForm as EventFormModel,
  EventFormDraft as EventFormDraftModel,
  EventFormInput,
  EventFormResponseMode as ContractResponseMode,
  EventFormSigilo as ContractSigilo,
} from '@cacic-fct/shared-data-types';
import { Permission } from '@cacic-fct/shared-permissions';
import { FormElement } from '@cacic-fct/form-contracts';
import { AuditLogOperation, Prisma } from '@prisma/client';
import { addDays } from 'date-fns';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { AuthorizationPolicyService } from '../authorization/authorization-policy.service';
import { PrismaService } from '../prisma/prisma.service';
import { eventFormAuditRecord } from './event-form-audit';
import { assertQuestionsHaveTitles, parseElementsJson } from './event-form-answer-normalization';
import { EventFormImagesService, parseEventFormImageReferences } from './event-form-images.service';
import { toDraftModel, toEventFormModel } from './event-form-model.mapper';
import { eventFormInclude } from './event-form-records';
import {
  assertCanManageLinkedTargets,
  eventFormActorInfo,
  normalizeFormName,
  normalizeOptionalFormText,
  replaceEventFormLinks,
  requireEventForm,
  updateDraftForSourceForm,
} from './event-form-service-support';
import {
  formOwnerTargetInput,
  formTargetInputs,
  manageableLinksForReplace,
  normalizeOwner,
  ownerTargetInput,
  toDbResponseMode,
  toDbSigilo,
} from './event-form-targets';

@Injectable()
export class EventFormEditorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorizationPolicy: AuthorizationPolicyService,
    private readonly auditLog: AuditLogService,
    private readonly images: EventFormImagesService,
  ) {}

  async saveForm(input: EventFormInput, user: AuthenticatedUser | undefined): Promise<EventFormModel> {
    const elements = parseElementsJson(input.elementsJson ?? '[]');
    assertQuestionsHaveTitles(elements);
    const submittedDescriptionImages =
      input.descriptionImagesJson === undefined || input.descriptionImagesJson === null
        ? null
        : parseEventFormImageReferences(input.descriptionImagesJson);
    const target = normalizeOwner(input);
    const actorId = user?.sub;

    if (input.id) {
      const existing = await requireEventForm(this.prisma, input.id);
      const descriptionImages = submittedDescriptionImages ?? storedImageReferences(existing.descriptionImages);
      const nextLinks = input.links ?? [];
      const shouldReplaceLinks = input.links !== undefined && input.links !== null;
      const resultsPublic = input.resultsPublic ?? existing.resultsPublic;
      await this.authorizationPolicy.assertPermissions(user, [Permission.EventForm.Update], {
        eventFormId: existing.id,
      });
      await assertCanManageLinkedTargets(
        this.authorizationPolicy,
        user,
        [formOwnerTargetInput(existing)],
        Permission.EventForm.Update,
      );
      await assertCanManageLinkedTargets(
        this.authorizationPolicy,
        user,
        [ownerTargetInput(target)],
        Permission.EventForm.Update,
      );
      if (shouldReplaceLinks) {
        await assertCanManageLinkedTargets(
          this.authorizationPolicy,
          user,
          manageableLinksForReplace(existing.links, nextLinks),
          Permission.EventForm.Update,
        );
      }

      const result = await this.prisma.$transaction(async (tx) => {
        await tx.eventForm.update({
          where: { id: existing.id },
          data: {
            name: normalizeFormName(input.name, existing.name),
            description: normalizeOptionalFormText(input.description),
            descriptionImages: descriptionImages as unknown as Prisma.InputJsonValue,
            ownerEventId: target.ownerEventId,
            ownerMajorEventId: target.ownerMajorEventId,
            elements: storedElements(elements),
            sigilo: toDbSigilo(input.sigilo ?? existing.sigilo),
            responseMode: toDbResponseMode(input.responseMode ?? existing.responseMode),
            resultsPublic,
            resultsLive: resultsPublic ? (input.resultsLive ?? existing.resultsLive) : false,
            allowResponseEdits: input.allowResponseEdits ?? existing.allowResponseEdits,
            updatedById: actorId,
          },
        });
        if (shouldReplaceLinks) {
          await replaceEventFormLinks(tx, existing.id, nextLinks, actorId, existing.links);
        }
        const removedImageKeys = await this.images.reconcile(tx, existing.id, descriptionImages, elements, actorId);

        const updated = await tx.eventForm.findUniqueOrThrow({
          where: { id: existing.id },
          include: eventFormInclude,
        });
        await this.auditLog.record(
          eventFormAuditRecord(
            updated,
            AuditLogOperation.UPDATE,
            user,
            existing,
            updated,
            `Formulário "${updated.name}" atualizado.`,
          ),
          tx,
        );
        return { updated, removedImageKeys };
      });

      await this.images.deleteObjectsBestEffort(result.removedImageKeys);
      return toEventFormModel(result.updated);
    }

    await this.authorizationPolicy.assertPermissions(user, [Permission.EventForm.Create], {
      eventId: target.ownerEventId ?? undefined,
      majorEventId: target.ownerMajorEventId ?? undefined,
      allowScopedCollection: true,
    });
    const descriptionImages = submittedDescriptionImages ?? [];
    await assertCanManageLinkedTargets(this.authorizationPolicy, user, input.links ?? [], Permission.EventForm.Create);

    const created = await this.prisma.$transaction(async (tx) => {
      const form = await tx.eventForm.create({
        data: {
          name: normalizeFormName(input.name, 'Formulário sem título'),
          description: normalizeOptionalFormText(input.description),
          descriptionImages: descriptionImages as unknown as Prisma.InputJsonValue,
          ownerEventId: target.ownerEventId,
          ownerMajorEventId: target.ownerMajorEventId,
          elements: storedElements(elements),
          sigilo: toDbSigilo(input.sigilo ?? ContractSigilo.SECRET),
          responseMode: toDbResponseMode(input.responseMode ?? ContractResponseMode.ONE_PER_TARGET),
          resultsPublic: input.resultsPublic ?? false,
          resultsLive: input.resultsPublic === true ? (input.resultsLive ?? false) : false,
          allowResponseEdits: input.allowResponseEdits ?? false,
          createdById: actorId,
          updatedById: actorId,
        },
      });

      await replaceEventFormLinks(tx, form.id, input.links ?? [], actorId);
      await this.images.reconcile(tx, form.id, descriptionImages, elements, actorId);

      const created = await tx.eventForm.findUniqueOrThrow({
        where: { id: form.id },
        include: eventFormInclude,
      });
      await this.auditLog.record(
        eventFormAuditRecord(
          created,
          AuditLogOperation.CREATE,
          user,
          null,
          created,
          `Formulário "${created.name}" criado.`,
        ),
        tx,
      );
      return created;
    });

    return toEventFormModel(created);
  }

  async saveDraft(
    input: { sourceFormId: string; draftId?: string | null; input: EventFormInput },
    user: AuthenticatedUser | undefined,
  ): Promise<EventFormDraftModel> {
    const form = await requireEventForm(this.prisma, input.sourceFormId);
    await this.authorizationPolicy.assertPermissions(user, [Permission.EventForm.Update], {
      eventFormId: form.id,
    });

    const draftElements = parseElementsJson(input.input.elementsJson ?? JSON.stringify(form.elements));
    assertQuestionsHaveTitles(draftElements);
    const payload = JSON.parse(
      JSON.stringify({
        ...input.input,
        elementsJson: JSON.stringify(draftElements),
      }),
    ) as Prisma.InputJsonObject;
    const actor = eventFormActorInfo(user);
    const expiresAt = addDays(new Date(), 30);

    const draft = input.draftId
      ? await updateDraftForSourceForm(this.prisma, input.draftId, form.id, {
          name: normalizeFormName(input.input.name, form.name),
          payload,
          updatedById: actor.id,
          updatedByName: actor.name,
          updatedByEmail: actor.email,
          expiresAt,
        })
      : await this.prisma.eventFormDraft.create({
          data: {
            sourceFormId: form.id,
            name: normalizeFormName(input.input.name, form.name),
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

    return toDraftModel(draft);
  }

  async listDrafts(sourceFormId: string, user: AuthenticatedUser | undefined): Promise<EventFormDraftModel[]> {
    const form = await requireEventForm(this.prisma, sourceFormId);
    await this.authorizationPolicy.assertPermissions(user, [Permission.EventForm.Update], {
      eventFormId: form.id,
    });

    const drafts = await this.prisma.eventFormDraft.findMany({
      where: {
        sourceFormId,
        expiresAt: {
          gt: new Date(),
        },
      },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    });

    return drafts.map((draft) => toDraftModel(draft));
  }

  async deleteForm(formId: string, user: AuthenticatedUser | undefined): Promise<EventFormModel> {
    const form = await requireEventForm(this.prisma, formId);
    await this.authorizationPolicy.assertPermissions(user, [Permission.EventForm.Delete], {
      eventFormId: form.id,
    });
    await assertCanManageLinkedTargets(
      this.authorizationPolicy,
      user,
      formTargetInputs(form),
      Permission.EventForm.Delete,
    );

    const updated = await this.prisma.$transaction(async (tx) => {
      const deletedAt = new Date();
      const deleted = await tx.eventForm.update({
        where: { id: form.id },
        data: {
          deletedAt,
          updatedById: user?.sub,
          links: {
            updateMany: {
              where: { deletedAt: null },
              data: { deletedAt, updatedById: user?.sub },
            },
          },
        },
        include: eventFormInclude,
      });
      await this.auditLog.record(
        eventFormAuditRecord(
          form,
          AuditLogOperation.DELETE,
          user,
          form,
          deleted,
          `Formulário "${form.name}" excluído.`,
        ),
        tx,
      );
      return deleted;
    });

    return toEventFormModel(updated);
  }
}

function storedElements(elements: readonly FormElement[]): Prisma.InputJsonValue {
  return elements.map((element) => ({
    ...element,
    descriptionImages: (element.descriptionImages ?? []).map(({ id, altText, caption }) => ({
      id,
      ...(altText ? { altText } : {}),
      ...(caption ? { caption } : {}),
    })),
  })) as unknown as Prisma.InputJsonValue;
}

function storedImageReferences(value: Prisma.JsonValue): ReturnType<typeof parseEventFormImageReferences> {
  return parseEventFormImageReferences(JSON.stringify(Array.isArray(value) ? value : []));
}
