import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  SportsApplicationStatus,
  SportsEligibilityStatus,
  SportsParticipantSource,
  SportsParticipantStatus,
  SportsTeamMemberStatus,
  SportsTeamStatus,
  SportsTournamentStatus,
} from '@prisma/client';
import { SportsPlayerApplicationService } from './sports-player-application.service';

describe('SportsPlayerApplicationService', () => {
  const actor = {
    sub: 'admin-1',
    token: 'token',
    permissionSet: new Set<string>(),
  } as never;
  const applicantActor = {
    sub: 'user-1',
    token: 'token',
    permissionSet: new Set<string>(),
  } as never;
  const prisma = {
    $transaction: jest.fn(),
  };
  const payments = {
    ensureParticipant: jest.fn(),
  };
  const auditLog = {
    record: jest.fn(),
  };
  let tx: ReturnType<typeof createTx>;
  let service: SportsPlayerApplicationService;

  beforeEach(() => {
    jest.clearAllMocks();
    tx = createTx();
    prisma.$transaction.mockImplementation((callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx));
    payments.ensureParticipant.mockResolvedValue({
      id: 'participant-1',
      status: SportsParticipantStatus.WAITING_PAYMENT,
    });
    service = new SportsPlayerApplicationService(prisma as never, payments as never, auditLog as never);
  });

  it('requires the lineup notice before storing a self-application', async () => {
    await expect(
      service.submitSelfApplication(
        {
          tournamentId: 'tournament-1',
          requestedTeamId: 'team-1',
          categoryIds: ['category-1'],
          noticeAccepted: false,
        },
        'person-1',
        applicantActor,
      ),
    ).rejects.toThrow(BadRequestException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('always queues a valid self-application without resolving arbitrary people', async () => {
    await service.submitSelfApplication(
      {
        tournamentId: 'tournament-1',
        requestedTeamId: 'team-1',
        categoryIds: ['category-1', 'category-1', 'category-2'],
        noticeAccepted: true,
      },
      'person-1',
      applicantActor,
    );

    expect(tx.sportsPlayerApplication.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          pendingKey: 'self:tournament-1:person-1:team-1',
        },
        create: expect.objectContaining({
          applicantPersonId: 'person-1',
          requestedTeamId: 'team-1',
          status: SportsApplicationStatus.PENDING,
          noticeAcceptedAt: expect.any(Date),
        }),
      }),
    );
    expect(tx.sportsPlayerApplicationCategory.createMany).toHaveBeenCalledWith({
      data: [
        {
          applicationId: 'application-1',
          categoryId: 'category-1',
        },
        {
          applicationId: 'application-1',
          categoryId: 'category-2',
        },
      ],
    });
    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({
        after: expect.objectContaining({
          status: SportsApplicationStatus.PENDING,
          noticeAccepted: true,
        }),
      }),
      tx,
    );
    expect((tx as Record<string, unknown>)['people']).toBeUndefined();
  });

  it('approves links but keeps paid participation and category eligibility pending', async () => {
    const application = createReviewApplication();
    tx.sportsPlayerApplication.findUnique.mockResolvedValue(application);
    tx.sportsRegistration.findMany.mockResolvedValue([
      { id: 'registration-1', categoryId: 'category-1' },
      { id: 'registration-2', categoryId: 'category-2' },
    ]);

    await service.review('application-1', 'APPROVE', actor);
    tx.sportsPlayerApplication.findUnique.mockResolvedValue({
      ...application,
      status: SportsApplicationStatus.APPROVED,
    });
    await service.reviewByRepresentative('application-1', 'team-1', true, actor);

    expect(payments.ensureParticipant).toHaveBeenCalledWith(tx, {
      tournamentId: 'tournament-1',
      personId: 'person-1',
      source: SportsParticipantSource.SELF_SUBSCRIPTION,
      actorId: 'admin-1',
      approved: true,
    });
    expect(tx.sportsTeamMember.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          teamId: 'team-1',
          participantId: 'participant-1',
          status: SportsTeamMemberStatus.APPROVED,
        }),
      }),
    );
    expect(tx.sportsRegistrationMember.create).toHaveBeenCalledTimes(2);
    expect(tx.sportsRegistrationMember.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          registrationId: 'registration-1',
          eligibility: SportsEligibilityStatus.PENDING,
        }),
      }),
    );
    expect(tx.sportsPlayerApplication.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: SportsApplicationStatus.WAITING_PAYMENT,
        }),
      }),
    );
  });

  it('makes unpaid or already-paid participation effective immediately after approval', async () => {
    const application = createReviewApplication(['category-1']);
    tx.sportsPlayerApplication.findUnique.mockResolvedValue(application);
    tx.sportsRegistration.findMany.mockResolvedValue([{ id: 'registration-1', categoryId: 'category-1' }]);
    payments.ensureParticipant.mockResolvedValue({
      id: 'participant-1',
      status: SportsParticipantStatus.ACTIVE,
    });

    await service.review('application-1', 'APPROVE', actor);
    tx.sportsPlayerApplication.findUnique.mockResolvedValue({
      ...application,
      status: SportsApplicationStatus.APPROVED,
    });
    await service.reviewByRepresentative('application-1', 'team-1', true, actor);

    expect(tx.sportsRegistrationMember.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eligibility: SportsEligibilityStatus.ELIGIBLE,
        }),
      }),
    );
    expect(tx.sportsPlayerApplication.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: SportsApplicationStatus.ACTIVE,
        }),
      }),
    );
  });

  it('blocks approval into a second team when the tournament disallows it', async () => {
    const application = createReviewApplication(['category-1']);
    tx.sportsPlayerApplication.findUnique.mockResolvedValue(application);
    tx.sportsRegistration.findMany.mockResolvedValue([{ id: 'registration-1', categoryId: 'category-1' }]);
    tx.sportsTeamMember.findFirst.mockResolvedValueOnce({ id: 'other-membership' });

    await service.review('application-1', 'APPROVE', actor);
    tx.sportsPlayerApplication.findUnique.mockResolvedValue({
      ...application,
      status: SportsApplicationStatus.APPROVED,
    });

    await expect(service.reviewByRepresentative('application-1', 'team-1', true, actor)).rejects.toThrow(
      ConflictException,
    );

    expect(payments.ensureParticipant).not.toHaveBeenCalled();
    expect(tx.sportsRegistrationMember.create).not.toHaveBeenCalled();
  });

  it('reviews rejections without materializing a participant and allows a future application', async () => {
    tx.sportsPlayerApplication.findUnique.mockResolvedValue(createReviewApplication(['category-1']));

    await service.review('application-1', 'REJECT', actor, 'Equipe completa');

    expect(tx.sportsPlayerApplication.update).toHaveBeenCalledWith({
      where: { id: 'application-1' },
      data: expect.objectContaining({
        status: SportsApplicationStatus.REJECTED,
        pendingKey: null,
        reviewMessage: 'Equipe completa',
      }),
    });
    expect(payments.ensureParticipant).not.toHaveBeenCalled();
  });

  it('treats repeated approval as idempotent', async () => {
    tx.sportsPlayerApplication.findUnique.mockResolvedValue({
      ...createReviewApplication(['category-1']),
      status: SportsApplicationStatus.WAITING_PAYMENT,
    });

    await service.review('application-1', 'APPROVE', actor);

    expect(payments.ensureParticipant).not.toHaveBeenCalled();
    expect(tx.sportsTeamMember.create).not.toHaveBeenCalled();
    expect(tx.sportsPlayerApplication.findUniqueOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'application-1' },
      }),
    );
  });
});

