import { jest } from '@jest/globals';
import { EventManualNotificationProcessor } from './event-manual-notification.processor';

function setup(audience: 'LECTURERS' | 'SUBSCRIBERS' = 'LECTURERS') {
  const event = { name: 'Evento', majorEventId: 'major', eventGroupId: null };
  const prisma = {
    event: { findFirst: jest.fn().mockResolvedValue(event) },
    people: {
      findFirst: jest
        .fn()
        .mockResolvedValue({ id: 'person', userId: 'user', name: 'Pessoa', email: 'person@example.org' }),
    },
  };
  const notifications = {
    notifyEventParticipant: jest.fn().mockResolvedValue(true),
    mapPersonToRecipient: jest.fn(() => ({ subscriberId: 'user' })),
  };
  const audit = { record: jest.fn() };
  const audiences = { principalForStoredUser: jest.fn().mockResolvedValue({}) };
  const job = {
    id: 'manual-request',
    attemptsMade: 0,
    data: {
      audience,
      eventId: 'event',
      requestId: 'manual-request',
      message: 'Mensagem',
      personIds: ['person'],
      actor: { id: 'admin', type: 'USER', name: 'Organização' },
    },
  };
  const processor = new EventManualNotificationProcessor(
    prisma as never,
    notifications as never,
    audit as never,
    audiences as never,
  );
  return { processor, prisma, notifications, audit, job, audiences };
}

describe('manual event notification processing', () => {
  it('rechecks membership and audits Novu acknowledgement without claiming delivery', async () => {
    const { processor, job, prisma, notifications, audit } = setup();
    await processor.process(job as never);
    expect(prisma.people.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ lectures: { some: { eventId: 'event' } } }) }),
    );
    expect(notifications.notifyEventParticipant).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: job.id, actionUrl: '/profile/attendances/major-event/major/organizer' }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          status: 'ACKNOWLEDGED',
          personId: 'person',
          requestId: job.id,
          attempt: 1,
        }),
        force: true,
      }),
    );
  });

  it('skips a removed lecturer and never substitutes new members', async () => {
    const { processor, job, prisma, notifications, audit } = setup();
    prisma.people.findFirst.mockResolvedValueOnce(null);
    await processor.process(job as never);
    expect(notifications.notifyEventParticipant).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: expect.objectContaining({ status: 'SKIPPED', personId: 'person' }) }),
    );
  });

  it('checks current subscription and audience visibility before sending to subscribers', async () => {
    const { processor, job, prisma, notifications, audit, audiences } = setup('SUBSCRIBERS');
    prisma.event.findFirst.mockResolvedValueOnce({ name: 'Evento' }).mockResolvedValueOnce(null);
    await processor.process(job as never);
    expect(audiences.principalForStoredUser).toHaveBeenCalledWith('user');
    expect(notifications.notifyEventParticipant).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: expect.objectContaining({ status: 'SKIPPED', audience: 'SUBSCRIBERS' }) }),
    );
  });

  it('logs failures before retrying and keeps the same Novu request identifier', async () => {
    const { processor, job, notifications, audit } = setup();
    notifications.notifyEventParticipant.mockResolvedValueOnce(false);
    await expect(processor.process(job as never)).rejects.toThrow('Novu');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: expect.objectContaining({ status: 'FAILED', attempt: 1 }) }),
    );
    await processor.process({ ...job, attemptsMade: 1 } as never);
    expect(notifications.notifyEventParticipant.mock.calls.map(([input]) => input.requestId)).toEqual([job.id, job.id]);
  });
});
