import { HttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of, throwError } from 'rxjs';
import {
  adminFixtureDate,
  adminFixtureDateFromNow,
  createAdminEvent,
  createAdminMajorEvent,
  createAdminPerson,
  createAdminWorkspaceEventSubscription,
  createAdminWorkspaceMajorEventSubscription,
} from '../testing/admin-entity-fixtures';
import { GraphqlHttpService } from './graphql-http.service';
import { SubscriptionApiService } from './subscription-api.service';

describe('SubscriptionApiService', () => {
  let graphqlHttp: { request: ReturnType<typeof vi.fn> };
  let http: { post: ReturnType<typeof vi.fn> };
  let service: SubscriptionApiService;

  beforeEach(() => {
    graphqlHttp = {
      request: vi.fn((query: string) => {
        if (query.includes('MajorEventSportsTournament')) {
          return of({
            adminSportsTournamentList: [{ tournament: { id: 'tournament-1', majorEventId: 'major-1' } }],
          });
        }
        if (query.includes('MajorEventSportsSubscriptions')) {
          return of({
            adminSportsTournamentRead: {
              teams: [teamFixture({ id: 'team-inactive', status: 'INACTIVE' }), teamFixture()],
              participants: [participantFixture()],
            },
            adminSportsPlayerApplicationQueue: [applicationFixture()],
          });
        }
        if (query.includes('ReviewMajorEventSportsApplication')) {
          return of({ reviewSportsPlayerApplication: 'reviewed' });
        }
        if (query.includes('SetSportsParticipantTeam')) {
          return of({ setSportsParticipantTeam: 'assigned' });
        }
        if (query.includes('WorkspaceEventSubscriptions')) {
          return of({ workspaceEventSubscriptions: [eventSubscriptionFixture()] });
        }
        if (query.includes('CreateWorkspaceEventSubscription')) {
          return of({ createWorkspaceEventSubscription: eventSubscriptionFixture({ id: 'event-sub-created' }) });
        }
        if (query.includes('WorkspaceMajorEventSubscriptions')) {
          return of({ workspaceMajorEventSubscriptions: [majorSubscriptionFixture()] });
        }
        if (query.includes('CreateWorkspaceMajorEventSubscription')) {
          return of({
            createWorkspaceMajorEventSubscription: majorSubscriptionFixture({ id: 'major-sub-created' }),
          });
        }
        if (query.includes('UpdateWorkspaceMajorEventSubscription')) {
          return of({
            updateWorkspaceMajorEventSubscription: majorSubscriptionFixture({ id: 'major-sub-updated' }),
          });
        }
        if (query.includes('WorkspaceMajorEventSubscription')) {
          return of({ workspaceMajorEventSubscription: majorSubscriptionFixture({ id: 'major-sub-detail' }) });
        }
        return of({
          updateWorkspaceMajorEventSubscription: majorSubscriptionFixture({ id: 'major-sub-updated' }),
        });
      }),
    };
    http = {
      post: vi.fn(() => of({ body: new Blob(['zip']), headers: responseHeaders('badges.zip') })),
    };

    TestBed.configureTestingModule({
      providers: [
        SubscriptionApiService,
        { provide: GraphqlHttpService, useValue: graphqlHttp },
        { provide: HttpClient, useValue: http },
      ],
    });

    service = TestBed.inject(SubscriptionApiService);
  });

  it('maps the sports workspace lookup and its active-team projection', async () => {
    const result = await firstValueFrom(service.majorEventSportsWorkspace('major-1'));

    expect(result).toEqual({
      tournamentId: 'tournament-1',
      teams: [teamFixture()],
      applications: [applicationFixture()],
      participants: [participantFixture()],
    });
    expect(graphqlHttp.request).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('query MajorEventSportsTournament'),
    );
    expect(graphqlHttp.request).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('query MajorEventSportsSubscriptions'),
      {
        tournamentId: 'tournament-1',
        statuses: [
          'PENDING',
          'APPROVED',
          'CHANGES_REQUESTED',
          'REJECTED',
          'WAITING_PAYMENT',
          'ACTIVE',
          'WITHDRAWN',
        ],
      },
    );
  });

  it('returns null and avoids the second sports request when no tournament matches', async () => {
    graphqlHttp.request.mockImplementationOnce(() => of({ adminSportsTournamentList: [] }));

    await expect(firstValueFrom(service.majorEventSportsWorkspace('major-missing'))).resolves.toBeNull();
    expect(graphqlHttp.request).toHaveBeenCalledTimes(1);
  });

  it('maps sports review, assignment, event subscriptions, and major-event subscriptions', async () => {
    const reviewInput = {
      applicationId: 'application-1',
      decision: 'APPROVED',
      assignedTeamId: 'team-1',
      reviewMessage: 'Tudo certo',
    } as never;
    const assignmentInput = { participantId: 'participant-1', teamId: null };
    const eventInput = { eventId: 'event-1', personId: 'person-1' };
    const majorCreateInput = {
      majorEventId: 'major-1',
      personId: 'person-1',
      subscriptionStatus: 'CONFIRMED',
      amountPaid: 100,
      paymentDate: adminFixtureDateFromNow(-1).slice(0, 10),
      paymentTier: 'EARLY',
      imageLicenseAgreementAccepted: true,
      selectedEventIds: ['event-1'],
    } as never;
    const majorUpdateInput = { subscriptionStatus: 'CANCELLED', selectedEventIds: [] } as never;

    await expect(firstValueFrom(service.reviewSportsApplication(reviewInput))).resolves.toBe('reviewed');
    await expect(firstValueFrom(service.setSportsParticipantTeam(assignmentInput))).resolves.toBe('assigned');
    await expect(firstValueFrom(service.listEventSubscriptions('event-1', { skip: 2, take: 20 }))).resolves.toEqual([
      eventSubscriptionFixture(),
    ]);
    await expect(firstValueFrom(service.createEventSubscription(eventInput))).resolves.toEqual(
      eventSubscriptionFixture({ id: 'event-sub-created' }),
    );
    await expect(
      firstValueFrom(service.listMajorEventSubscriptions('major-1', { query: 'Ada', skip: 1, take: 10 })),
    ).resolves.toEqual([majorSubscriptionFixture()]);
    await expect(firstValueFrom(service.getMajorEventSubscription('major-1', 'major-sub-detail'))).resolves.toEqual(
      majorSubscriptionFixture({ id: 'major-sub-detail' }),
    );
    await expect(firstValueFrom(service.createMajorEventSubscription(majorCreateInput))).resolves.toEqual(
      majorSubscriptionFixture({ id: 'major-sub-created' }),
    );
    await expect(firstValueFrom(service.updateMajorEventSubscription('major-sub-1', majorUpdateInput))).resolves.toEqual(
      majorSubscriptionFixture({ id: 'major-sub-updated' }),
    );

    expect(graphqlHttp.request).toHaveBeenCalledWith(expect.stringContaining('mutation ReviewMajorEventSportsApplication'), {
      input: reviewInput,
    });
    expect(graphqlHttp.request).toHaveBeenCalledWith(expect.stringContaining('mutation SetSportsParticipantTeam'), {
      input: assignmentInput,
    });
    expect(graphqlHttp.request).toHaveBeenCalledWith(expect.stringContaining('query WorkspaceEventSubscriptions'), {
      eventId: 'event-1',
      skip: 2,
      take: 20,
    });
    expect(graphqlHttp.request).toHaveBeenCalledWith(expect.stringContaining('mutation CreateWorkspaceEventSubscription'), {
      input: eventInput,
    });
    expect(graphqlHttp.request).toHaveBeenCalledWith(
      expect.stringContaining('query WorkspaceMajorEventSubscriptions'),
      { majorEventId: 'major-1', query: 'Ada', skip: 1, take: 10 },
    );
    expect(graphqlHttp.request).toHaveBeenCalledWith(expect.stringContaining('query WorkspaceMajorEventSubscription'), {
      majorEventId: 'major-1',
      subscriptionId: 'major-sub-detail',
    });
    expect(graphqlHttp.request).toHaveBeenCalledWith(
      expect.stringContaining('mutation CreateWorkspaceMajorEventSubscription'),
      { input: majorCreateInput },
    );
    expect(graphqlHttp.request).toHaveBeenCalledWith(
      expect.stringContaining('mutation UpdateWorkspaceMajorEventSubscription'),
      { id: 'major-sub-1', input: majorUpdateInput },
    );
  });

  it('downloads both badge archive variants and derives safe filenames', async () => {
    const options = {
      fields: ['fullName', 'identityDocument'],
      identityDocumentMode: 'masked',
      badgeCodes: {
        enabled: true,
        errorCorrectionLevel: '35',
        format: 'svg',
        fileName: 'id',
      },
    };
    const eventBlob = new Blob(['event']);
    const majorBlob = new Blob(['major']);
    http.post
      .mockReturnValueOnce(of({ body: eventBlob, headers: responseHeaders("filename*=UTF-8''event%20badges.zip") }))
      .mockReturnValueOnce(of({ body: majorBlob, headers: responseHeaders('filename="major\\badges.zip"') }));

    await expect(
      firstValueFrom(service.downloadEventSubscriptionBadgeArchive('event / 1', options as never)),
    ).resolves.toEqual({
      blob: eventBlob,
      fileName: 'event badges.zip',
    });
    await expect(
      firstValueFrom(service.downloadMajorEventSubscriptionBadgeArchive('major / 1', options as never)),
    ).resolves.toEqual({ blob: majorBlob, fileName: 'majorbadges.zip' });

    expect(http.post).toHaveBeenNthCalledWith(
      1,
      '/api/subscription-exports/events/event%20%2F%201/badges.zip',
      {
        fields: options.fields,
        identityDocumentMode: options.identityDocumentMode,
        errorCorrectionLevel: options.badgeCodes.errorCorrectionLevel,
        format: options.badgeCodes.format,
        fileName: options.badgeCodes.fileName,
      },
      { observe: 'response', responseType: 'blob' },
    );
    expect(http.post).toHaveBeenNthCalledWith(
      2,
      '/api/subscription-exports/major-events/major%20%2F%201/badges.zip',
      expect.any(Object),
      { observe: 'response', responseType: 'blob' },
    );
  });

  it('reports a missing badge archive body', async () => {
    http.post.mockReturnValueOnce(of({ body: null, headers: responseHeaders(null) }));
    const options = {
      fields: [],
      identityDocumentMode: 'masked',
      badgeCodes: {
        enabled: false,
        errorCorrectionLevel: '35',
        format: 'svg',
        fileName: 'id',
      },
    };

    await expect(
      firstValueFrom(service.downloadEventSubscriptionBadgeArchive('event-1', options as never)),
    ).rejects.toThrow('O arquivo de códigos não foi retornado pelo servidor.');
  });

  it('propagates GraphQL errors from subscription operations', async () => {
    const error = new Error('subscription query failed');
    graphqlHttp.request.mockReturnValueOnce(throwError(() => error));

    await expect(firstValueFrom(service.listEventSubscriptions('event-1'))).rejects.toBe(error);
  });
});

