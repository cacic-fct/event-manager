import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { publicFixtureDateFromNow } from '@cacic-fct/event-manager-public-testing';
import { firstValueFrom } from 'rxjs';
import { createRepresentativeTeamWorkspace, createSportsLineupRead } from './sports-operations.fixtures';
import { SportsMatchAction } from './sports-operations.types';
import { SportsOperationsApiService } from './sports-operations-api.service';

describe('SportsOperationsApiService uncovered operations', () => {
  let api: SportsOperationsApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(SportsOperationsApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads the authenticated autoroute and preserves a null route response', async () => {
    const result = firstValueFrom(api.autoroute());
    const request = http.expectOne('/api/graphql');

    expect(request.request.body.query).toContain('query CurrentUserSportsAutoroute');
    request.flush({ data: { currentUserSportsAutoroute: null } });

    await expect(result).resolves.toBeNull();
  });

  it('loads a lineup scoped by both match and registration', async () => {
    const result = firstValueFrom(api.lineup('match-story', 'registration-home'));
    const request = http.expectOne('/api/graphql');
    const lineup = createSportsLineupRead();

    expect(request.request.body.query).toContain('query CurrentUserSportsLineup');
    expect(request.request.body.variables).toEqual({ matchId: 'match-story', registrationId: 'registration-home' });
    request.flush({ data: { currentUserSportsLineup: lineup } });

    await expect(result).resolves.toEqual(lineup);
  });

  it('loads the representative workspace with queued changes, members, registrations, and matches', async () => {
    const result = firstValueFrom(api.representativeWorkspace('team / 1'));
    const request = http.expectOne('/api/graphql');
    const workspace = createRepresentativeTeamWorkspace();

    expect(request.request.body.query).toContain('query CurrentUserSportsTeamWorkspace');
    expect(request.request.body.variables).toEqual({ teamId: 'team / 1' });
    request.flush({ data: { currentUserSportsTeamWorkspace: workspace } });

    await expect(result).resolves.toEqual(workspace);
  });

  it('uploads a team logo as multipart form data with an encoded request revision', async () => {
    const file = new File(['logo-bytes'], 'team.png', { type: 'image/png' });
    const result = firstValueFrom(api.uploadTeamLogo('team / 1', 8, file, 12));
    const request = http.expectOne('/api/sports/teams/team%20%2F%201/logo-change?expectedRequestRevision=12');

    expect(request.request.method).toBe('POST');
    expect(request.request.body).toBeInstanceOf(FormData);
    expect((request.request.body as FormData).get('file')).toBe(file);
    expect((request.request.body as FormData).get('expectedRevision')).toBe('8');

    const queuedLogo = {
      requestId: 'request-1',
      requestRevision: 12,
      sha256: 'hash',
      mimeType: 'image/png',
      sizeBytes: file.size,
      width: 320,
      height: 180,
    };
    request.flush(queuedLogo);

    await expect(result).resolves.toEqual(queuedLogo);
  });

  it('omits the optional logo request-revision query parameter when absent', async () => {
    const file = new File(['logo-bytes'], 'team.png', { type: 'image/png' });
    const result = firstValueFrom(api.uploadTeamLogo('team-1', 3, file));
    const request = http.expectOne('/api/sports/teams/team-1/logo-change');

    expect(request.request.body).toBeInstanceOf(FormData);
    request.flush({
      requestId: 'request-2',
      requestRevision: 4,
      sha256: 'hash-2',
      mimeType: 'image/png',
      sizeBytes: file.size,
      width: 1,
      height: 1,
    });

    await expect(result).resolves.toEqual(expect.objectContaining({ requestId: 'request-2' }));
  });

  it('submits a player application without changing the caller input', async () => {
    const input = {
      tournamentId: 'tournament-1',
      applicationId: null,
      requestedTeamId: 'team-1',
      categoryIds: ['category-1', 'category-2'],
      noticeAccepted: true,
      imageLicenseAgreementAccepted: false,
      paymentTier: 'STUDENT',
      pendingKey: 'pending-1',
    };
    const before = structuredClone(input);
    const result = firstValueFrom(api.submitApplication(input));
    const request = http.expectOne('/api/graphql');

    expect(request.request.body.query).toContain('mutation SubmitSportsPlayerApplication');
    expect(request.request.body.variables).toEqual({ input });
    request.flush({ data: { submitSportsPlayerApplication: 'application-1' } });

    await expect(result).resolves.toBe('application-1');
    expect(input).toEqual(before);
  });

  it('submits a roster with optional shirt numbers and expected revision', async () => {
    const input = {
      matchId: 'match-1',
      registrationId: 'registration-1',
      expectedRevision: 5,
      entries: [
        { registrationMemberId: 'member-1', role: 'PLAYER', shirtNumber: '10' },
        { registrationMemberId: 'member-2', role: 'GOALKEEPER', shirtNumber: null },
      ],
    };
    const before = structuredClone(input);
    const result = firstValueFrom(api.submitRoster(input));
    const request = http.expectOne('/api/graphql');

    expect(request.request.body.query).toContain('mutation SubmitSportsMatchRoster');
    expect(request.request.body.variables).toEqual({ input });
    request.flush({ data: { submitSportsMatchRoster: 'roster-request-1' } });

    await expect(result).resolves.toBe('roster-request-1');
    expect(input).toEqual(before);
  });

  it('reviews a representative team application with approval and review text', async () => {
    const input = {
      applicationId: 'application-1',
      teamId: 'team-1',
      approved: false,
      reviewMessage: 'Informe o número de matrícula.',
    };
    const result = firstValueFrom(api.reviewTeamApplication(input));
    const request = http.expectOne('/api/graphql');

    expect(request.request.body.query).toContain('mutation ReviewRepresentativeSportsPlayerApplication');
    expect(request.request.body.variables).toEqual({ input });
    request.flush({ data: { reviewRepresentativeSportsPlayerApplication: 'review-request-1' } });

    await expect(result).resolves.toBe('review-request-1');
  });

  it('forfeits a match by wrapping the original action in the commit input envelope', async () => {
    const action: SportsMatchAction = {
      clientId: 'action-1',
      matchId: 'match-1',
      baseRevision: 9,
      type: 'FORFEIT',
      payloadJson: JSON.stringify({ side: 'AWAY', reason: 'NO_SHOW' }),
      authoredAt: publicFixtureDateFromNow(0, 12),
      offline: false,
    };
    const before = structuredClone(action);
    const result = firstValueFrom(api.forfeit(action));
    const request = http.expectOne('/api/graphql');

    expect(request.request.body.query).toContain('mutation ForfeitSportsMatch');
    expect(request.request.body.variables).toEqual({ input: { actions: [action] } });
    request.flush({ data: { forfeitSportsMatch: 'forfeit-request-1' } });

    await expect(result).resolves.toBe('forfeit-request-1');
    expect(action).toEqual(before);
  });

  it('joins sports GraphQL errors and rejects responses without data', async () => {
    const errorResult = firstValueFrom(
      api.submitRoster({ matchId: 'match-1', registrationId: 'registration-1', entries: [] }),
    );
    http.expectOne('/api/graphql').flush({ errors: [{ message: 'Conflito' }, { message: 'Revisão necessária' }] });
    await expect(errorResult).rejects.toThrow('Conflito Revisão necessária');

    const missingResult = firstValueFrom(
      api.reviewTeamApplication({ applicationId: 'application-1', teamId: 'team-1', approved: true }),
    );
    http.expectOne('/api/graphql').flush({});
    await expect(missingResult).rejects.toThrow('A resposta do servidor não trouxe os dados esperados.');
  });
});
