import { CertificateIssuedTo, CertificateScope } from '@cacic-fct/shared-data-types';
import {
  SportsEligibilityStatus,
  SportsMatchState,
  SportsOfficialRole,
  SportsParticipantStatus,
  SportsPaymentStatus,
  SportsRegistrationStatus,
  SportsReviewStatus,
  SportsRosterEntryStatus,
  SportsRosterRole,
  SportsRosterStatus,
  SportsTeamMemberStatus,
  SportsTeamStatus,
} from '@prisma/client';
import { CertificateEligibilityService } from './certificate-eligibility.service';
import { CertificateSportsEligibility } from './certificate-sports-eligibility';

describe('CertificateSportsEligibility', () => {
  const person = {
    id: 'person-1',
    name: 'Ada Lovelace',
    email: null,
    secondaryEmails: [],
    phone: null,
    identityDocument: null,
    academicId: null,
    userId: null,
    mergedIntoId: null,
    externalRef: null,
    deletedAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    createdById: null,
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedById: null,
  };

  const matchEvent = {
    id: 'event-1',
    name: 'Final de futsal',
    creditMinutes: 60,
    startDate: new Date('2026-01-02T10:00:00.000Z'),
    endDate: new Date('2026-01-02T11:00:00.000Z'),
    type: 'OTHER',
    emoji: '⚽',
    description: null,
    shortDescription: null,
    latitude: null,
    longitude: null,
    locationDescription: null,
    majorEventId: 'major-event-1',
    majorEvent: null,
    eventGroupId: 'event-group-1',
    eventGroup: null,
    allowSubscription: false,
    subscriptionStartDate: null,
    subscriptionEndDate: null,
    slots: null,
    autoSubscribe: false,
    shouldIssueCertificate: true,
    shouldIssueCertificateForNonPayingAttendees: false,
    shouldIssueCertificateForNonSubscribedAttendees: false,
    shouldCollectAttendance: true,
    shouldAllowOralAttendance: false,
    isOnlineAttendanceAllowed: false,
    shouldProvideSubscriberListToLecturer: false,
    onlineAttendanceCode: null,
    onlineAttendanceStartDate: null,
    onlineAttendanceEndDate: null,
    publiclyVisible: true,
    displayLecturerProfile: false,
    publicationState: 'PUBLISHED',
    scheduledPublishAt: null,
    publishedAt: null,
    unpublishedAt: null,
    youtubeCode: null,
    buttonText: null,
    buttonLink: null,
    deletedAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    createdById: null,
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedById: null,
  };

  it('resolves players only through effective paid participation and approved eligible assignments', async () => {
    const registrationMemberFindMany = jest.fn().mockResolvedValue([
      {
        categoryId: 'category-1',
        registration: {
          id: 'registration-1',
          teamId: 'team-1',
          categoryId: 'category-1',
        },
        teamMember: {
          teamId: 'team-1',
          participant: {
            personId: person.id,
            person,
          },
        },
      },
    ]);
    const service = new CertificateSportsEligibility({
      sportsTournament: {
        findFirst: jest.fn().mockResolvedValue({ id: 'tournament-1' }),
      },
      sportsRegistrationMember: {
        findMany: registrationMemberFindMany,
      },
      sportsMatchRosterEntry: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    } as never);

    await expect(
      service.resolve({
        scope: CertificateScope.MAJOR_EVENT,
        majorEventId: 'major-event-1',
        issuedTo: CertificateIssuedTo.SPORTS_PLAYER,
      } as never),
    ).resolves.toEqual([]);

    expect(registrationMemberFindMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        role: SportsRosterRole.PLAYER,
        eligibility: SportsEligibilityStatus.ELIGIBLE,
        registration: {
          status: {
            in: [SportsRegistrationStatus.APPROVED, SportsRegistrationStatus.ACTIVE],
          },
          deletedAt: null,
          team: {
            status: SportsTeamStatus.ACTIVE,
            deletedAt: null,
          },
        },
        teamMember: {
          status: SportsTeamMemberStatus.APPROVED,
          deletedAt: null,
          participant: {
            status: SportsParticipantStatus.ACTIVE,
            paymentStatus: {
              in: [SportsPaymentStatus.NOT_REQUIRED, SportsPaymentStatus.PAID],
            },
            deletedAt: null,
            person: {
              deletedAt: null,
            },
          },
        },
      }),
      select: expect.any(Object),
    });
  });

  it('requires an approved per-match roster and returns only the finalized backing match event', async () => {
    const registrationMemberFindMany = jest.fn().mockResolvedValue([
      {
        categoryId: 'category-1',
        registration: {
          id: 'registration-1',
          teamId: 'team-1',
          categoryId: 'category-1',
        },
        teamMember: {
          teamId: 'team-1',
          participant: {
            personId: person.id,
            person,
          },
        },
      },
    ]);
    const service = new CertificateSportsEligibility({
      sportsMatch: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'match-1',
          categoryId: 'category-1',
          category: { tournamentId: 'tournament-1' },
        }),
      },
      sportsRegistrationMember: {
        findMany: registrationMemberFindMany,
      },
      sportsMatchRosterEntry: {
        findMany: jest.fn().mockResolvedValue([
          {
            registrationMember: {
              registrationId: 'registration-1',
              categoryId: 'category-1',
              teamMember: {
                participant: {
                  personId: person.id,
                },
              },
            },
            roster: {
              registrationId: 'registration-1',
              match: {
                categoryId: 'category-1',
                event: matchEvent,
              },
            },
          },
        ]),
      },
    } as never);

    await expect(
      service.resolve({
        scope: CertificateScope.EVENT,
        eventId: matchEvent.id,
        issuedTo: CertificateIssuedTo.SPORTS_CAPTAIN,
      } as never),
    ).resolves.toEqual([{ person, events: [matchEvent] }]);

    expect(registrationMemberFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          role: SportsRosterRole.CAPTAIN,
          rosterEntries: {
            some: {
              status: SportsRosterEntryStatus.APPROVED,
              deletedAt: null,
              checkedInAt: { not: null },
              roster: {
                matchId: 'match-1',
                status: SportsRosterStatus.APPROVED,
                deletedAt: null,
              },
            },
          },
        }),
      }),
    );
  });

  it('rejects drifted assignments that link a member and registration from different teams', async () => {
    const rosterEntryFindMany = jest.fn();
    const service = new CertificateSportsEligibility({
      sportsTournament: {
        findFirst: jest.fn().mockResolvedValue({ id: 'tournament-1' }),
      },
      sportsRegistrationMember: {
        findMany: jest.fn().mockResolvedValue([
          {
            categoryId: 'category-1',
            registration: {
              id: 'registration-1',
              teamId: 'team-1',
              categoryId: 'category-1',
            },
            teamMember: {
              teamId: 'different-team',
              participant: {
                personId: person.id,
                person,
              },
            },
          },
        ]),
      },
      sportsMatchRosterEntry: {
        findMany: rosterEntryFindMany,
      },
    } as never);

    await expect(
      service.resolve({
        scope: CertificateScope.MAJOR_EVENT,
        majorEventId: 'major-event-1',
        issuedTo: CertificateIssuedTo.SPORTS_PLAYER,
      } as never),
    ).resolves.toEqual([]);
    expect(rosterEntryFindMany).not.toHaveBeenCalled();
  });

  it('resolves active category officials and includes their finalized covered matches', async () => {
    const officialAssignmentFindMany = jest.fn().mockResolvedValue([
      {
        personId: person.id,
        person,
        categoryId: 'category-1',
        matchId: null,
        assignedAt: new Date('2026-01-01T00:00:00.000Z'),
        revokedAt: null,
      },
    ]);
    const service = new CertificateSportsEligibility({
      sportsCategory: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'category-1',
          tournamentId: 'tournament-1',
        }),
      },
      sportsOfficialAssignment: {
        findMany: officialAssignmentFindMany,
      },
      sportsMatch: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'match-1',
            categoryId: 'category-1',
            event: matchEvent,
          },
        ]),
      },
    } as never);

    await expect(
      service.resolve({
        scope: CertificateScope.EVENT_GROUP,
        eventGroupId: 'event-group-1',
        issuedTo: CertificateIssuedTo.SPORTS_REFEREE,
      } as never),
    ).resolves.toEqual([{ person, events: [matchEvent] }]);

    expect(officialAssignmentFindMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        tournamentId: 'tournament-1',
        role: SportsOfficialRole.REFEREE,
        person: {
          deletedAt: null,
        },
      }),
      select: expect.any(Object),
    });
  });

  it('requires a canonical finalized and reviewed match before resolving match certificates', async () => {
    const matchFindFirst = jest.fn().mockResolvedValue(null);
    const service = new CertificateSportsEligibility({
      sportsMatch: {
        findFirst: matchFindFirst,
      },
    } as never);

    await expect(
      service.resolve({
        scope: CertificateScope.EVENT,
        eventId: matchEvent.id,
        issuedTo: CertificateIssuedTo.SPORTS_SCOREKEEPER,
      } as never),
    ).rejects.toThrow('is not backed by a finalized sports match');

    expect(matchFindFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        canonicalState: SportsMatchState.FINISHED,
        reviewStatus: {
          in: [SportsReviewStatus.NOT_REQUIRED, SportsReviewStatus.APPROVED],
        },
      }),
      select: expect.any(Object),
    });
  });

  it('keeps sports organizers on the manual recipient path without bulk enumeration', async () => {
    const peopleFindFirst = jest.fn().mockResolvedValue(person);
    const service = new CertificateEligibilityService({
      people: {
        findFirst: peopleFindFirst,
      },
      event: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    } as never);
    const config = {
      scope: CertificateScope.MAJOR_EVENT,
      majorEventId: 'major-event-1',
      issuedTo: CertificateIssuedTo.SPORTS_ORGANIZER,
    };

    await expect(service.resolveEligibleRecipients(config as never)).resolves.toEqual([]);
    await expect(service.resolveEligibleRecipients(config as never, person.id)).resolves.toEqual([
      {
        person,
        events: [],
      },
    ]);
    expect(peopleFindFirst).toHaveBeenCalledTimes(1);
  });
});
