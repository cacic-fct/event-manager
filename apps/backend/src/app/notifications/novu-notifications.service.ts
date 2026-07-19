import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NovuSubscriberSession } from '@cacic-fct/shared-data-types';
import { SubscriptionStatus } from '@prisma/client';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import {
  mapAuthenticatedUserToRecipient,
  mapPersonToRecipient,
  mapUserToRecipient,
} from './novu-notification-recipients';
import { NovuNotificationTransport } from './novu-notification-transport';
import type {
  CertificateAvailableNotification,
  EventFormAvailableNotification,
  MajorEventSubscriptionNotificationRecord,
  NotificationRecipient,
  OfflineAttendanceReviewQueuedNotification,
  OnlineAttendanceAvailableNotification,
  SubscriptionStatusNotification,
} from './novu-notification.types';

export type {
  MajorEventSubscriptionNotificationRecord,
  NotificationRecipient,
  OnlineAttendanceAvailableNotification,
} from './novu-notification.types';

@Injectable()
export class NovuNotificationsService {
  private readonly logger = new Logger(NovuNotificationsService.name);
  private readonly transport: NovuNotificationTransport;
  private readonly workflowIdentifier = this.config.get<string>(
    'NOVU_MAJOR_EVENT_SUBSCRIPTION_WORKFLOW_IDENTIFIER',
    'major-event-subscription-status-changed',
  );
  private readonly offlineAttendanceReviewWorkflowIdentifier = this.config.get<string>(
    'NOVU_OFFLINE_ATTENDANCE_REVIEW_WORKFLOW_IDENTIFIER',
    'offline-attendance-review-queued',
  );
  private readonly certificateAvailableWorkflowIdentifier = this.config.get<string>(
    'NOVU_CERTIFICATE_AVAILABLE_WORKFLOW_IDENTIFIER',
    'certificate-available',
  );
  private readonly eventFormAvailableWorkflowIdentifier = this.config.get<string>(
    'NOVU_EVENT_FORM_AVAILABLE_WORKFLOW_IDENTIFIER',
    'event-form-available',
  );

  constructor(private readonly config: ConfigService) {
    this.transport = new NovuNotificationTransport(config, this.logger);
  }

  createSubscriberSession(recipient: NotificationRecipient): NovuSubscriberSession | null {
    return this.transport.createSubscriberSession(recipient);
  }

  mapAuthenticatedUserToRecipient(user: AuthenticatedUser): NotificationRecipient {
    return mapAuthenticatedUserToRecipient(user);
  }

  async notifyMajorEventSubscriptionStatusChanged(input: SubscriptionStatusNotification): Promise<void> {
    const secretKey = this.transport.secretKey();
    if (!secretKey) {
      return;
    }

    if (input.previousStatus === input.nextStatus) {
      return;
    }

    const actionUrl = `/profile/attendances/major-event/${input.majorEventId}`;
    const statusLabel = this.statusLabel(input.nextStatus);
    const title = `Inscrição em ${input.majorEventName}`;
    const body = this.statusBody(input.majorEventName, input.nextStatus);

    await this.transport.trigger(secretKey, {
          name: this.workflowIdentifier,
          to: input.recipient,
          transactionId: `major-event-subscription:${input.subscriptionId}:${input.nextStatus}`,
          payload: {
            title,
            subject: title,
            body,
            majorEventId: input.majorEventId,
            majorEventName: input.majorEventName,
            subscriptionId: input.subscriptionId,
            previousStatus: input.previousStatus,
            nextStatus: input.nextStatus,
            statusLabel,
            isPositive: this.isPositiveStatus(input.nextStatus),
            isNegative: this.isNegativeStatus(input.nextStatus),
            rejectionReason: input.rejectionReason ?? null,
            actionLabel: 'Ver inscrição',
            actionUrl,
            redirectUrl: actionUrl,
            subscriberId: input.recipient.subscriberId,
          },
          overrides: {
            fcm: {
              data: {
                url: actionUrl,
                majorEventId: input.majorEventId,
                subscriptionId: input.subscriptionId,
                subscriberId: input.recipient.subscriberId,
              },
            },
            webPush: {
              data: {
                url: actionUrl,
                majorEventId: input.majorEventId,
                subscriptionId: input.subscriptionId,
                subscriberId: input.recipient.subscriberId,
              },
            },
          },
    });
  }

  async notifyMajorEventSubscriptionRecordChanged(
    previousStatus: SubscriptionStatus,
    subscription: MajorEventSubscriptionNotificationRecord,
  ): Promise<void> {
    await this.notifyMajorEventSubscriptionStatusChanged({
      subscriptionId: subscription.id,
      majorEventId: subscription.majorEventId,
      majorEventName: subscription.majorEvent.name,
      previousStatus,
      nextStatus: subscription.subscriptionStatus,
      recipient: this.mapPersonToRecipient(subscription.person),
      rejectionReason: subscription.receiptRejectionReason,
    });
  }

