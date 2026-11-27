import { PIPES_METADATA } from '@nestjs/common/constants';
import { REST_VALIDATION_PIPE } from '../common/rest-validation.pipe';
import type { Type } from '@nestjs/common';
import { ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { NovuNotificationsController } from './novu-notifications.controller';
const { jest } = import.meta;

describe('NovuNotificationsController', () => {
  const user = {
    sub: 'user-1',
    email: 'ada@example.com',
  };
  const person = {
    id: 'person-1',
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    userId: 'user-1',
  };
  const recipient = {
    subscriberId: 'user-1',
    email: 'ada@example.com',
  };
  const session = {
    applicationIdentifier: 'app-1',
    subscriberId: 'user-1',
    subscriberHash: 'hash-1',
    vapidPublicKey: 'public-key',
  };

  let currentUserContext: { resolveCurrentUserContext: jest.Mock };
  let notifications: {
    mapPersonToRecipient: jest.Mock;
    mapAuthenticatedUserToRecipient: jest.Mock;
    createSubscriberSession: jest.Mock;
    registerWebPushRecipient: jest.Mock;
  };
  const webPush = { saveSubscription: jest.fn() };
  const subscription = { endpoint: 'https://fcm.googleapis.com/fcm/send/example', p256dh: 'key', auth: 'auth' };
  let controller: NovuNotificationsController;

  beforeEach(() => {
    currentUserContext = {
      resolveCurrentUserContext: jest.fn().mockResolvedValue({ person }),
    };
    notifications = {
      mapPersonToRecipient: jest.fn().mockReturnValue(recipient),
      mapAuthenticatedUserToRecipient: jest.fn().mockReturnValue(recipient),
      createSubscriberSession: jest.fn().mockReturnValue(session),
      registerWebPushRecipient: jest.fn().mockResolvedValue(true),
    };
    controller = new NovuNotificationsController(currentUserContext as never, notifications as never, webPush as never);
    webPush.saveSubscription.mockClear();
  });

  it('validates browser keys and rejects undeclared fields at the REST boundary', async () => {
    const method = NovuNotificationsController.prototype.registerPushSubscription;
    expect(Reflect.getMetadata(PIPES_METADATA, method)).toContain(REST_VALIDATION_PIPE);
    const types = Reflect.getMetadata(
      'design:paramtypes',
      NovuNotificationsController.prototype,
      'registerPushSubscription',
    ) as Type<unknown>[];
    const metadata = { type: 'body' as const, metatype: types[1] };
    const body = {
      subscriberId: 'user-1',
      endpoint: subscription.endpoint,
      p256dh: 'B' + 'a'.repeat(86),
      auth: 'a'.repeat(22),
    };
    await expect(REST_VALIDATION_PIPE.transform(body, metadata)).resolves.toMatchObject(body);
    await expect(REST_VALIDATION_PIPE.transform({ ...body, p256dh: 'invalid' }, metadata)).rejects.toThrow();
    await expect(REST_VALIDATION_PIPE.transform({ ...body, extra: true }, metadata)).rejects.toThrow();
  });

  it('returns a signed session for the resolved current person recipient', async () => {
    await expect(controller.createNovuSession({ user } as never)).resolves.toBe(session);

    expect(currentUserContext.resolveCurrentUserContext).toHaveBeenCalledWith(user, true);
    expect(notifications.mapPersonToRecipient).toHaveBeenCalledWith(person);
    expect(notifications.createSubscriberSession).toHaveBeenCalledWith(recipient);
    expect(notifications.mapAuthenticatedUserToRecipient).not.toHaveBeenCalled();
  });

  it('falls back to authenticated identity when no person context exists', async () => {
    currentUserContext.resolveCurrentUserContext.mockResolvedValueOnce({ person: null });

    await expect(controller.createNovuSession({ user } as never)).resolves.toBe(session);

    expect(notifications.mapAuthenticatedUserToRecipient).toHaveBeenCalledWith(user);
  });

  it('rejects missing users and unavailable Novu configuration', async () => {
    await expect(controller.createNovuSession({} as never)).rejects.toBeInstanceOf(ForbiddenException);

    notifications.createSubscriberSession.mockReturnValueOnce(null);

    await expect(controller.createNovuSession({ user } as never)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('registers only for the resolved subscriber and rejects an account switch', async () => {
    await controller.registerPushSubscription({ user } as never, { ...subscription, subscriberId: 'user-1' });
    expect(notifications.registerWebPushRecipient).toHaveBeenCalledWith(recipient);
    expect(webPush.saveSubscription).toHaveBeenCalledWith('user-1', {
      endpoint: subscription.endpoint,
      keys: { p256dh: subscription.p256dh, auth: subscription.auth },
    });
    notifications.registerWebPushRecipient.mockClear();
    await expect(
      controller.registerPushSubscription({ user } as never, { ...subscription, subscriberId: 'someone-else' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      controller.registerPushSubscription({} as never, { ...subscription, subscriberId: 'user-1' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(notifications.registerWebPushRecipient).not.toHaveBeenCalled();
  });

  it('reports unavailable push registration', async () => {
    notifications.registerWebPushRecipient.mockResolvedValueOnce(false);
    await expect(
      controller.registerPushSubscription({ user } as never, {
        ...subscription,
        subscriberId: 'user-1',
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(webPush.saveSubscription).not.toHaveBeenCalled();
  });
});
