import type { GraphQLResolveInfo } from 'graphql';
import { ANONYMOUS_AUDIENCE, audienceContext } from '../audiences/audience-context';
import { EventGroupsResolver } from './resolver';
const { jest } = import.meta;

const queryInfo = { operation: { operation: 'query' } } as GraphQLResolveInfo;
const mutationInfo = { operation: { operation: 'mutation' } } as GraphQLResolveInfo;

function setup() {
  const prisma = {
    sportsCategory: {
      findMany: jest.fn().mockResolvedValue([{ eventGroupId: 'sports' }]),
      findFirst: jest.fn().mockResolvedValue({ id: 'category' }),
    },
  };
  const resolver = new EventGroupsResolver(prisma as never, {} as never, {} as never, {} as never);
  return { prisma, resolver };
}

describe('request sports category membership', () => {
  it('batches groups, deduplicates aliases, and exposes only booleans', async () => {
    const { prisma, resolver } = setup();
    const context = {};
    await expect(
      Promise.all([
        resolver.isSportsCategory({ id: 'sports' }, context, queryInfo),
        resolver.isSportsCategory({ id: 'regular' }, context, queryInfo),
        resolver.isSportsCategory({ id: 'sports' }, context, queryInfo),
      ]),
    ).resolves.toEqual([true, false, true]);
    await expect(resolver.isSportsCategory({ id: 'sports' }, context, queryInfo)).resolves.toBe(true);
    expect(prisma.sportsCategory.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.sportsCategory.findMany).toHaveBeenCalledWith({
      where: { eventGroupId: { in: ['sports', 'regular'] }, deletedAt: null },
      select: { eventGroupId: true },
    });
    expect(prisma.sportsCategory.findFirst).not.toHaveBeenCalled();
  });

  it('rejects every waiting load and retries failures', async () => {
    const { prisma, resolver } = setup();
    const context = {};
    const error = new Error('database unavailable');
    prisma.sportsCategory.findMany.mockRejectedValueOnce(error);
    const results = await Promise.allSettled([
      resolver.isSportsCategory({ id: 'sports' }, context, queryInfo),
      resolver.isSportsCategory({ id: 'regular' }, context, queryInfo),
    ]);
    expect(results).toEqual([
      { status: 'rejected', reason: error },
      { status: 'rejected', reason: error },
    ]);
    await expect(resolver.isSportsCategory({ id: 'sports' }, context, queryInfo)).resolves.toBe(true);
    expect(prisma.sportsCategory.findMany).toHaveBeenCalledTimes(2);
  });

  it('isolates requests and audience principal values and captures each batch context', async () => {
    const { prisma, resolver } = setup();
    const observed: unknown[] = [];
    prisma.sportsCategory.findMany.mockImplementation(async () => {
      observed.push(audienceContext.getStore());
      return [{ eventGroupId: 'sports' }];
    });
    const context = {};
    const principals = [
      { ...ANONYMOUS_AUDIENCE, personIds: ['person'], userId: 'user' },
      { ...ANONYMOUS_AUDIENCE, personIds: ['other'], userId: 'user' },
      { ...ANONYMOUS_AUDIENCE, personIds: ['person'], userId: 'other' },
      { ...ANONYMOUS_AUDIENCE, personIds: ['person'], userId: 'user', isUnesp: true },
      { ...ANONYMOUS_AUDIENCE, personIds: ['person'], userId: 'user', verifiedCourseCode: '12' },
      { ...ANONYMOUS_AUDIENCE, personIds: ['person'], userId: 'user', bypass: true },
      { ...ANONYMOUS_AUDIENCE, personIds: ['person'], userId: 'user', pastParticipationBefore: new Date() },
    ];
    await Promise.all(
      principals.map((principal) =>
        audienceContext.run(principal, () => resolver.isSportsCategory({ id: 'sports' }, context, queryInfo)),
      ),
    );
    expect(observed).toEqual(principals);
    await resolver.isSportsCategory({ id: 'sports' }, {}, queryInfo);
    expect(prisma.sportsCategory.findMany).toHaveBeenCalledTimes(8);
  });

  it('retains uncached direct and mutation reads', async () => {
    const { prisma, resolver } = setup();
    const context = {};
    await resolver.isSportsCategory({ id: 'sports' });
    await resolver.isSportsCategory({ id: 'sports' }, context);
    await resolver.isSportsCategory({ id: 'sports' }, context, mutationInfo);
    prisma.sportsCategory.findFirst.mockResolvedValueOnce(null);
    await expect(resolver.isSportsCategory({ id: 'sports' }, context, mutationInfo)).resolves.toBe(false);
    expect(prisma.sportsCategory.findFirst).toHaveBeenCalledTimes(4);
    expect(prisma.sportsCategory.findMany).not.toHaveBeenCalled();
  });
});
