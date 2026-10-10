import { ANONYMOUS_AUDIENCE, audienceContext } from '../audiences/audience-context';
import { CurrentUserParticipationEventsResolver } from './participation-events.resolver';

describe('current-user participation detail events', () => {
  it('uses the authenticated person and a bounded historical query without changing the public catalog', async () => {
    const prisma = { event: { findMany: jest.fn().mockResolvedValue([{ id: 'attended-event' }]) } };
    const users = { requireCurrentPerson: jest.fn().mockResolvedValue({ id: 'person-1' }) };
    const resolver = new CurrentUserParticipationEventsResolver(prisma as never, users as never);
    await expect(audienceContext.run({ ...ANONYMOUS_AUDIENCE, userId: 'user-1', personIds: ['person-1'] }, async () =>
      resolver.currentUserParticipationEvents({} as never, 'major-1'),
    )).resolves.toEqual([{ id: 'attended-event' }]);
    const query = prisma.event.findMany.mock.calls[0][0];
    expect(query.where).toEqual(expect.objectContaining({ majorEventId: 'major-1', deletedAt: null }));
    expect(query.where.OR[1]).toEqual(expect.objectContaining({
      endDate: { lte: expect.any(Date) },
      OR: expect.arrayContaining([{ attendances: { some: { personId: { in: ['person-1'] }, status: 'PRESENT' } } }]),
    }));
    expect(query.take).toBe(1000);
    expect(audienceContext.getStore()).toBeUndefined();
  });

  it('requires a group or major-event scope before looking up people or events', async () => {
    const users = { requireCurrentPerson: jest.fn() };
    const resolver = new CurrentUserParticipationEventsResolver({} as never, users as never);
    await expect(resolver.currentUserParticipationEvents({} as never)).rejects.toThrow('Choose a group or major event');
    expect(users.requireCurrentPerson).not.toHaveBeenCalled();
  });
});
