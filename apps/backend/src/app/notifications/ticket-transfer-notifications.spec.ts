import { ConfigService } from '@nestjs/config';
import { NovuNotificationsService } from './novu-notifications.service';
import type { TicketTransferNotification } from './novu-notification.types';

describe('ticket transfer notifications', () => {
  it('uses truthful copy when an administrator cancels a holder transfer', () => {
    const service = new NovuNotificationsService({ get: (_key: string, defaultValue: string) => defaultValue } as ConfigService);
    const copy = (service as unknown as {
      ticketTransferCopy: (input: TicketTransferNotification) => { title: string; body: string; recipientWorkflow: boolean };
    }).ticketTransferCopy({
      notificationType: 'SENDER_ADMIN_CANCELED',
      transferId: 'transfer-1',
      recipientUserId: 'holder-user',
      ticketName: 'Ingresso da festa',
      eventName: 'Festa',
      actorFirstName: 'Administração',
      actionUrl: '/profile/wallet/ticket-transfers/transfer-1',
    });

    expect(copy).toEqual({
      title: 'Transferência cancelada: Ingresso da festa',
      body: 'A administração cancelou a transferência de Ingresso da festa.',
      recipientWorkflow: false,
    });
  });
});
