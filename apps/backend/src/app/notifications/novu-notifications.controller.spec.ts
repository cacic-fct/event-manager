import { ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { NovuNotificationsController } from './novu-notifications.controller';

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
  };

  let currentUserContext: { resolveCurrentUserContext: jest.Mock };
  let notifications: { mapPersonToRecipient: jest.Mock; mapAuthenticatedUserToRecipient: jest.Mock; createSubscriberSession: jest.Mock };
  let controller: NovuNotificationsController;

  beforeEach(() => {
    currentUserContext = {
      resolveCurrentUserContext: jest.fn().mockResolvedValue({ person }),
    };
    notifications = {
      mapPersonToRecipient: jest.fn().mockReturnValue(recipient),
      mapAuthenticatedUserToRecipient: jest.fn().mockReturnValue(recipient),
      createSubscriberSession: jest.fn().mockReturnValue(session),
    };
    controller = new NovuNotificationsController(currentUserContext as never, notifications as never);
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
});
