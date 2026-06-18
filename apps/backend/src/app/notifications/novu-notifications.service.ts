import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NovuSubscriberSession } from '@cacic-fct/shared-data-types';
import { Prisma, SubscriptionStatus } from '@prisma/client';
import { createHmac } from 'node:crypto';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';

type NotificationRecipient = {
  subscriberId: string;
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  data?: Record<string, unknown>;
};

type SubscriptionStatusNotification = {
  subscriptionId: string;
  majorEventId: string;
  majorEventName: string;
  previousStatus: SubscriptionStatus;
  nextStatus: SubscriptionStatus;
  recipient: NotificationRecipient;
  rejectionReason?: string | null;
};

type NovuTriggerResponse = {
  acknowledged: boolean;
  status: string;
  error?: string[];
  transactionId?: string;
};

@Injectable()
export class NovuNotificationsService {
  private readonly logger = new Logger(NovuNotificationsService.name);
  private readonly workflowIdentifier = this.config.get<string>(
    'NOVU_MAJOR_EVENT_SUBSCRIPTION_WORKFLOW_IDENTIFIER',
    'major-event-subscription-status-changed',
  );

  constructor(private readonly config: ConfigService) {}

  createSubscriberSession(recipient: NotificationRecipient): NovuSubscriberSession | null {
    if (!this.isSecureModeEnabled()) {
      return null;
    }

    const secretKey = this.config.get<string>('NOVU_SECRET_KEY');
    const applicationIdentifier = this.getOptionalConfig('NOVU_APPLICATION_IDENTIFIER');

    if (!secretKey || !applicationIdentifier) {
      return null;
    }

    const session: NovuSubscriberSession = {
      applicationIdentifier,
      subscriberId: recipient.subscriberId,
      subscriberHash: this.signSubscriberId(recipient.subscriberId, secretKey),
    };

    const apiUrl = this.getOptionalConfig('NOVU_CLIENT_API_URL') ?? this.getOptionalConfig('NOVU_API_URL');
    if (apiUrl) {
      session.apiUrl = apiUrl.replace(/\/$/, '');
    }

    const socketUrl = this.getOptionalConfig('NOVU_CLIENT_SOCKET_URL');
    if (socketUrl) {
      session.socketUrl = socketUrl.replace(/\/$/, '');
    }

    const socketPath = this.getOptionalConfig('NOVU_CLIENT_SOCKET_PATH');
    if (socketPath) {
      session.socketPath = socketPath;
    }

    const pushIntegrationIdentifier = this.getOptionalConfig('NOVU_PUSH_INTEGRATION_IDENTIFIER');
    if (pushIntegrationIdentifier) {
      session.pushIntegrationIdentifier = pushIntegrationIdentifier;
    }

    const vapidPublicKey = this.getOptionalConfig('NOVU_VAPID_PUBLIC_KEY');
    if (vapidPublicKey) {
      session.vapidPublicKey = vapidPublicKey;
    }

    return session;
  }

  mapAuthenticatedUserToRecipient(user: AuthenticatedUser): NotificationRecipient {
    const subscriberId = user.sub ?? user.email ?? user.preferredUsername;
    if (!subscriberId) {
      throw new Error('Authenticated user does not have a stable subscriber identifier.');
    }

    return {
      subscriberId,
      email: user.email,
      firstName: typeof user.claims.given_name === 'string' ? user.claims.given_name : undefined,
      lastName: typeof user.claims.family_name === 'string' ? user.claims.family_name : undefined,
      data: {
        preferredUsername: user.preferredUsername,
      },
    };
  }

  async notifyMajorEventSubscriptionStatusChanged(input: SubscriptionStatusNotification): Promise<void> {
    if (!this.isSecureModeEnabled()) {
      return;
    }

    const secretKey = this.config.get<string>('NOVU_SECRET_KEY');

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

    try {
      const response = await fetch(`${this.apiUrl()}/v1/events/trigger`, {
        method: 'POST',
        headers: {
          Authorization: `ApiKey ${secretKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
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
        }),
      });

      if (!response.ok) {
        this.logger.warn(`Novu trigger failed with HTTP ${response.status}: ${await response.text()}`);
        return;
      }

      const result = (await response.json()) as NovuTriggerResponse;
      if (!result.acknowledged) {
        this.logger.warn(`Novu trigger was not acknowledged: ${result.status} ${result.error?.join(', ') ?? ''}`);
      }
    } catch (error) {
      this.logger.warn(`Novu trigger failed: ${error instanceof Error ? error.message : String(error)}`);
    }
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

  mapPersonToRecipient(person: {
    id: string;
    name: string;
    email?: string | null;
    phone?: string | null;
    userId?: string | null;
    user?: { id: string; email: string; name: string } | null;
  }): NotificationRecipient {
    const [firstName, ...lastNameParts] = person.name.trim().split(/\s+/);

    return {
      subscriberId: person.userId ?? person.user?.id ?? person.email ?? person.id,
      email: person.email ?? person.user?.email ?? undefined,
      phone: person.phone ?? undefined,
      firstName: firstName || undefined,
      lastName: lastNameParts.join(' ') || undefined,
      data: {
        personId: person.id,
      },
    };
  }

  private apiUrl(): string {
    return this.config.get<string>('NOVU_API_URL', 'https://api.novu.co').replace(/\/$/, '');
  }

  private getOptionalConfig(key: string): string | undefined {
    const value = this.config.get<string>(key)?.trim();
    return value || undefined;
  }

  private isSecureModeEnabled(): boolean {
    return this.config.get<string>('NOVU_SECURE_MODE_ENABLED')?.trim().toLowerCase() === 'true';
  }

  private signSubscriberId(subscriberId: string, secretKey: string): string {
    return createHmac('sha256', secretKey).update(subscriberId).digest('hex');
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

export type MajorEventSubscriptionNotificationRecord = Prisma.MajorEventSubscriptionGetPayload<{
  select: {
    id: true;
    majorEventId: true;
    subscriptionStatus: true;
    receiptRejectionReason: true;
    majorEvent: {
      select: {
        name: true;
      };
    };
    person: {
      select: {
        id: true;
        name: true;
        email: true;
        phone: true;
        userId: true;
        user: {
          select: {
            id: true;
            email: true;
            name: true;
          };
        };
      };
    };
  };
}>;
