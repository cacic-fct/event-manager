import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { EventForm as EventFormModel } from '@cacic-fct/shared-data-types';
import { Permission } from '@cacic-fct/shared-permissions';
import { AuditLogActorType, AuditLogOperation, PublicationState } from '@prisma/client';
import { isFuture } from 'date-fns';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuditRecordOptions } from '../audit-log/audit-log.types';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { AuthorizationPolicyService } from '../authorization/authorization-policy.service';
import { CurrentUserContextService } from '../current-user/context.service';
import { GraphqlContext } from '../current-user/selects';
import { PrismaService } from '../prisma/prisma.service';
import { assertPersonIsEventLecturer } from './event-form-eligibility';
import { eventFormAuditRecord } from './event-form-audit';
import { toEventFormModel } from './event-form-model.mapper';
import { EventFormNotificationService } from './event-form-notification.service';
import {
  notifyDueAvailableEventFormLinks,
  publishDueScheduledEventForms,
  publishEventFormNow,
} from './event-form-publication';
import { eventFormInclude } from './event-form-records';
import { assertCanManageLinkedTargets, requireEventForm } from './event-form-service-support';
import { findEventLinkRecord, formTargetInputs } from './event-form-targets';

@Injectable()
export class EventFormPublicationWorkflowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorizationPolicy: AuthorizationPolicyService,
    private readonly currentUserContext: CurrentUserContextService,
    private readonly formNotifications: EventFormNotificationService,
    private readonly auditLog: AuditLogService,
  ) {}

  async publishForm(
    formId: string,
    scheduledPublishAt: Date | null | undefined,
    user: AuthenticatedUser | undefined,
  ): Promise<EventFormModel> {
    const form = await requireEventForm(this.prisma, formId);
    await this.authorizationPolicy.assertPermissions(user, [Permission.EventForm.Publish], {
      eventFormId: form.id,
    });
    await assertCanManageLinkedTargets(this.authorizationPolicy, user, formTargetInputs(form), Permission.EventForm.Publish);

    if (scheduledPublishAt && isFuture(scheduledPublishAt)) {
      const scheduled = await this.prisma.$transaction(async (tx) => {
        const updated = await tx.eventForm.update({
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
        await this.auditLog.record(
          eventFormAuditRecord(
            updated,
            AuditLogOperation.UPDATE,
            user,
            form,
            updated,
            `Publicação do formulário "${updated.name}" agendada.`,
          ),
          tx,
        );
        return updated;
      });
      return toEventFormModel(scheduled);
    }

    return this.publishFormNow(form.id, user?.sub, user);
  }

  async publishLecturerForm(
    context: GraphqlContext,
    formId: string,
    eventId: string,
  ): Promise<EventFormModel> {
    const person = await this.currentUserContext.requireCurrentPerson(context);
    await assertPersonIsEventLecturer(this.prisma, person.id, eventId);
    const form = await requireEventForm(this.prisma, formId);
    const link = findEventLinkRecord(form, eventId);
    if (!link) {
      throw new NotFoundException('Formulário não vinculado a este evento.');
    }
    if (!link.allowLecturerManualPublish) {
      throw new ForbiddenException('Publicação por ministrantes não habilitada para este vínculo.');
    }
    const ownedExclusivelyByEvent = form.ownerEventId === eventId && !form.ownerMajorEventId;
    if (!ownedExclusivelyByEvent || form.links.some((item) => item.id !== link.id)) {
      throw new ForbiddenException('Publicação por ministrantes só está disponível para formulários exclusivos deste evento.');
    }

    const authenticatedUser = this.currentUserContext.getAuthenticatedUser(context);
    return this.publishFormNow(form.id, authenticatedUser?.sub ?? person.id, authenticatedUser ?? {
      id: person.id,
      name: person.name,
      email: person.email,
      type: AuditLogActorType.USER,
    });
  }

  async unpublishForm(formId: string, user: AuthenticatedUser | undefined): Promise<EventFormModel> {
    const form = await requireEventForm(this.prisma, formId);
    await this.authorizationPolicy.assertPermissions(user, [Permission.EventForm.Publish], {
      eventFormId: form.id,
    });
    await assertCanManageLinkedTargets(this.authorizationPolicy, user, formTargetInputs(form), Permission.EventForm.Publish);

    const updated = await this.prisma.$transaction(async (tx) => {
      const unpublished = await tx.eventForm.update({
        where: { id: form.id },
        data: {
          publicationState: PublicationState.UNPUBLISHED,
          scheduledPublishAt: null,
          unpublishedAt: new Date(),
          publicationUpdatedBy: user?.sub,
        },
        include: eventFormInclude,
      });
      await this.auditLog.record(
        eventFormAuditRecord(
          unpublished,
          AuditLogOperation.UPDATE,
          user,
          form,
          unpublished,
          `Formulário "${unpublished.name}" despublicado.`,
        ),
        tx,
      );
      return unpublished;
    });

    return toEventFormModel(updated);
  }

  async publishDueScheduledForms(): Promise<number> {
    return publishDueScheduledEventForms(this.prisma, this.formNotifications, this.auditLog);
  }

  async notifyDueAvailableLinks(): Promise<number> {
    return notifyDueAvailableEventFormLinks(this.prisma, this.formNotifications);
  }

  private async publishFormNow(
    formId: string,
    actorId: string | undefined,
    actor: AuditRecordOptions['actor'],
  ): Promise<EventFormModel> {
    return publishEventFormNow(this.prisma, this.formNotifications, formId, actorId, this.auditLog, actor);
  }
}
