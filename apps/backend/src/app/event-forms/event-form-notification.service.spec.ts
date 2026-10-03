import { ANONYMOUS_AUDIENCE, audienceContext } from '../audiences/audience-context';
import { EventFormNotificationService } from './event-form-notification.service';

it.each(['EVENT', 'MAJOR_EVENT'] as const)('filters %s form recipients using their own audience and restores organizer scope', async (targetType) => {
  const people = ['allowed', 'denied'].map((id) => ({ id, name: id, userId: `user-${id}`, email: `${id}@example.com`, phone: null, user: null }));
  const count = jest.fn(async () => audienceContext.getStore()?.personIds.includes('allowed') ? 1 : 0);
  const discovery = jest.fn(async () => {
    expect(audienceContext.getStore()?.bypass).toBe(true);
    return people.map((person) => ({ person }));
  });
  const prisma = {
    event: { findUnique: jest.fn().mockResolvedValue({ majorEventId: null }), count },
    majorEvent: { count },
    eventSubscription: { findMany: discovery },
    majorEventSubscription: { findMany: discovery },
    eventFormResponse: { findMany: jest.fn().mockResolvedValue([]) },
    eventFormLink: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
  };
  const notifications = { mapPersonToRecipient: jest.fn((person) => ({ subscriberId: person.id })), notifyEventFormAvailable: jest.fn().mockResolvedValue(true) };
  const audiences = { principalForStoredUser: jest.fn(async (userId: string) => ({ ...ANONYMOUS_AUDIENCE, userId, personIds: [userId.slice(5)] })) };
  const service = new EventFormNotificationService(prisma as never, notifications as never, { isEnabled: () => true } as never, audiences as never);
  const future = new Date(Date.now() + 86_400_000);
  const organizer = { ...ANONYMOUS_AUDIENCE, personIds: ['organizer'], bypass: true };
  await audienceContext.run(organizer, async () => {
    expect(await service.notifyEligiblePeople({ id: 'form', name: 'Formulário', responseMode: 'ONE_PER_TARGET', links: [{
      id: 'link', targetType, eventId: targetType === 'EVENT' ? 'event' : null, majorEventId: targetType === 'MAJOR_EVENT' ? 'major' : null,
      audiences: ['SUBSCRIBERS'], insertInSubscriptionFlow: true, requiredInSubscriptionFlow: true, notifyOnPublish: true,
      lastNotifiedAt: null, availableFrom: null, availableUntil: null,
      event: targetType === 'EVENT' ? { name: 'Evento', endDate: future } : null,
      majorEvent: targetType === 'MAJOR_EVENT' ? { name: 'Grande evento', endDate: future } : null,
    }] })).toBe(1);
    expect(audienceContext.getStore()).toBe(organizer);
  });
  expect(notifications.notifyEventFormAvailable).toHaveBeenCalledWith(expect.objectContaining({ recipients: [{ subscriberId: 'allowed' }] }));
  expect(notifications.mapPersonToRecipient).toHaveBeenCalledTimes(1);
  expect(count).toHaveBeenCalledTimes(2);
  expect(audiences.principalForStoredUser).toHaveBeenCalledWith('user-denied');
});