function responseHeaders(contentDisposition: string | null) {
  return { get: vi.fn((name: string) => (name.toLowerCase() === 'content-disposition' ? contentDisposition : null)) };
}

function teamFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'team-1',
    tournamentId: 'tournament-1',
    name: 'Equipe A',
    institution: 'Universidade',
    status: 'ACTIVE',
    logoUrl: null,
    revision: 1,
    fieldRevisionsJson: '{}',
    ...overrides,
  };
}

function participantFixture() {
  return {
    id: 'participant-1',
    person: { id: 'person-1', name: 'Ada Lovelace' },
    source: 'SUBSCRIPTION',
    status: 'ACTIVE',
    paymentStatus: 'PAID',
    teams: [],
  };
}

function applicationFixture() {
  return {
    id: 'application-1',
    tournamentId: 'tournament-1',
    applicant: { personId: 'person-1', name: 'Ada Lovelace' },
    requestedTeam: null,
    categories: [],
    status: 'PENDING',
    participantStatus: null,
    paymentStatus: 'PENDING',
    paymentTier: null,
    imageLicenseAgreementAccepted: false,
    reviewMessage: null,
    createdAt: adminFixtureDate,
  };
}

function eventSubscriptionFixture(overrides: Record<string, unknown> = {}) {
  return createAdminWorkspaceEventSubscription(
    {
      id: 'event-sub-1',
      eventId: 'event-1',
      personId: 'person-1',
      ...overrides,
    },
    createAdminPerson({ id: 'person-1', name: 'Ada Lovelace' }),
    createAdminEvent({ id: 'event-1', name: 'Credenciamento' }),
  );
}

function majorSubscriptionFixture(overrides: Record<string, unknown> = {}) {
  return createAdminWorkspaceMajorEventSubscription(
    {
      id: 'major-sub-1',
      majorEventId: 'major-1',
      personId: 'person-1',
      subscriptionStatus: 'CONFIRMED',
      amountPaid: 100,
      paymentDate: adminFixtureDateFromNow(-1).slice(0, 10),
      paymentTier: 'EARLY',
      imageLicenseAgreementAccepted: true,
      ...overrides,
    },
    createAdminPerson({ id: 'person-1', name: 'Ada Lovelace' }),
    createAdminMajorEvent({ id: 'major-1', name: 'Semana' }),
  );
}