  async notifyOfflineAttendanceReviewQueued(input: OfflineAttendanceReviewQueuedNotification): Promise<void> {
    const secretKey = this.transport.secretKey();
    if (!secretKey || input.recipients.length === 0) {
      return;
    }

    const actionUrl = `/admin/attendances/event/${input.eventId}?offlineReview=pending`;
    const title = `Presença off-line para revisar`;
    const body = `Uma presença off-line de ${input.eventName} foi enviada para revisão administrativa.`;

    await this.transport.trigger(secretKey, {
          name: this.offlineAttendanceReviewWorkflowIdentifier,
          to: input.recipients,
          transactionId: `offline-attendance-review:${input.submissionId}`,
          payload: {
            title,
            subject: title,
            body,
            eventId: input.eventId,
            eventName: input.eventName,
            submissionId: input.submissionId,
            submittedById: input.submittedById,
            authorName: input.authorName ?? null,
            submittedAt: input.submittedAt.toISOString(),
            actionLabel: 'Revisar presença',
            actionUrl,
            redirectUrl: actionUrl,
          },
          overrides: {
            fcm: {
              data: {
                url: actionUrl,
                eventId: input.eventId,
                submissionId: input.submissionId,
              },
            },
            webPush: {
              data: {
                url: actionUrl,
                eventId: input.eventId,
                submissionId: input.submissionId,
              },
            },
          },
    });
  }

  async notifyCertificateAvailable(input: CertificateAvailableNotification): Promise<boolean> {
    const secretKey = this.transport.secretKey();
    if (!secretKey) {
      return false;
    }

    const actionUrl = '/profile/attendances';
    const title = 'Certificado disponível';
    const targetLabel = input.targetName?.trim() || input.certificateName;
    const body = `Seu certificado de ${targetLabel} está disponível.`;

    return this.transport.trigger(secretKey, {
          name: this.certificateAvailableWorkflowIdentifier,
          to: input.recipient,
          transactionId: `certificate-available:${input.configId}:${input.certificateId}:${input.issuedAt.toISOString()}`,
          payload: {
            title,
            subject: title,
            body,
            certificateId: input.certificateId,
            configId: input.configId,
            certificateName: input.certificateName,
            targetName: input.targetName ?? null,
            issuedAt: input.issuedAt.toISOString(),
            actionLabel: 'Ver certificados',
            actionUrl,
            redirectUrl: actionUrl,
            subscriberId: input.recipient.subscriberId,
          },
          overrides: {
            fcm: {
              data: {
                url: actionUrl,
                certificateId: input.certificateId,
                configId: input.configId,
                subscriberId: input.recipient.subscriberId,
              },
            },
            webPush: {
              data: {
                url: actionUrl,
                certificateId: input.certificateId,
                configId: input.configId,
                subscriberId: input.recipient.subscriberId,
              },
            },
          },
    });
  }

  async notifyEventFormAvailable(input: EventFormAvailableNotification): Promise<boolean> {
    const secretKey = this.transport.secretKey();
    if (!secretKey || input.recipients.length === 0) {
      return false;
    }

    const searchParams = new URLSearchParams({
      targetType: input.targetType,
      targetId: input.targetId,
    });
    if (input.linkId) {
      searchParams.set('linkId', input.linkId);
    }
    const actionUrl = `/profile/forms/${input.formId}?${searchParams.toString()}`;
    const title = input.requiredSubscriptionForm ? 'Formulário obrigatório pendente' : 'Formulário disponível';
    const body = input.requiredSubscriptionForm
      ? `Para concluir sua inscrição em ${input.targetName}, responda o formulário "${input.formName}".`
      : `O formulário "${input.formName}" está disponível para ${input.targetName}.`;
    const transactionIdParts = [
      input.requiredSubscriptionForm ? 'required-subscription-form' : 'event-form-available',
      input.formId,
      input.targetType,
      input.targetId,
    ];
    if (input.linkId) {
      transactionIdParts.push(input.linkId);
    }

    return this.transport.trigger(secretKey, {
          name: this.eventFormAvailableWorkflowIdentifier,
          to: input.recipients,
          transactionId: transactionIdParts.join(':'),
          payload: {
            title,
            subject: title,
            body,
            formId: input.formId,
            formName: input.formName,
            targetType: input.targetType,
            targetId: input.targetId,
            targetName: input.targetName,
            actionLabel: 'Responder formulário',
            actionUrl,
            redirectUrl: actionUrl,
          },
          overrides: {
            fcm: {
              data: {
                url: actionUrl,
                formId: input.formId,
                targetType: input.targetType,
                targetId: input.targetId,
              },
            },
            webPush: {
              data: {
                url: actionUrl,
                formId: input.formId,
                targetType: input.targetType,
                targetId: input.targetId,
              },
            },
          },
    });
  }

