import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { SportsOperationsApiService } from './sports-operations-api.service';

describe('SportsOperationsApiService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
  });

  it('commits the original idempotency key and offline timestamp', async () => {
    const api = TestBed.inject(SportsOperationsApiService);
    const http = TestBed.inject(HttpTestingController);
    const action = {
      clientId: 'device-action-1',
      matchId: 'match-1',
      baseRevision: 4,
      type: 'SCORE_DELTA' as const,
      payloadJson: JSON.stringify({ side: 'HOME', amount: 1 }),
      authoredAt: '2026-08-01T18:04:00.000Z',
      offline: true,
    };

    const result = firstValueFrom(api.commit([action]));
    const request = http.expectOne('/api/graphql');
    expect(request.request.body.variables).toEqual({ input: { actions: [action] } });
    expect(request.request.body.query).toContain('commitSportsMatchActions');
    request.flush({ data: { commitSportsMatchActions: ['action-1'] } });

    await expect(result).resolves.toEqual(['action-1']);
    http.verify();
  });

  it('requests categories scoped to the selected self-subscription team', async () => {
    const api = TestBed.inject(SportsOperationsApiService);
    const http = TestBed.inject(HttpTestingController);
    const result = firstValueFrom(api.tournament('tournament-1', 'team-1'));
    const request = http.expectOne('/api/graphql');

    expect(request.request.body.variables).toEqual({
      tournamentId: 'tournament-1',
      requestedTeamId: 'team-1',
    });
    expect(request.request.body.query).toContain('requestedTeamId: $requestedTeamId');
    request.flush({
      data: {
        currentUserSportsTournamentDetail: {
          imageLicenseAgreementAccepted: false,
          tournament: { categories: [], teams: [], paymentTiers: [] },
        },
      },
    });

    await expect(result).resolves.toEqual(
      expect.objectContaining({ tournament: expect.objectContaining({ categories: [] }) }),
    );
    http.verify();
  });

  it('loads the current user applications used to edit a pending self-subscription', async () => {
    const api = TestBed.inject(SportsOperationsApiService);
    const http = TestBed.inject(HttpTestingController);
    const result = firstValueFrom(api.currentUserApplications('tournament-1'));
    const request = http.expectOne('/api/graphql');

    expect(request.request.body.variables).toEqual({ tournamentId: 'tournament-1' });
    expect(request.request.body.query).toContain('currentUserSportsPlayerApplications');
    request.flush({
      data: {
        currentUserSportsPlayerApplications: [
          {
            id: 'application-1',
            tournamentId: 'tournament-1',
            status: 'PENDING',
            requestedTeam: { id: 'team-1', name: 'Equipe A', institution: null, logoUrl: null },
            categories: [{ id: 'category-1', name: 'Futsal', division: 'Aberto' }],
            paymentTier: 'Estudante',
            imageLicenseAgreementAccepted: true,
            reviewMessage: null,
          },
        ],
      },
    });

    await expect(result).resolves.toEqual([
      expect.objectContaining({ id: 'application-1', status: 'PENDING', paymentTier: 'Estudante' }),
    ]);
    http.verify();
  });

  it('submits identity claims without resolving or querying a person', async () => {
    const api = TestBed.inject(SportsOperationsApiService);
    const http = TestBed.inject(HttpTestingController);
    const input = {
      teamId: 'team-1',
      type: 'ADD_MEMBER',
      baseRevision: 2,
      baseFieldRevisionsJson: '{}',
      deltaJson: '{"role":"PLAYER"}',
      pendingKey: 'pending-1',
      identityClaims: [{ clientKey: 'claim-1', type: 'EMAIL', value: 'atleta@example.com' }],
    };

    const result = firstValueFrom(api.submitTeamChange(input));
    const request = http.expectOne('/api/graphql');
    expect(request.request.body.query).not.toContain('person(');
    expect(request.request.body.variables).toEqual({ input });
    request.flush({ data: { submitSportsTeamChange: 'request-1' } });

    await expect(result).resolves.toBe('request-1');
    http.verify();
  });

  it('loads the authenticated operational snapshot with the public match projection', async () => {
    const api = TestBed.inject(SportsOperationsApiService);
    const http = TestBed.inject(HttpTestingController);

    const result = firstValueFrom(api.match('match-1'));
    const request = http.expectOne('/api/graphql');
    expect(request.request.body.query).toContain('currentUserSportsMatchOperations');
    expect(request.request.body.variables).toEqual({ matchId: 'match-1' });
    request.flush({
      data: {
        currentUserSportsOperationalMatchDetail: {
          id: 'match-1',
          eventId: 'event-1',
          categoryId: 'category-1',
          state: 'CHECK_IN',
          scoreboard: { homeScore: 0, awayScore: 0, periods: [] },
          elapsedBeforePauseMs: 0,
          periodTimers: [],
          overallTimerEnabled: true,
          periodTimerEnabled: true,
          timerPeriodDurationMs: 2_700_000,
          timerPeriodStartOffsetsMs: [0, 2_700_000],
          timerAllowOvertime: true,
          schedule: {
            startDate: '2026-08-01T12:00:00.000Z',
            endDate: '2026-08-01T13:00:00.000Z',
          },
        },
        currentUserSportsMatchOperations: {
          revision: 7,
          homeRegistrationId: 'home-registration',
          awayRegistrationId: 'away-registration',
          rosters: [],
          officials: [],
        },
      },
    });

    await expect(result).resolves.toEqual(
      expect.objectContaining({
        id: 'match-1',
        revision: 7,
        homeRegistrationId: 'home-registration',
      }),
    );
    http.verify();
  });

  it('sends replay metadata when checking in a roster entry', async () => {
    const api = TestBed.inject(SportsOperationsApiService);
    const http = TestBed.inject(HttpTestingController);
    const input = {
      clientId: 'check-in-1',
      matchId: 'match-1',
      rosterEntryId: 'entry-1',
      checkedInAt: '2026-08-01T12:03:00.000Z',
      offline: true,
      collectorPersonId: 'person-collector',
      collectorCredential: 'signed-proof',
    };

    const result = firstValueFrom(api.checkIn(input));
    const request = http.expectOne('/api/graphql');
    expect(request.request.body.variables).toEqual({
      matchId: 'match-1',
      input: {
        clientId: 'check-in-1',
        rosterEntryId: 'entry-1',
        checkedInAt: '2026-08-01T12:03:00.000Z',
        offline: true,
        collectorPersonId: 'person-collector',
        collectorCredential: 'signed-proof',
      },
    });
    request.flush({ data: { checkInSportsRosterEntry: true } });

    await expect(result).resolves.toBe(true);
    http.verify();
  });

  it('sends the official assignment and collector proof when checking in an official', async () => {
    const api = TestBed.inject(SportsOperationsApiService);
    const http = TestBed.inject(HttpTestingController);
    const input = {
      clientId: 'official-check-in-1',
      matchId: 'match-1',
      officialAssignmentId: 'assignment-referee-1',
      checkedInAt: '2026-08-01T12:03:00.000Z',
      offline: true,
      collectorPersonId: 'person-collector',
      collectorCredential: 'signed-proof',
    };

    const result = firstValueFrom(api.checkInOfficial(input));
    const request = http.expectOne('/api/graphql');
    expect(request.request.body.query).toContain('checkInSportsOfficial');
    expect(request.request.body.variables).toEqual({
      matchId: 'match-1',
      input: {
        clientId: input.clientId,
        officialAssignmentId: input.officialAssignmentId,
        checkedInAt: input.checkedInAt,
        offline: input.offline,
        collectorPersonId: input.collectorPersonId,
        collectorCredential: input.collectorCredential,
      },
    });
    request.flush({ data: { checkInSportsOfficial: true } });

    await expect(result).resolves.toBe(true);
    http.verify();
  });

  it('obtains the durable collector proof for a match before offline collection', async () => {
    const api = TestBed.inject(SportsOperationsApiService);
    const http = TestBed.inject(HttpTestingController);

    const result = firstValueFrom(api.createOfflineCollectorCredential('match-1'));
    const request = http.expectOne('/api/graphql');
    expect(request.request.body.query).toContain('createSportsOfflineCollectorCredential');
    expect(request.request.body.variables).toEqual({ matchId: 'match-1' });
    request.flush({
      data: {
        createSportsOfflineCollectorCredential: {
          credential: 'signed-proof',
          collectorPersonId: 'person-collector',
          issuedAt: '2026-08-01T11:00:00.000Z',
        },
      },
    });

    await expect(result).resolves.toEqual({
      credential: 'signed-proof',
      collectorPersonId: 'person-collector',
      issuedAt: '2026-08-01T11:00:00.000Z',
    });
    http.verify();
  });

  it('sends collector proof with an offline scanner replay', async () => {
    const api = TestBed.inject(SportsOperationsApiService);
    const http = TestBed.inject(HttpTestingController);

    const result = firstValueFrom(
      api.checkInFromScanner({
        clientId: 'scanner-1',
        matchId: 'match-1',
        code: 'opaque-scanner-code',
        checkedInAt: '2026-08-01T12:04:00.000Z',
        offline: true,
        collectorPersonId: 'person-collector',
        collectorCredential: 'signed-proof',
      }),
    );
    const request = http.expectOne('/api/graphql');
    expect(request.request.body.variables).toEqual({
      matchId: 'match-1',
      input: {
        clientId: 'scanner-1',
        code: 'opaque-scanner-code',
        checkedInAt: '2026-08-01T12:04:00.000Z',
        offline: true,
        collectorPersonId: 'person-collector',
        collectorCredential: 'signed-proof',
      },
    });
    request.flush({ data: { checkInSportsMatchFromScannerCode: true } });

    await expect(result).resolves.toBe(true);
    http.verify();
  });
});
