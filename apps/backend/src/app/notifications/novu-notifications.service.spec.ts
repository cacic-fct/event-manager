import { ConfigService } from '@nestjs/config';
import { SubscriptionStatus } from '@prisma/client';
import { createHmac } from 'node:crypto';
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
        if (key === 'NOVU_SECURE_MODE_ENABLED') {
          return 'true';
        }
        if (key === 'NOVU_APPLICATION_IDENTIFIER') {
          return 'app-1';
        }
        if (key === 'NOVU_API_URL') {
          return 'https://novu.example.com/';
        }
        if (key === 'NOVU_CLIENT_API_URL') {
          return 'https://novu-browser.example.com/api/';
        }
        if (key === 'NOVU_CLIENT_SOCKET_URL') {
          return 'https://novu-browser.example.com/';
        }
        if (key === 'NOVU_CLIENT_SOCKET_PATH') {
          return '/socket.io';
        }
        if (key === 'NOVU_PUSH_INTEGRATION_IDENTIFIER') {
          return 'firebase-cloud-messaging';
        }
        if (key === 'NOVU_VAPID_PUBLIC_KEY') {
          return 'vapid-public-key';
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

  it('creates signed subscriber sessions for the browser SDK', () => {
    const session = service.createSubscriberSession({
      subscriberId: 'user-1',
      email: 'ada@example.com',
    });

    expect(session).toEqual({
      applicationIdentifier: 'app-1',
      subscriberId: 'user-1',
      subscriberHash: createHmac('sha256', 'secret').update('user-1').digest('hex'),
      apiUrl: 'https://novu-browser.example.com/api',
      socketUrl: 'https://novu-browser.example.com',
      socketPath: '/socket.io',
      pushIntegrationIdentifier: 'firebase-cloud-messaging',
      vapidPublicKey: 'vapid-public-key',
    });
  });

  it('does not create subscriber sessions when Novu secure signing is unavailable', () => {
    config.get.mockImplementation((key: string, fallback?: string) =>
      key === 'NOVU_SECRET_KEY' ? undefined : fallback,
    );

    expect(service.createSubscriberSession({ subscriberId: 'user-1' })).toBeNull();

    config.get.mockImplementation((key: string, fallback?: string) => {
      if (key === 'NOVU_SECURE_MODE_ENABLED') {
        return 'true';
      }
      if (key === 'NOVU_SECRET_KEY') {
        return 'secret';
      }
      return fallback;
    });

    expect(service.createSubscriberSession({ subscriberId: 'user-1' })).toBeNull();

    config.get.mockImplementation((key: string, fallback?: string) => {
      if (key === 'NOVU_SECRET_KEY') {
        return 'secret';
      }
      if (key === 'NOVU_APPLICATION_IDENTIFIER') {
        return 'app-1';
      }
      return fallback;
    });

    expect(service.createSubscriberSession({ subscriberId: 'user-1' })).toBeNull();
  });

  it('maps authenticated users to fallback notification recipients', () => {
    expect(
      service.mapAuthenticatedUserToRecipient({
        sub: 'user-1',
        preferredUsername: 'ada',
        email: 'ada@example.com',
        claims: {
          given_name: 'Ada',
          family_name: 'Lovelace',
        },
      } as never),
    ).toEqual({
      subscriberId: 'user-1',
      email: 'ada@example.com',
      firstName: 'Ada',
      lastName: 'Lovelace',
      data: {
        preferredUsername: 'ada',
      },
    });
  });

  it('does not notify when Novu is disabled or the status is unchanged', async () => {
    config.get.mockImplementation((key: string, fallback?: string) =>
      key === 'NOVU_SECRET_KEY' ? undefined : fallback,
    );
    await service.notifyMajorEventSubscriptionStatusChanged(notificationFixture());

    config.get.mockImplementation((key: string, fallback?: string) => {
      if (key === 'NOVU_SECRET_KEY') {
        return 'secret';
      }
      if (key === 'NOVU_SECURE_MODE_ENABLED') {
        return 'true';
      }
      if (key === 'NOVU_API_URL') {
        return 'https://novu.example.com';
      }
      return fallback;
    });
    await service.notifyMajorEventSubscriptionStatusChanged(
      notificationFixture({ previousStatus: SubscriptionStatus.CONFIRMED, nextStatus: SubscriptionStatus.CONFIRMED }),
    );

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not notify unless Novu secure mode is explicitly enabled', async () => {
    config.get.mockImplementation((key: string, fallback?: string) => {
      if (key === 'NOVU_SECRET_KEY') {
        return 'secret';
      }
      if (key === 'NOVU_API_URL') {
        return 'https://novu.example.com';
      }
      return fallback;
    });

    await service.notifyMajorEventSubscriptionStatusChanged(notificationFixture());

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
          actionLabel: 'Enviar comprovante',
          actionUrl: '/major-event/major-event-1/payment',
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

  it('sends offline attendance review notifications to Novu once per submission transaction', async () => {
    await service.notifyOfflineAttendanceReviewQueued({
      submissionId: 'submission-1',
      eventId: 'event-1',
      eventName: 'Aula aberta',
      submittedById: 'collector-user',
      submittedAt: new Date('2026-05-23T15:30:00.000Z'),
      authorName: 'Offline Collector',
      recipients: [
        {
          subscriberId: 'admin-user',
          email: 'admin@example.com',
        },
        {
          subscriberId: 'reviewer-user',
          email: 'reviewer@example.com',
        },
      ],
    });

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
        name: 'offline-attendance-review-queued',
        transactionId: 'offline-attendance-review:submission-1',
        to: [
          {
            subscriberId: 'admin-user',
            email: 'admin@example.com',
          },
          {
            subscriberId: 'reviewer-user',
            email: 'reviewer@example.com',
          },
        ],
        payload: expect.objectContaining({
          title: 'Presença off-line para revisar',
          eventId: 'event-1',
          eventName: 'Aula aberta',
          submissionId: 'submission-1',
          submittedById: 'collector-user',
          submittedAt: '2026-05-23T15:30:00.000Z',
          authorName: 'Offline Collector',
          actionLabel: 'Revisar presença',
          actionUrl: '/admin/attendances/event/event-1?offlineReview=pending',
        }),
      }),
    );
    expect(body.overrides.webPush.data).toEqual(
      expect.objectContaining({
        url: '/admin/attendances/event/event-1?offlineReview=pending',
        eventId: 'event-1',
        submissionId: 'submission-1',
      }),
    );
  });

  it('sends certificate availability notifications with an idempotent issue transaction', async () => {
    await expect(
      service.notifyCertificateAvailable({
        certificateId: 'certificate-1',
        configId: 'config-1',
        certificateName: 'Certificado de participacao',
        targetName: 'Semana da Computacao',
        issuedAt: new Date('2026-05-23T15:30:00.000Z'),
        recipient: {
          subscriberId: 'user-1',
          email: 'ada@example.com',
        },
      }),
    ).resolves.toBe(true);

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
        name: 'certificate-available',
        transactionId: 'certificate-available:config-1:certificate-1:2026-05-23T15:30:00.000Z',
        to: {
          subscriberId: 'user-1',
          email: 'ada@example.com',
        },
        payload: expect.objectContaining({
          title: 'Certificado disponível',
          body: 'Seu certificado de Semana da Computacao está disponível.',
          certificateId: 'certificate-1',
          configId: 'config-1',
          certificateName: 'Certificado de participacao',
          targetName: 'Semana da Computacao',
          issuedAt: '2026-05-23T15:30:00.000Z',
          actionLabel: 'Ver certificado',
          actionUrl: '/validate/certificate-1',
        }),
      }),
    );
    expect(body.overrides.webPush.data).toEqual(
      expect.objectContaining({
        url: '/validate/certificate-1',
        certificateId: 'certificate-1',
        configId: 'config-1',
        subscriberId: 'user-1',
      }),
    );
  });

  it.each([
    {
      nextStatus: SubscriptionStatus.WAITING_RECEIPT_UPLOAD,
      statusLabel: 'Aguardando comprovante',
      isPositive: false,
      isNegative: false,
      actionLabel: 'Enviar comprovante',
      actionUrl: '/major-event/major-event-1/payment',
    },
    {
      nextStatus: SubscriptionStatus.RECEIPT_UNDER_REVIEW,
      statusLabel: 'Comprovante em análise',
      isPositive: false,
      isNegative: false,
      actionLabel: 'Ver comprovante',
      actionUrl: '/major-event/major-event-1/payment',
    },
    {
      nextStatus: SubscriptionStatus.CONFIRMED,
      statusLabel: 'Confirmada',
      isPositive: true,
      isNegative: false,
      actionLabel: 'Ver inscrição',
      actionUrl: '/profile/attendances/major-event/major-event-1',
    },
    {
      nextStatus: SubscriptionStatus.CANCELED,
      statusLabel: 'Cancelada',
      isPositive: false,
      isNegative: true,
      actionLabel: 'Ver inscrição',
      actionUrl: '/profile/attendances/major-event/major-event-1',
    },
    {
      nextStatus: SubscriptionStatus.REJECTED_INVALID_RECEIPT,
      statusLabel: 'Comprovante recusado',
      isPositive: false,
      isNegative: true,
      actionLabel: 'Enviar comprovante',
      actionUrl: '/major-event/major-event-1/payment',
    },
    {
      nextStatus: SubscriptionStatus.REJECTED_NO_SLOTS,
      statusLabel: 'Sem vagas',
      isPositive: false,
      isNegative: true,
      actionLabel: 'Revisar inscrição',
      actionUrl: '/major-event/major-event-1/subscription',
    },
    {
      nextStatus: SubscriptionStatus.REJECTED_SCHEDULE_CONFLICT,
      statusLabel: 'Conflito de horário',
      isPositive: false,
      isNegative: true,
      actionLabel: 'Revisar inscrição',
      actionUrl: '/major-event/major-event-1/subscription',
    },
    {
      nextStatus: SubscriptionStatus.REJECTED_GENERIC,
      statusLabel: 'Inscrição recusada',
      isPositive: false,
      isNegative: true,
      actionLabel: 'Ver inscrição',
      actionUrl: '/profile/attendances/major-event/major-event-1',
    },
  ])('sends the expected status metadata for $nextStatus', async (testCase) => {
    const { nextStatus, statusLabel, isPositive, isNegative, actionLabel, actionUrl } = testCase;
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
        actionLabel,
        actionUrl,
      }),
    );
    expect(body.payload.body).toContain('Semana da Computacao');
  });

  it('logs and returns when Novu responds with an HTTP error', async () => {
    const warnSpy = jest.spyOn(service['logger'], 'warn').mockImplementation();
    const text = jest.fn().mockResolvedValue('server exploded');
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text,
    });

    await expect(service.notifyMajorEventSubscriptionStatusChanged(notificationFixture())).resolves.toBeUndefined();

    expect(text).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith('Novu trigger failed with HTTP 500.');
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

  it('notifies recipients when an event form becomes available', async () => {
    await service.notifyEventFormAvailable({
      formId: 'form-1',
      linkId: 'link-1',
      formName: 'Camiseta',
      targetType: 'MAJOR_EVENT',
      targetId: 'major-event-1',
      targetName: 'Semana da Computacao',
      recipients: [
        {
          subscriberId: 'user-1',
          email: 'ada@example.com',
        },
      ],
    });

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
        name: 'event-form-available',
        transactionId: 'event-form-available:form-1:MAJOR_EVENT:major-event-1:link-1',
        to: [
          {
            subscriberId: 'user-1',
            email: 'ada@example.com',
          },
        ],
        payload: expect.objectContaining({
          title: 'Formulário disponível',
          body: 'O formulário "Camiseta" está disponível para Semana da Computacao.',
          formId: 'form-1',
          formName: 'Camiseta',
          targetType: 'MAJOR_EVENT',
          targetId: 'major-event-1',
          targetName: 'Semana da Computacao',
          actionLabel: 'Responder formulário',
          actionUrl: '/profile/forms/form-1?targetType=MAJOR_EVENT&targetId=major-event-1&linkId=link-1',
        }),
      }),
    );
    expect(body.overrides.webPush.data).toEqual(
      expect.objectContaining({
        url: '/profile/forms/form-1?targetType=MAJOR_EVENT&targetId=major-event-1&linkId=link-1',
        formId: 'form-1',
        targetType: 'MAJOR_EVENT',
        targetId: 'major-event-1',
      }),
    );
  });

  it('notifies subscribers when online attendance starts with a direct attendance link', async () => {
    await expect(
      service.notifyOnlineAttendanceAvailable({
        eventId: 'event-1',
        eventName: 'Aula de TypeScript',
        endsAt: new Date('2026-05-23T15:30:00.000Z'),
        recipients: [{ subscriberId: 'user-1', email: 'ada@example.com' }],
      }),
    ).resolves.toBe(true);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toEqual(
      expect.objectContaining({
        name: 'online-attendance-available',
        transactionId: 'online-attendance-available:event-1:2026-05-23T15:30:00.000Z',
        payload: expect.objectContaining({
          title: 'Presença disponível',
          body: 'Você pode registrar sua presença em Aula de TypeScript até 12:30.',
          actionUrl: '/attendance/register/event-1?fromNotification=true',
        }),
      }),
    );
    expect(body.overrides.webPush.data).toEqual({
      url: '/attendance/register/event-1?fromNotification=true',
      eventId: 'event-1',
    });
  });

  it.each([
    ['EVENT', 'event-1', '/app/draws/event/event-1#draw-draw-1'],
    ['MAJOR_EVENT', 'major-1', '/app/draws/major-event/major-1#draw-draw-1'],
  ])(
    'sends prize-draw winner notifications with a scoped public deep link for %s',
    async (targetType, targetId, actionUrl) => {
      await expect(
        service.notifyPrizeDrawWinner({
          ...prizeDrawNotification({ spinDescription: 'Primeiro prêmio' }),
          targetType: targetType as 'EVENT' | 'MAJOR_EVENT',
          targetId,
          recipient: { subscriberId: 'user-1', email: 'ada@example.com' },
        }),
      ).resolves.toBe(true);

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body).toEqual(
        expect.objectContaining({
          name: 'prize-draw-winner',
          transactionId: 'winner-transaction',
          payload: expect.objectContaining({
            title: 'Você ganhou: Kit CACiC',
            body: 'Seu nome foi sorteado em “Primeiro prêmio”.',
            actionUrl,
            redirectUrl: actionUrl,
          }),
        }),
      );
      expect(body.overrides.webPush.data).toEqual({ url: actionUrl, drawId: 'draw-1', spinId: 'spin-1' });
    },
  );

  it('sends undo notices and uses DELETE endpoints to revoke and remove a prior transaction', async () => {
    await expect(
      service.notifyPrizeDrawUndone({
        drawId: 'draw-1',
        spinId: 'spin-1',
        drawTitle: 'Kit CACiC',
        spinDescription: null,
        targetType: 'EVENT',
        targetId: 'event-1',
        recipient: { subscriberId: 'user-1' },
        transactionId: 'undo-transaction',
      }),
    ).resolves.toBe(true);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual(
      expect.objectContaining({
        name: 'prize-draw-undone',
        transactionId: 'undo-transaction',
        payload: expect.objectContaining({ title: 'Sorteio desfeito: Kit CACiC' }),
      }),
    );

    fetchMock.mockResolvedValue({ ok: true, status: 204 });
    await expect(service.cancelTriggeredNotification('winner / transaction')).resolves.toBe(true);
    await expect(service.deleteNotificationMessages('winner / transaction')).resolves.toBe(true);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://novu.example.com/v1/events/trigger/winner%20%2F%20transaction',
      expect.objectContaining({ method: 'DELETE' }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'https://novu.example.com/v1/messages/transaction/winner%20%2F%20transaction',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('contains Novu rejection, HTTP, and network failures instead of breaking the prize-draw transaction', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValue({ acknowledged: false, status: 'rejected', error: ['invalid recipient'] }),
    });
    await expect(service.notifyPrizeDrawWinner(prizeDrawNotification())).resolves.toBe(false);

    fetchMock.mockResolvedValueOnce({ ok: false, status: 503 });
    await expect(service.notifyPrizeDrawWinner(prizeDrawNotification())).resolves.toBe(false);

    fetchMock.mockRejectedValueOnce(new Error('network unavailable'));
    await expect(service.notifyPrizeDrawWinner(prizeDrawNotification())).resolves.toBe(false);

    fetchMock.mockResolvedValueOnce({ ok: false, status: 500 });
    await expect(service.cancelTriggeredNotification('winner-transaction')).resolves.toBe(false);
    fetchMock.mockResolvedValueOnce({ ok: false, status: 404 });
    await expect(service.deleteNotificationMessages('winner-transaction')).resolves.toBe(true);
  });

  it('treats prize-draw notifications as disabled when secure Novu configuration is absent', async () => {
    config.get.mockImplementation((key: string, fallback?: string) =>
      key === 'NOVU_SECURE_MODE_ENABLED' ? 'false' : fallback,
    );

    await expect(service.notifyPrizeDrawWinner(prizeDrawNotification())).resolves.toBe(false);
    await expect(service.notifyPrizeDrawUndone(prizeDrawNotification())).resolves.toBe(false);
    await expect(service.cancelTriggeredNotification('winner-transaction')).resolves.toBe(true);
    await expect(service.deleteNotificationMessages('winner-transaction')).resolves.toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

function prizeDrawNotification(
  overrides: Partial<Parameters<NovuNotificationsService['notifyPrizeDrawWinner']>[0]> = {},
) {
  return {
    drawId: 'draw-1',
    spinId: 'spin-1',
    drawTitle: 'Kit CACiC',
    spinDescription: null,
    targetType: 'EVENT' as const,
    targetId: 'event-1',
    recipient: { subscriberId: 'user-1' },
    transactionId: 'winner-transaction',
    ...overrides,
  };
}

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