  async notifyOnlineAttendanceAvailable(input: OnlineAttendanceAvailableNotification): Promise<boolean> {
    const secretKey = this.transport.secretKey();
    if (!secretKey || input.recipients.length === 0) {
      return false;
    }

    const actionUrl = `/attendance/register/${input.eventId}?fromNotification=true`;
    const endTime = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(input.endsAt);
    const title = 'Presença disponível';
    const body = `Você pode registrar sua presença em ${input.eventName} até ${endTime}.`;

    return this.transport.trigger(secretKey, {
      name: this.config.get<string>('NOVU_ONLINE_ATTENDANCE_WORKFLOW_IDENTIFIER', 'online-attendance-available'),
      to: input.recipients,
      transactionId: `online-attendance-available:${input.eventId}:${input.endsAt.toISOString()}`,
      payload: {
        title,
        subject: title,
        body,
        eventId: input.eventId,
        eventName: input.eventName,
        endsAt: input.endsAt.toISOString(),
        actionLabel: 'Registrar presença',
        actionUrl,
        redirectUrl: actionUrl,
      },
      overrides: {
        fcm: { data: { url: actionUrl, eventId: input.eventId } },
        webPush: { data: { url: actionUrl, eventId: input.eventId } },
      },
    });
  }

  mapPersonToRecipient(person: {
    id: string;
    name: string;
    email?: string | null;
    phone?: string | null;
    userId?: string | null;
    user?: { id: string; email: string; name: string } | null;
  }): NotificationRecipient {
    return mapPersonToRecipient(person);
  }

  mapUserToRecipient(user: { id: string; email: string; name: string }): NotificationRecipient {
    return mapUserToRecipient(user);
  }

  private statusLabel(status: SubscriptionStatus): string {
    switch (status) {
      case SubscriptionStatus.WAITING_RECEIPT_UPLOAD:
        return 'Aguardando comprovante';
      case SubscriptionStatus.RECEIPT_UNDER_REVIEW:
        return 'Comprovante em análise';
      case SubscriptionStatus.CONFIRMED:
        return 'Confirmada';
      case SubscriptionStatus.CANCELED:
        return 'Cancelada';
      case SubscriptionStatus.REJECTED_INVALID_RECEIPT:
        return 'Comprovante recusado';
      case SubscriptionStatus.REJECTED_NO_SLOTS:
        return 'Sem vagas';
      case SubscriptionStatus.REJECTED_SCHEDULE_CONFLICT:
        return 'Conflito de horário';
      case SubscriptionStatus.REJECTED_GENERIC:
        return 'Inscrição recusada';
    }
  }

  private statusBody(majorEventName: string, status: SubscriptionStatus): string {
    switch (status) {
      case SubscriptionStatus.CONFIRMED:
        return `Sua inscrição em ${majorEventName} foi confirmada.`;
      case SubscriptionStatus.REJECTED_INVALID_RECEIPT:
        return `Seu comprovante de pagamento de ${majorEventName} foi recusado.`;
      case SubscriptionStatus.REJECTED_NO_SLOTS:
        return `Sua inscrição em ${majorEventName} precisa de atenção: não há vagas em uma das atividades.`;
      case SubscriptionStatus.REJECTED_SCHEDULE_CONFLICT:
        return `Sua inscrição em ${majorEventName} precisa de atenção: há conflito de horário.`;
      case SubscriptionStatus.REJECTED_GENERIC:
        return `Sua inscrição em ${majorEventName} foi recusada.`;
      case SubscriptionStatus.CANCELED:
        return `Sua inscrição em ${majorEventName} foi cancelada.`;
      case SubscriptionStatus.RECEIPT_UNDER_REVIEW:
        return `Seu comprovante de ${majorEventName} está em análise.`;
      case SubscriptionStatus.WAITING_RECEIPT_UPLOAD:
        return `Sua inscrição em ${majorEventName} está aguardando envio de comprovante.`;
    }
  }

  private isPositiveStatus(status: SubscriptionStatus): boolean {
    return status === SubscriptionStatus.CONFIRMED;
  }

  private isNegativeStatus(status: SubscriptionStatus): boolean {
    return new Set<SubscriptionStatus>([
      SubscriptionStatus.CANCELED,
      SubscriptionStatus.REJECTED_GENERIC,
      SubscriptionStatus.REJECTED_INVALID_RECEIPT,
      SubscriptionStatus.REJECTED_NO_SLOTS,
      SubscriptionStatus.REJECTED_SCHEDULE_CONFLICT,
    ]).has(status);
  }
}