function createTx() {
  return {
    sportsTournament: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'tournament-1',
        majorEventId: 'major-1',
        status: SportsTournamentStatus.REGISTRATION_OPEN,
        selfSubscriptionEnabled: true,
        finishedAt: null,
        majorEvent: {
          isPaymentRequired: false,
          deletedAt: null,
          subscriptionStartDate: null,
          subscriptionEndDate: null,
          majorEventPrices: [],
        },
        teams: [{ id: 'team-1' }],
        categories: [
          {
            id: 'category-1',
            registrationStartDate: null,
            registrationEndDate: null,
          },
          {
            id: 'category-2',
            registrationStartDate: null,
            registrationEndDate: null,
          },
        ],
      }),
    },
    sportsPlayerApplication: {
      findFirst: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({
        id: 'application-1',
        tournamentId: 'tournament-1',
        applicantPersonId: 'person-1',
        requestedTeamId: 'team-1',
        status: SportsApplicationStatus.PENDING,
        noticeAcceptedAt: new Date(),
        pendingKey: 'self:tournament-1:person-1:team-1',
        categoryChoices: [],
      }),
      update: jest.fn().mockImplementation(({ data }) => ({
        id: 'application-1',
        ...data,
      })),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        id: 'application-1',
        status: SportsApplicationStatus.PENDING,
        requestedTeam: {
          id: 'team-1',
          name: 'Equipe A',
          logoObjectKey: null,
        },
        categoryChoices: [],
      }),
    },
    sportsPlayerApplicationCategory: {
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
    sportsRegistration: {
      findMany: jest.fn(),
    },
    sportsTeamMember: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({
        id: 'team-member-1',
        approvedAt: new Date(),
        approvedById: 'admin-1',
      }),
      update: jest.fn(),
    },
    sportsRegistrationMember: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
    },
  };
}

function createReviewApplication(categoryIds = ['category-1', 'category-2']) {
  return {
    id: 'application-1',
    applicantPersonId: 'person-1',
    requestedTeamId: 'team-1',
    status: SportsApplicationStatus.PENDING,
    pendingKey: 'self:tournament-1:person-1',
    deletedAt: null,
    categoryChoices: categoryIds.map((categoryId) => ({ categoryId })),
    tournament: {
      id: 'tournament-1',
      allowPlayerMultipleTeams: false,
      deletedAt: null,
      majorEventId: 'major-1',
    },
    requestedTeam: {
      id: 'team-1',
      name: 'Equipe A',
      tournamentId: 'tournament-1',
      status: SportsTeamStatus.ACTIVE,
      deletedAt: null,
    },
  };
}
