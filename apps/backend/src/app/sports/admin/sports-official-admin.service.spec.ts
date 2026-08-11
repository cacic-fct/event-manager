import { SportsOfficialRole } from '@prisma/client';
import { SportsOfficialAdminService } from './sports-official-admin.service';

describe('SportsOfficialAdminService', () => {
  const actor = {
    sub: 'admin-1',
    token: 'token',
    permissionSet: new Set<string>(),
  } as never;
  const frozen = {
    assertEventMutable: jest.fn().mockResolvedValue(undefined),
    assertEventGroupMutable: jest.fn().mockResolvedValue(undefined),
    assertMajorEventMutable: jest.fn().mockResolvedValue(undefined),
  };
  const auditLog = {
    record: jest.fn().mockResolvedValue(undefined),
  };
  const payments = {};
  let tx: ReturnType<typeof createTransaction>;
  let prisma: ReturnType<typeof createPrisma>;
  let service: SportsOfficialAdminService;

  beforeEach(() => {
    jest.clearAllMocks();
    tx = createTransaction();
    prisma = createPrisma(tx);
    service = new SportsOfficialAdminService(prisma as never, frozen as never, auditLog as never, payments as never);
  });

  it('preserves assignedAt when editing an already-active official', async () => {
    const assignedAt = new Date('2026-08-01T12:00:00.000Z');
    const assignment = assignmentFixture({ assignedAt, active: true });
    prisma.sportsOfficialAssignment.findUnique.mockResolvedValue(assignment);
    tx.sportsOfficialAssignment.updateMany.mockResolvedValue({ count: 1 });
    tx.sportsOfficialAssignment.findUniqueOrThrow.mockResolvedValue({
      ...assignment,
      role: SportsOfficialRole.SCOREKEEPER,
      revision: 4,
    });

    await service.updateOfficial(
      'assignment-1',
      { expectedRevision: 3, role: SportsOfficialRole.SCOREKEEPER },
      actor,
    );

    const update = tx.sportsOfficialAssignment.updateMany.mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
    };
    expect(update.data).toMatchObject({ active: true, role: SportsOfficialRole.SCOREKEEPER });
    expect(update.data).not.toHaveProperty('assignedAt');
    expect(update.data).not.toHaveProperty('revokedAt');
  });

  it('starts a new assignment interval when reactivating an official', async () => {
    const assignment = assignmentFixture({
      active: false,
      assignedAt: new Date('2026-08-01T12:00:00.000Z'),
      revokedAt: new Date('2026-08-02T12:00:00.000Z'),
    });
    prisma.sportsOfficialAssignment.findUnique.mockResolvedValue(assignment);
    tx.sportsOfficialAssignment.updateMany.mockResolvedValue({ count: 1 });
    tx.sportsOfficialAssignment.findUniqueOrThrow.mockResolvedValue({
      ...assignment,
      active: true,
      assignedAt: new Date(),
      revokedAt: null,
      revision: 4,
    });

    await service.updateOfficial('assignment-1', { expectedRevision: 3, active: true }, actor);

    const update = tx.sportsOfficialAssignment.updateMany.mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
    };
    expect(update.data).toMatchObject({
      active: true,
      revokedAt: null,
      revokedById: null,
      assignedAt: expect.any(Date),
    });
  });
});

function createPrisma(tx: ReturnType<typeof createTransaction>) {
  return {
    $transaction: jest.fn((callback: (transaction: ReturnType<typeof createTransaction>) => Promise<unknown>) =>
      callback(tx),
    ),
    sportsOfficialAssignment: {
      findUnique: jest.fn(),
    },
  };
}

function createTransaction() {
  return {
    sportsOfficialAssignment: {
      updateMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
  };
}

function assignmentFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'assignment-1',
    tournamentId: 'tournament-1',
    categoryId: 'category-1',
    matchId: null,
    personId: 'person-1',
    role: SportsOfficialRole.REFEREE,
    active: true,
    assignedAt: new Date('2026-08-01T12:00:00.000Z'),
    revokedAt: null,
    revision: 3,
    tournament: { majorEventId: 'major-1' },
    category: { eventGroupId: 'group-1' },
    match: null,
    ...overrides,
  };
}
