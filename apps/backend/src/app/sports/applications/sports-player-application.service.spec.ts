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
        imageLicenseAgreementAccepted: true,
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
          imageLicenseAgreementAccepted: true,
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

  it('uses the tournament registration window override instead of the parent event window', async () => {
    const now = Date.now();
    tx.sportsTournament.findFirst.mockResolvedValueOnce({
      id: 'tournament-1',
      majorEventId: 'major-1',
      status: SportsTournamentStatus.REGISTRATION_OPEN,
      registrationStartDate: new Date(now - 60_000),
      registrationEndDate: new Date(now + 60_000),
      selfSubscriptionEnabled: true,
      selfSubscriptionAllowNoTeam: false,
      selfSubscriptionAllowNoCategory: false,
      allowPlayerMultipleTeams: false,
      finishedAt: null,
      majorEvent: {
        isPaymentRequired: false,
        requiresImageLicenseAgreement: false,
        deletedAt: null,
        subscriptionStartDate: new Date(now + 3_600_000),
        subscriptionEndDate: new Date(now + 7_200_000),
        majorEventPrices: [],
      },
      teams: [{ id: 'team-1' }],
      categories: [{ id: 'category-1', registrationStartDate: null, registrationEndDate: null }],
    });

    await service.submitSelfApplication(
      {
        tournamentId: 'tournament-1',
        requestedTeamId: 'team-1',
        categoryIds: ['category-1'],
        noticeAccepted: true,
      },
      'person-1',
      applicantActor,
    );

    expect(tx.sportsPlayerApplication.upsert).toHaveBeenCalled();
  });

  it('updates an existing pending self-application instead of creating a second request', async () => {
    tx.sportsPlayerApplication.upsert.mockResolvedValueOnce({
      id: 'application-1',
      tournamentId: 'tournament-1',
      applicantPersonId: 'person-1',
      requestedTeamId: 'team-1',
      status: SportsApplicationStatus.PENDING,
      noticeAcceptedAt: new Date(),
      imageLicenseAgreementAccepted: false,
      pendingKey: 'self:tournament-1:person-1:team-1',
      paymentTier: null,
      categoryChoices: [{ categoryId: 'category-1' }],
    });

    await service.submitSelfApplication(
      {
        tournamentId: 'tournament-1',
        requestedTeamId: 'team-1',
        categoryIds: ['category-1', 'category-2'],
        noticeAccepted: true,
      },
      'person-1',
      applicantActor,
    );

    expect(tx.sportsPlayerApplication.update).toHaveBeenCalledWith({
      where: { id: 'application-1' },
      data: expect.objectContaining({
        status: SportsApplicationStatus.PENDING,
        requestedTeamId: 'team-1',
      }),
    });
    expect(tx.sportsPlayerApplicationCategory.deleteMany).toHaveBeenCalledWith({
      where: { applicationId: 'application-1' },
    });
    expect(tx.sportsPlayerApplicationCategory.createMany).toHaveBeenCalledWith({
      data: [
        { applicationId: 'application-1', categoryId: 'category-1' },
        { applicationId: 'application-1', categoryId: 'category-2' },
      ],
    });
  });

  it('keeps editing the same pending application when its requested team changes', async () => {
    tx.sportsTournament.findFirst.mockResolvedValueOnce({
      id: 'tournament-1',
      majorEventId: 'major-1',
      status: SportsTournamentStatus.REGISTRATION_OPEN,
      selfSubscriptionEnabled: true,
      selfSubscriptionAllowNoTeam: true,
      selfSubscriptionAllowNoCategory: false,
      allowPlayerMultipleTeams: false,
      finishedAt: null,
      majorEvent: {
        isPaymentRequired: false,
        requiresImageLicenseAgreement: false,
        deletedAt: null,
        subscriptionStartDate: null,
        subscriptionEndDate: null,
        majorEventPrices: [],
      },
      teams: [],
      categories: [
        { id: 'category-1', registrationStartDate: null, registrationEndDate: null },
        { id: 'category-2', registrationStartDate: null, registrationEndDate: null },
      ],
    });
    tx.sportsPlayerApplication.findFirst.mockResolvedValueOnce({
      id: 'application-1',
      tournamentId: 'tournament-1',
      applicantPersonId: 'person-1',
      requestedTeamId: 'team-1',
      status: SportsApplicationStatus.PENDING,
      noticeAcceptedAt: new Date(),
      imageLicenseAgreementAccepted: false,
      pendingKey: 'self:tournament-1:person-1:team-1',
      paymentTier: null,
      categoryChoices: [{ categoryId: 'category-1' }],
    });

    await service.submitSelfApplication(
      {
        tournamentId: 'tournament-1',
        applicationId: 'application-1',
        requestedTeamId: null,
        categoryIds: ['category-1', 'category-2'],
        noticeAccepted: true,
      },
      'person-1',
      applicantActor,
    );

    expect(tx.sportsPlayerApplication.upsert).not.toHaveBeenCalled();
    expect(tx.sportsPlayerApplication.update).toHaveBeenCalledWith({
      where: { id: 'application-1' },
      data: expect.objectContaining({
        requestedTeamId: null,
        pendingKey: 'self:tournament-1:person-1:no-team',
        status: SportsApplicationStatus.PENDING,
      }),
    });
  });

  it('rejects a selected category when the requested team is not registered in it', async () => {
    tx.sportsTournament.findFirst.mockResolvedValueOnce({
      id: 'tournament-1',
      majorEventId: 'major-1',
      status: SportsTournamentStatus.REGISTRATION_OPEN,
      selfSubscriptionEnabled: true,
      selfSubscriptionAllowNoTeam: false,
      selfSubscriptionAllowNoCategory: false,
      allowPlayerMultipleTeams: false,
      finishedAt: null,
      majorEvent: {
        isPaymentRequired: false,
        requiresImageLicenseAgreement: false,
        deletedAt: null,
        subscriptionStartDate: null,
        subscriptionEndDate: null,
        majorEventPrices: [],
      },
      teams: [{ id: 'team-1' }],
      categories: [],
    });

    await expect(
      service.submitSelfApplication(
        {
          tournamentId: 'tournament-1',
          requestedTeamId: 'team-1',
          categoryIds: ['category-1'],
          noticeAccepted: true,
        },
        'person-1',
        applicantActor,
      ),
    ).rejects.toThrow('Selecione ao menos uma modalidade disponível para este torneio.');

    expect(tx.sportsPlayerApplication.upsert).not.toHaveBeenCalled();
  });

  it('requires image-license acceptance when the sports major event enables it', async () => {
    tx.sportsTournament.findFirst.mockResolvedValueOnce({
      id: 'tournament-1',
      majorEventId: 'major-1',
      status: SportsTournamentStatus.REGISTRATION_OPEN,
      selfSubscriptionEnabled: true,
      selfSubscriptionAllowNoTeam: false,
      selfSubscriptionAllowNoCategory: false,
      allowPlayerMultipleTeams: false,
      finishedAt: null,
      majorEvent: {
        isPaymentRequired: false,
        requiresImageLicenseAgreement: true,
        deletedAt: null,
        subscriptionStartDate: null,
        subscriptionEndDate: null,
        majorEventPrices: [],
      },
      teams: [{ id: 'team-1' }],
      categories: [{ id: 'category-1', registrationStartDate: null, registrationEndDate: null }],
    });

    await expect(
      service.submitSelfApplication(
        {
          tournamentId: 'tournament-1',
          requestedTeamId: 'team-1',
          categoryIds: ['category-1'],
          noticeAccepted: true,
          imageLicenseAgreementAccepted: false,
        },
        'person-1',
        applicantActor,
      ),
    ).rejects.toThrow(BadRequestException);

    expect(tx.sportsPlayerApplication.upsert).not.toHaveBeenCalled();
  });

  it('materializes an approved team application and keeps paid participation pending', async () => {
    const application = {
      ...createReviewApplication(),
      imageLicenseAgreementAccepted: true,
    };
    tx.sportsPlayerApplication.findUnique.mockResolvedValue(application);
    tx.sportsRegistration.findMany.mockResolvedValue([
      { id: 'registration-1', categoryId: 'category-1' },
      { id: 'registration-2', categoryId: 'category-2' },
    ]);

    await service.review('application-1', 'APPROVE', actor);

    expect(payments.ensureParticipant).toHaveBeenCalledWith(tx, {
      tournamentId: 'tournament-1',
      personId: 'person-1',
      source: SportsParticipantSource.SELF_SUBSCRIPTION,
      actorId: 'admin-1',
      approved: true,
      imageLicenseAgreementAccepted: true,
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

  it('makes unpaid or already-paid participation effective immediately after admin approval', async () => {
    const application = createReviewApplication(['category-1']);
    tx.sportsPlayerApplication.findUnique.mockResolvedValue(application);
    tx.sportsRegistration.findMany.mockResolvedValue([{ id: 'registration-1', categoryId: 'category-1' }]);
    payments.ensureParticipant.mockResolvedValue({
      id: 'participant-1',
      status: SportsParticipantStatus.ACTIVE,
    });

    await service.review('application-1', 'APPROVE', actor);

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

  it('keeps representative approval compatible with legacy staged applications', async () => {
    const application = {
      ...createReviewApplication(['category-1']),
      status: SportsApplicationStatus.APPROVED,
    };
    tx.sportsPlayerApplication.findUnique.mockResolvedValue(application);
    tx.sportsRegistration.findMany.mockResolvedValue([{ id: 'registration-1', categoryId: 'category-1' }]);

    await service.reviewByRepresentative('application-1', 'team-1', true, actor);

    expect(tx.sportsTeamMember.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ teamId: 'team-1', status: SportsTeamMemberStatus.APPROVED }),
      }),
    );
  });

  it('blocks approval into a second team when the tournament disallows it', async () => {
    const application = createReviewApplication(['category-1']);
    tx.sportsPlayerApplication.findUnique.mockResolvedValue(application);
    tx.sportsRegistration.findMany.mockResolvedValue([{ id: 'registration-1', categoryId: 'category-1' }]);
    tx.sportsTeamMember.findFirst.mockResolvedValueOnce({ id: 'other-membership' });

    await expect(service.review('application-1', 'APPROVE', actor)).rejects.toThrow(ConflictException);

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
          requiresImageLicenseAgreement: false,
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
        imageLicenseAgreementAccepted: false,
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
