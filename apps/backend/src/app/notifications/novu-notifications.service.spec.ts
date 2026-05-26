import { ConfigService } from '@nestjs/config';
import { SubscriptionStatus } from '@prisma/client';
import { NovuNotificationsService } from './novu-notifications.service';

describe('NovuNotificationsService', () => {
  const originalFetch = global.fetch;
  let fetchMock: jest.Mock;
  let config: { get: jest.Mock };
  let service: NovuNotificationsService;

  beforeEach(() => {
    fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ acknowledged: true, status: 'processed' }),
    });
    global.fetch = fetchMock;
    config = {
      get: jest.fn((key: string, fallback?: string) => {
        if (key === 'NOVU_SECRET_KEY') {
          return 'secret';
        }
        if (key === 'NOVU_API_URL') {
          return 'https://novu.example.com/';
        }
        return fallback;
      }),
    };
    service = new NovuNotificationsService(config as unknown as ConfigService);
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('maps people to notification recipients using user fallback data', () => {
    expect(
      service.mapPersonToRecipient({
        id: 'person-1',
        name: ' Ada Lovelace ',
        email: null,
        phone: '+5518999999999',
        userId: null,
        user: { id: 'user-1', email: 'ada@example.com', name: 'Ada' },
      }),
    ).toEqual({
      subscriberId: 'user-1',
      email: 'ada@example.com',
      phone: '+5518999999999',
      firstName: 'Ada',
      lastName: 'Lovelace',
      data: { personId: 'person-1' },
    });
  });

  it('does not notify when Novu is disabled or the status is unchanged', async () => {
    config.get.mockImplementation((key: string, fallback?: string) => (key === 'NOVU_SECRET_KEY' ? undefined : fallback));
    await service.notifyMajorEventSubscriptionStatusChanged(notificationFixture());

    config.get.mockImplementation((key: string, fallback?: string) =>
      key === 'NOVU_SECRET_KEY' ? 'secret' : key === 'NOVU_API_URL' ? 'https://novu.example.com' : fallback,
    );
    await service.notifyMajorEventSubscriptionStatusChanged(
      notificationFixture({ previousStatus: SubscriptionStatus.CONFIRMED, nextStatus: SubscriptionStatus.CONFIRMED }),
    );

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends subscription status payloads to Novu with labels and action data', async () => {
    await service.notifyMajorEventSubscriptionStatusChanged(
      notificationFixture({
        nextStatus: SubscriptionStatus.REJECTED_INVALID_RECEIPT,
        rejectionReason: 'Documento ilegivel',
      }),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://novu.example.com/v1/events/trigger',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Authorization: 'ApiKey secret',
          'Content-Type': 'application/json',
        },
      }),
    );

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toEqual(
      expect.objectContaining({
        name: 'major-event-subscription-status-changed',
        transactionId: 'major-event-subscription:subscription-1:REJECTED_INVALID_RECEIPT',
        payload: expect.objectContaining({
          title: 'Inscrição em Semana da Computacao',
          statusLabel: 'Comprovante recusado',
          isPositive: false,
          isNegative: true,
          rejectionReason: 'Documento ilegivel',
          actionUrl: '/profile/attendances/major-event/major-event-1',
        }),
      }),
    );
    expect(body.overrides.fcm.data).toEqual(
      expect.objectContaining({
        majorEventId: 'major-event-1',
        subscriptionId: 'subscription-1',
        subscriberId: 'user-1',
      }),
    );
  });

  it.each([
    [SubscriptionStatus.WAITING_RECEIPT_UPLOAD, 'Aguardando comprovante', false, false],
    [SubscriptionStatus.RECEIPT_UNDER_REVIEW, 'Comprovante em análise', false, false],
    [SubscriptionStatus.CONFIRMED, 'Confirmada', true, false],
    [SubscriptionStatus.CANCELED, 'Cancelada', false, true],
    [SubscriptionStatus.REJECTED_NO_SLOTS, 'Sem vagas', false, true],
    [SubscriptionStatus.REJECTED_SCHEDULE_CONFLICT, 'Conflito de horário', false, true],
    [SubscriptionStatus.REJECTED_GENERIC, 'Inscrição recusada', false, true],
  ])('sends the expected status metadata for %s', async (nextStatus, statusLabel, isPositive, isNegative) => {
    await service.notifyMajorEventSubscriptionStatusChanged(
      notificationFixture({
        previousStatus:
          nextStatus === SubscriptionStatus.CONFIRMED
            ? SubscriptionStatus.WAITING_RECEIPT_UPLOAD
            : SubscriptionStatus.CONFIRMED,
        nextStatus,
      }),
    );

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.payload).toEqual(
      expect.objectContaining({
        statusLabel,
        isPositive,
        isNegative,
      }),
    );
    expect(body.payload.body).toContain('Semana da Computacao');
  });

  it('logs and returns when Novu responds with an HTTP error', async () => {
    const warnSpy = jest.spyOn(service['logger'], 'warn').mockImplementation();
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: jest.fn().mockResolvedValue('server exploded'),
    });

    await expect(service.notifyMajorEventSubscriptionStatusChanged(notificationFixture())).resolves.toBeUndefined();

    expect(warnSpy).toHaveBeenCalledWith('Novu trigger failed with HTTP 500: server exploded');
  });

  it('logs unacknowledged Novu responses and thrown fetch errors', async () => {
    const warnSpy = jest.spyOn(service['logger'], 'warn').mockImplementation();
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValue({ acknowledged: false, status: 'failed', error: ['bad payload'] }),
    });

    await service.notifyMajorEventSubscriptionStatusChanged(notificationFixture());

    expect(warnSpy).toHaveBeenCalledWith('Novu trigger was not acknowledged: failed bad payload');

    fetchMock.mockRejectedValueOnce(new Error('network down'));
    await service.notifyMajorEventSubscriptionStatusChanged(notificationFixture());

    expect(warnSpy).toHaveBeenCalledWith('Novu trigger failed: network down');
  });

  it('maps subscription records before notifying', async () => {
    const notifySpy = jest.spyOn(service, 'notifyMajorEventSubscriptionStatusChanged').mockResolvedValue();

    await service.notifyMajorEventSubscriptionRecordChanged(SubscriptionStatus.WAITING_RECEIPT_UPLOAD, {
      id: 'subscription-1',
      majorEventId: 'major-event-1',
      subscriptionStatus: SubscriptionStatus.CONFIRMED,
      receiptRejectionReason: null,
      majorEvent: { name: 'Semana da Computacao' },
      person: {
        id: 'person-1',
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        phone: null,
        userId: 'user-1',
        user: null,
      },
    } as never);

    expect(notifySpy).toHaveBeenCalledWith(
      expect.objectContaining({
        previousStatus: SubscriptionStatus.WAITING_RECEIPT_UPLOAD,
        nextStatus: SubscriptionStatus.CONFIRMED,
        recipient: expect.objectContaining({ subscriberId: 'user-1' }),
      }),
    );
  });
});

function notificationFixture(
  overrides: Partial<Parameters<NovuNotificationsService['notifyMajorEventSubscriptionStatusChanged']>[0]> = {},
) {
  return {
    subscriptionId: 'subscription-1',
    majorEventId: 'major-event-1',
    majorEventName: 'Semana da Computacao',
    previousStatus: SubscriptionStatus.RECEIPT_UNDER_REVIEW,
    nextStatus: SubscriptionStatus.CONFIRMED,
    recipient: {
      subscriberId: 'user-1',
      email: 'ada@example.com',
    },
    rejectionReason: null,
    ...overrides,
  };
}
