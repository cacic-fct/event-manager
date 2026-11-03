import { Permission } from '@cacic-fct/shared-permissions';
import { jest } from '@jest/globals';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { EventManualNotificationResolver } from './event-manual-notification.resolver';

const requestId = '12345678-1234-1234-1234-123456789abc';
function setup() {
  const prisma = {
    event: {
      findFirst: jest
        .fn()
        .mockResolvedValue({ name: 'Evento', publicationState: 'PUBLISHED', majorEventId: null, autoSubscribe: false }),
    },
    people: { findMany: jest.fn().mockResolvedValue([{ id: 'person' }]) },
  };
  const authorization = { assertPermissions: jest.fn() };
  const queue = { getJob: jest.fn().mockResolvedValue(null), add: jest.fn() };
  const audit = { record: jest.fn() };
  const resolver = new EventManualNotificationResolver(
    prisma as never,
    {
      getAuthenticatedUser: () => ({ sub: 'admin', token: 'NEVER-LOG-THIS', preferredUsername: 'Organização' }),
    } as never,
    authorization as never,
    { assertEventUpdateMutable: jest.fn() } as never,
    audit as never,
    queue as never,
  );
  return { resolver, prisma, authorization, queue, audit };
}

describe('manual event notifications', () => {
  it('checks scoped event update permission before resolving recipients', async () => {
    const { resolver, authorization, queue, prisma } = setup();
    authorization.assertPermissions.mockRejectedValue(new ForbiddenException());
    await expect(resolver.notifyEventParticipants('event', 'LECTURERS', 'Message', requestId, {})).rejects.toThrow(
      ForbiddenException,
    );
    expect(prisma.people.findMany).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it.each(['LECTURERS', 'SUBSCRIBERS'])(
    'records the actor, audience, message, and recipients before queueing %s',
    async (audience) => {
      const { resolver, audit, queue } = setup();
      await expect(
        resolver.notifyEventParticipants('event', audience, ' Atualização do Evento ', requestId, {}),
      ).resolves.toBe(true);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          force: true,
          squashWindowMs: 0,
          scope: { eventId: 'event', permission: Permission.Event.Update },
          metadata: expect.objectContaining({
            audience,
            message: 'Atualização do Evento',
            personIds: ['person'],
            requestId,
            status: 'REQUESTED',
          }),
        }),
      );
      expect(audit.record.mock.invocationCallOrder[0]).toBeLessThan(queue.add.mock.invocationCallOrder[0]);
      expect(JSON.stringify(queue.add.mock.calls)).not.toContain('NEVER-LOG-THIS');
      expect(queue.add).toHaveBeenCalledWith(
        'notify',
        expect.objectContaining({ audience, eventId: 'event', personIds: ['person'] }),
        expect.objectContaining({ jobId: `manual-${requestId}`, attempts: 5 }),
      );
    },
  );

  it('does not send if the request cannot be audited, and logs queue failures', async () => {
    const { resolver, audit, queue } = setup();
    audit.record.mockRejectedValueOnce(new Error('Audit unavailable'));
    await expect(resolver.notifyEventParticipants('event', 'LECTURERS', 'Message', requestId, {})).rejects.toThrow(
      'Audit unavailable',
    );
    expect(queue.add).not.toHaveBeenCalled();
    queue.add.mockRejectedValueOnce(new Error('Queue unavailable'));
    await expect(resolver.notifyEventParticipants('event', 'LECTURERS', 'Message', requestId, {})).rejects.toThrow(
      'Queue unavailable',
    );
    expect(audit.record).toHaveBeenLastCalledWith(
      expect.objectContaining({ metadata: expect.objectContaining({ status: 'QUEUE_FAILED' }) }),
    );
  });

  it('deduplicates retries and prevents reusing an identifier for a different message or audience', async () => {
    const { resolver, queue } = setup();
    queue.getJob.mockResolvedValue({
      data: { audience: 'LECTURERS', eventId: 'event', message: 'Message', actor: { id: 'admin' } },
      getState: async () => 'completed',
    });
    await expect(resolver.notifyEventParticipants('event', 'LECTURERS', 'Message', requestId, {})).resolves.toBe(true);
    expect(queue.add).not.toHaveBeenCalled();
    await expect(resolver.notifyEventParticipants('event', 'SUBSCRIBERS', 'Message', requestId, {})).rejects.toThrow(
      ConflictException,
    );
  });

  it('blocks blank or oversized notices and subscriber notices for unpublished events', async () => {
    const { resolver, prisma, queue } = setup();
    await expect(resolver.notifyEventParticipants('event', 'LECTURERS', '  ', requestId, {})).rejects.toThrow(
      BadRequestException,
    );
    await expect(
      resolver.notifyEventParticipants('event', 'LECTURERS', 'x'.repeat(2001), requestId, {}),
    ).rejects.toThrow(BadRequestException);
    prisma.event.findFirst.mockResolvedValueOnce({ name: 'Draft', publicationState: 'DRAFT' });
    await expect(resolver.notifyEventParticipants('event', 'SUBSCRIBERS', 'Message', requestId, {})).rejects.toThrow(
      'Publique',
    );
    expect(queue.add).not.toHaveBeenCalled();
  });
});
