import { jest } from '@jest/globals';
import { EventInformationProcessor } from './event-information.processor';

describe('subscriber information notification delivery', () => {
  const data = { eventId: 'event', revision: new Date().toISOString() };
  let prisma: { event: { findFirst: jest.Mock }; people: { findMany: jest.Mock } };
  let notifications: { mapPersonToRecipient: jest.Mock; notifyEventSubscriberInformation: jest.Mock };
  let processor: EventInformationProcessor;
  beforeEach(() => {
    prisma = {
      event: {
        findFirst: jest
          .fn()
          .mockResolvedValue({
            id: 'event',
            name: 'Evento',
            subscriberInformation: 'https://example.org/private',
            majorEventId: null,
            autoSubscribe: false,
          }),
      },
      people: { findMany: jest.fn().mockResolvedValue([{ id: 'person', userId: 'user', name: 'Participante' }]) },
    };
    notifications = {
      mapPersonToRecipient: jest.fn().mockReturnValue({ subscriberId: 'user' }),
      notifyEventSubscriberInformation: jest.fn().mockResolvedValue(true),
    };
    processor = new EventInformationProcessor(
      prisma as never,
      notifications as never,
      {
        principalForStoredUser: async () => ({
          personIds: ['person'],
          isUnesp: false,
          verifiedCourseCode: null,
          bypass: false,
        }),
      } as never,
    );
  });

  it('drops jobs superseded by a newer revision, removed content, or an unpublished event', async () => {
    prisma.event.findFirst.mockResolvedValue(null);
    await processor.process({ data } as never);
    expect(prisma.people.findMany).not.toHaveBeenCalled();
    expect(notifications.notifyEventSubscriberInformation).not.toHaveBeenCalled();
  });

  it('rechecks active subscription/audience access before sending and excludes private URLs from the job', async () => {
    await processor.process({ data } as never);
    expect(notifications.notifyEventSubscriberInformation).toHaveBeenCalledWith({
      ...data,
      eventName: 'Evento',
      targetType: 'event',
      targetId: 'event',
      recipient: { subscriberId: 'user' },
    });
    expect(JSON.stringify(notifications.notifyEventSubscriberInformation.mock.calls)).not.toContain('/private');
    expect(prisma.people.findMany.mock.calls[0][0].take).toBe(100);
  });

  it('does not notify someone whose subscription or audience access was revoked', async () => {
    prisma.event.findFirst
      .mockResolvedValueOnce({ name: 'Evento', subscriberInformation: 'Private', majorEventId: null })
      .mockResolvedValue(null);
    await processor.process({ data } as never);
    expect(notifications.notifyEventSubscriberInformation).not.toHaveBeenCalled();
  });

  it('lets the queue retry when the notification provider does not acknowledge delivery', async () => {
    notifications.notifyEventSubscriberInformation.mockResolvedValue(false);
    await expect(processor.process({ data } as never)).rejects.toThrow('not acknowledged');
  });
  it('opens the owning major-event page for a child event', async () => {
    prisma.event.findFirst.mockResolvedValueOnce({
      id: 'event',
      name: 'Atividade',
      subscriberInformation: 'Private',
      majorEventId: 'major-1',
      eventGroupId: 'group-1',
      autoSubscribe: true,
    });
    await processor.process({ data } as never);
    expect(notifications.notifyEventSubscriberInformation).toHaveBeenCalledWith(
      expect.objectContaining({
        targetType: 'major-event',
        targetId: 'major-1',
      }),
    );
  });
});
