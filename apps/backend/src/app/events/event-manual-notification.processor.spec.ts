import { jest } from '@jest/globals';
import type { EventManualNotificationJob } from './event-manual-notification';
import type { NovuNotificationsService } from '../notifications/novu-notifications.service';
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
    notifyEventParticipant: jest
      .fn<NovuNotificationsService['notifyEventParticipant']>()
      .mockResolvedValue('acknowledged'),
    mapPersonToRecipient: jest.fn(() => ({ subscriberId: 'user' })),
  };
  const audit = { record: jest.fn() };
  const audiences = { principalForStoredUser: jest.fn().mockResolvedValue({}) };
  const job = {
    updateData: jest.fn(async (data: EventManualNotificationJob) => {
      job.data = data;
    }),
    id: 'manual-request',
    attemptsMade: 0,
    data: {
      audience,
      eventId: 'event',
      requestId: 'manual-request',
      message: 'Mensagem',
      personIds: ['person'],
      actor: { id: 'admin', type: 'USER', name: 'Organização' },
    } as EventManualNotificationJob,
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
    notifications.notifyEventParticipant.mockResolvedValueOnce('unknown');
    await expect(processor.process(job as never)).rejects.toThrow('Novu');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: expect.objectContaining({ status: 'FAILED', attempt: 1 }) }),
    );
    await processor.process({ ...job, attemptsMade: 1 } as never);
    expect(notifications.notifyEventParticipant.mock.calls.map(([input]) => input.requestId)).toEqual([job.id, job.id]);
    expect(job.updateData).not.toHaveBeenCalled();
  });

  it('persists a new key generation only after a confirmed failure, including across job retries', async () => {
    const { processor, job, notifications } = setup();
    notifications.notifyEventParticipant.mockResolvedValueOnce('rejected').mockResolvedValueOnce('unknown');
    await expect(processor.process(job as never)).rejects.toThrow('Novu');
    expect(job.updateData).toHaveBeenCalledWith(expect.objectContaining({ deliveryAttempts: { user: 1 } }));
    await expect(processor.process({ ...job, attemptsMade: 1 } as never)).rejects.toThrow('Novu');
    expect(job.updateData).toHaveBeenCalledTimes(1);
    await processor.process({ ...job, attemptsMade: 2 } as never);
    expect(notifications.notifyEventParticipant.mock.calls.map(([input]) => input.deliveryAttempt)).toEqual([0, 1, 1]);
  });

  it('keeps successful recipients on their original key when another recipient is rejected', async () => {
    const { processor, job, notifications } = setup();
    job.data.personIds.push('other');
    notifications.mapPersonToRecipient
      .mockReturnValueOnce({ subscriberId: 'first' })
      .mockReturnValueOnce({ subscriberId: 'second' });
    notifications.notifyEventParticipant.mockResolvedValueOnce('acknowledged').mockResolvedValueOnce('rejected');
    await expect(processor.process(job as never)).rejects.toThrow('Novu');
    expect(job.data.deliveryAttempts).toEqual({ second: 1 });
  });
});
