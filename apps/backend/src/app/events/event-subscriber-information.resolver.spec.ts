import { eventSubscriberWhere } from './event-subscriber-information';
import { jest } from '@jest/globals';
import { ForbiddenException } from '@nestjs/common';
import { EventSubscriberInformationResolver } from './event-subscriber-information.resolver';

describe('subscriber information publication', () => {
  const revision = new Date();
  const user = { sub: 'admin' };
  const previous = {
    name: 'Evento',
    publicationState: 'PUBLISHED',
    subscriberInformation: 'Link anterior',
    subscriberInformationUpdatedAt: revision,
  };
  let resolver: EventSubscriberInformationResolver;
  let tx: { $executeRaw: jest.Mock; event: { findFirst: jest.Mock; update: jest.Mock } };
  let prisma: { $transaction: jest.Mock; event: { findFirst: jest.Mock } };
  let authorization: { assertPermissions: jest.Mock };
  let queue: { add: jest.Mock; getJob: jest.Mock };
  let audit: { record: jest.Mock };

  beforeEach(() => {
    tx = {
      $executeRaw: jest.fn(),
      event: {
        findFirst: jest.fn().mockResolvedValue(previous),
        update: jest.fn().mockImplementation(({ data }) => ({ ...previous, ...data })),
      },
    };
    prisma = { $transaction: jest.fn(async (callback) => callback(tx)), event: { findFirst: jest.fn() } };
    authorization = { assertPermissions: jest.fn() };
    queue = { add: jest.fn(), getJob: jest.fn().mockResolvedValue(undefined) };
    audit = { record: jest.fn() };
    resolver = new EventSubscriberInformationResolver(
      prisma as never,
      {
        getAuthenticatedUser: () => user,
        requireCurrentPerson: async () => ({ id: 'person' }),
      } as never,
      authorization as never,
      { assertEventUpdateMutable: jest.fn() } as never,
      audit as never,
      queue as never,
    );
  });

  it('requires scoped event read/update access before reading or changing private content', async () => {
    authorization.assertPermissions.mockRejectedValue(new ForbiddenException());
    await expect(resolver.eventSubscriberInformation('event', {})).rejects.toThrow(ForbiddenException);
    await expect(
      resolver.updateEventSubscriberInformation('event', 'https://example.org/private', true, {}),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.event.findFirst).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('saves Markdown and audits it without sending notifications by default', async () => {
    const content = '[Acessar reunião](https://example.org/private)';
    await expect(resolver.updateEventSubscriberInformation('event', content, false, {})).resolves.toEqual({
      content,
      updatedAt: expect.any(Date),
    });
    expect(audit.record).toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('enqueues an explicitly requested notice after commit and uses a stable revision on retry', async () => {
    await resolver.updateEventSubscriberInformation('event', previous.subscriberInformation, true, {});
    const first = queue.add.mock.calls[0];
    await resolver.updateEventSubscriberInformation('event', previous.subscriberInformation, true, {});
    expect(queue.add.mock.calls[1]).toEqual(first);
    expect(tx.event.update).not.toHaveBeenCalled();
    expect(first[1]).toEqual({ eventId: 'event', revision: revision.toISOString() });
    expect(JSON.stringify(first)).not.toContain(previous.subscriberInformation);
  });

  it('never sends a notice for cleared information or a rolled back save', async () => {
    await resolver.updateEventSubscriberInformation('event', null, true, {});
    expect(queue.add).not.toHaveBeenCalled();
    tx.event.update.mockRejectedValue(new Error('Rollback'));
    await expect(resolver.updateEventSubscriberInformation('event', 'New link', true, {})).rejects.toThrow('Rollback');
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('retries an exhausted job once on an explicit request after the cooldown without resetting its attempt counter', async () => {
    const retry = jest.fn();
    const job = {
      getState: jest.fn().mockResolvedValue('failed'),
      finishedOn: Date.now() - 6 * 60_000,
      retry,
    };
    queue.getJob.mockResolvedValue(job);

    await resolver.updateEventSubscriberInformation('event', previous.subscriberInformation, true, {});

    expect(retry).toHaveBeenCalledTimes(1);
    expect(retry).toHaveBeenCalledWith('failed');
    expect(queue.add).not.toHaveBeenCalled();
  });

  it.each([Date.now(), undefined])(
    'rejects retrying a failed job without an elapsed cooldown (%s)',
    async (finishedOn) => {
      const retry = jest.fn();
      queue.getJob.mockResolvedValue({ getState: async () => 'failed', finishedOn, retry });

      await expect(
        resolver.updateEventSubscriberInformation('event', previous.subscriberInformation, true, {}),
      ).rejects.toThrow('Aguarde cinco minutos');

      expect(retry).not.toHaveBeenCalled();
      expect(queue.add).not.toHaveBeenCalled();
    },
  );

  it.each(['waiting', 'active', 'delayed', 'completed'])('leaves an existing %s job alone', async (state) => {
    const retry = jest.fn();
    queue.getJob.mockResolvedValue({ getState: async () => state, retry });

    await resolver.updateEventSubscriberInformation('event', previous.subscriberInformation, true, {});

    expect(retry).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('does not retry delivery when merely saving unchanged content', async () => {
    await resolver.updateEventSubscriberInformation('event', previous.subscriberInformation, false, {});
    expect(queue.getJob).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('reports a concurrent retry instead of scheduling a second job', async () => {
    const retry = jest.fn().mockRejectedValue(new Error('Job is no longer failed'));
    queue.getJob.mockResolvedValue({ getState: async () => 'failed', finishedOn: Date.now() - 6 * 60_000, retry });

    await expect(
      resolver.updateEventSubscriberInformation('event', previous.subscriberInformation, true, {}),
    ).rejects.toThrow('Não foi possível reagendar');

    expect(retry).toHaveBeenCalledTimes(1);
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('rejects oversized content and notification requests for unpublished events', async () => {
    await expect(resolver.updateEventSubscriberInformation('event', 'x'.repeat(10001), false, {})).rejects.toThrow();
    tx.event.findFirst.mockResolvedValue({ ...previous, publicationState: 'DRAFT' });
    await expect(resolver.updateEventSubscriberInformation('event', 'Private link', true, {})).rejects.toThrow(
      'Publique o evento',
    );
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('returns no subscriber content when the current person has no eligible subscription', async () => {
    prisma.event.findFirst.mockResolvedValue(null);
    await expect(resolver.currentUserEventSubscriberInformation('event', {})).resolves.toBeNull();
    const query = prisma.event.findFirst.mock.calls[0][0];
    expect(query.where.id).toBe('event');
    expect(JSON.stringify(query.where)).toContain('person');
    const policy = eventSubscriberWhere('person', revision);
    expect(JSON.stringify(policy)).toContain('"deletedAt":null');
    expect(JSON.stringify(policy)).toContain('majorEventSelections');
    expect(JSON.stringify(policy)).toContain(revision.toISOString());
    expect(JSON.stringify(policy)).not.toContain('CANCELED');
  });
});
