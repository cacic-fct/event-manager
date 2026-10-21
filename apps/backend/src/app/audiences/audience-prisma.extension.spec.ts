import { jest as jestEsm } from '@jest/globals';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { PrismaService } from '../prisma/prisma.service';
const { jest } = import.meta;

type CapturedQuery = { sql: string; args: unknown[] };
const mockQueries: CapturedQuery[] = [];
const mockConnection = {
  provider: 'postgres',
  adapterName: '@prisma/adapter-pg',
  queryRaw: async (query: CapturedQuery) => {
    mockQueries.push(query);
    return { columnNames: [], columnTypes: [], rows: [] };
  },
  executeRaw: async () => 0,
  executeScript: async () => undefined,
  dispose: async () => undefined,
  getConnectionInfo: () => ({ supportsRelationJoins: false }),
  startTransaction: async () => ({
    ...mockConnection,
    options: { usePhantomQuery: false },
    commit: async () => undefined,
    rollback: async () => undefined,
  }),
};

jestEsm.unstable_mockModule('@prisma/adapter-pg', () => ({
  PrismaPg: jest.fn(() => ({
    provider: 'postgres',
    adapterName: '@prisma/adapter-pg',
    connect: async () => mockConnection,
  })),
}));

const { PrismaService: PrismaServiceClass } = await import('../prisma/prisma.service');
const { ANONYMOUS_AUDIENCE, audienceContext } = await import('./audience-context');
const { scopeAudienceQuery } = await import('./audience-prisma.extension');
const generateAudienceRelationsPath = fileURLToPath(
  new URL('../../../../../tools/generate-audience-relations.mjs', import.meta.url),
);
const generateAudienceRelationsTestPath = fileURLToPath(
  new URL('../../../../../tools/generate-audience-relations.test.mjs', import.meta.url),
);

describe('event audience query boundary', () => {
  let prisma: PrismaService;
  beforeEach(() => {
    mockQueries.length = 0;
    prisma = new PrismaServiceClass();
  });
  afterEach(async () => {
    await prisma.$disconnect();
  });

  it('keeps foreign-key ownership and relation cardinalities synchronized with the schema', () => {
    expect(() => execFileSync(process.execPath, [generateAudienceRelationsPath, '--check'])).not.toThrow();
  });

  it('accepts formatted relation metadata while rejecting stale relation data', () => {
    execFileSync(process.execPath, ['--test', generateAudienceRelationsTestPath]);
  });

  it('compiles audience and ancestor predicates before pagination using the real Prisma query compiler', async () => {
    await audienceContext.run(
      ANONYMOUS_AUDIENCE,
      async () =>
        await prisma.event.findMany({
          select: { id: true, majorEvent: { select: { name: true } }, eventGroup: { select: { name: true } } },
          take: 5,
          skip: 10,
        }),
    );
    expect(mockQueries.length).toBeGreaterThan(0);
    expect(mockQueries[0].sql).toContain('"audience"');
    expect(mockQueries[0].sql).toContain('"major_events"');
    expect(mockQueries[0].sql).toContain('"event_groups"');
    expect(mockQueries[0].args).toContain('PUBLIC');
    expect(mockQueries[0].args).not.toContain('UNESP_ONLY');
    expect(mockQueries[0].args).not.toContain('COURSE_ONLY');
    expect(mockQueries[0].sql).toContain('LIMIT');
  });

  it('retains the audience extension inside interactive transactions', async () => {
    await audienceContext.run(
      ANONYMOUS_AUDIENCE,
      async () =>
        await prisma.$transaction(async (tx) => {
          return await tx.eventSubscription.findMany({ select: { id: true } });
        }),
    );
    const select = mockQueries.find((query) => query.sql.includes('SELECT'));
    expect(select?.sql).toContain('"event_audience_invitations"');
    expect(select?.sql).toContain('"major_events"');
  });

  it('preserves unique selectors and protects nested lists and relation counts without mutating reusable selects', () => {
    const input = {
      where: { id: 'major-1' },
      select: { events: { select: { id: true } }, _count: { select: { events: true } } },
    };
    const output = scopeAudienceQuery('MajorEvent', 'findUnique', input, ANONYMOUS_AUDIENCE);
    expect(output['where']).toEqual(expect.objectContaining({ id: 'major-1', AND: expect.any(Array) }));
    expect(output['select']).toEqual(
      expect.objectContaining({
        events: expect.objectContaining({ where: expect.any(Object) }),
        _count: { select: { events: expect.objectContaining({ where: expect.any(Object) }) } },
      }),
    );
    expect(input.select.events).toEqual({ select: { id: true } });
    expect(input.select._count.select.events).toBe(true);
  });

  it('keeps simultaneous principals isolated and only bypasses for the explicitly scoped administrator', async () => {
    await Promise.all([
      audienceContext.run(
        { ...ANONYMOUS_AUDIENCE, verifiedCourseCode: '12' },
        async () => await prisma.event.findMany({ select: { id: true } }),
      ),
      audienceContext.run(
        { ...ANONYMOUS_AUDIENCE, bypass: true },
        async () => await prisma.event.findMany({ select: { id: true } }),
      ),
    ]);
    expect(mockQueries.filter((query) => query.sql.includes('"audienceCourseCodes"'))).toHaveLength(1);
    expect(mockQueries.filter((query) => !query.sql.includes('"audience"'))).toHaveLength(1);
  });
});
