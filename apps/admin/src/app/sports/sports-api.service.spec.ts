import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { FakeEventSource, installFakeEventSource } from '@cacic-fct/shared-angular/testing';
import { firstValueFrom, Observable, of } from 'rxjs';
import { GraphqlHttpService } from '../graphql/graphql-http.service';
import { SportsApiService } from './sports-api.service';
import {
  createAdminSportsCategoryRead,
  createAdminSportsMatchReview,
  createAdminSportsPendingMatchActions,
  createAdminSportsRegistrationRead,
  createAdminSportsTeamRead,
  createAdminSportsTournamentRead,
} from './sports-story.fixtures';

describe('SportsApiService', () => {
  const request = vi.fn();

  beforeEach(() => {
    request.mockReset();
    TestBed.configureTestingModule({
      providers: [
        SportsApiService,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: GraphqlHttpService, useValue: { request } },
      ],
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it.each([
    ['tournaments', [{ id: 'tournament-1' }], { query: 'xadrez', skip: 10, take: 20 }, 'adminSportsTournamentList'],
    ['tournament', createAdminSportsTournamentRead(), 'tournament-1', 'adminSportsTournamentRead'],
    ['category', createAdminSportsCategoryRead(), 'category-1', 'adminSportsCategoryRead'],
    ['team', createAdminSportsTeamRead(), 'team-1', 'adminSportsTeamRead'],
    [
      'registration',
      createAdminSportsRegistrationRead('registration-home'),
      'registration-1',
      'adminSportsRegistrationRead',
    ],
    ['matchReview', createAdminSportsMatchReview(), 'match-1', 'adminSportsMatchReviewRead'],
  ] as const)(
    'maps the %s query response and forwards its variables',
    async (method, result, argument, responseKey) => {
      request.mockReturnValue(of({ [responseKey]: result }));
      const service = TestBed.inject(SportsApiService);
      const invoke = service[method] as (value: never) => Observable<unknown>;

      await expect(firstValueFrom(invoke.call(service, argument as never))).resolves.toEqual(result);
      expect(request).toHaveBeenCalledOnce();
      expect(request.mock.calls[0]?.[0]).toContain(responseKey);
      expect(request.mock.calls[0]?.[1]).toEqual(
        method === 'tournaments' ? argument : { [`${method === 'matchReview' ? 'match' : method}Id`]: argument },
      );
    },
  );

  it('loads pending match actions without a selected match', async () => {
    const result = createAdminSportsPendingMatchActions();
    request.mockReturnValue(of({ adminSportsMatchActionReviewQueue: result }));

    await expect(
      firstValueFrom(TestBed.inject(SportsApiService).matchActionReviewQueue('tournament-1')),
    ).resolves.toEqual(result);
    expect(request.mock.calls[0]?.[0]).toContain('adminSportsMatchActionReviewQueue');
    expect(request.mock.calls[0]?.[1]).toEqual({ tournamentId: 'tournament-1' });
  });

  it('uses the default and explicit application queue statuses', async () => {
    request.mockReturnValue(of({ adminSportsPlayerApplicationQueue: [] }));
    const service = TestBed.inject(SportsApiService);

    await firstValueFrom(service.applicationQueue('tournament-1'));
    await firstValueFrom(service.applicationQueue('tournament-1', ['APPROVED']));

    expect(request.mock.calls[0]?.[1]).toEqual({
      tournamentId: 'tournament-1',
      statuses: ['PENDING', 'CHANGES_REQUESTED'],
    });
    expect(request.mock.calls[1]?.[1]).toEqual({ tournamentId: 'tournament-1', statuses: ['APPROVED'] });
  });

  it.each([
    ['reviewApplication', 'reviewSportsPlayerApplication', 'SportsPlayerApplicationReviewInput'],
    ['reviewTeamChange', 'reviewSportsTeamChange', 'SportsTeamChangeReviewInput'],
    ['reviewMatchAction', 'reviewSportsMatchAction', 'SportsMatchActionReviewInput'],
  ] as const)('builds the %s mutation and maps its result', async (method, mutationName, inputType) => {
    request.mockReturnValue(of({ [mutationName]: 'result-id' }));
    const input = { id: 'subject-1', decision: 'APPROVE' };

    await expect(firstValueFrom(TestBed.inject(SportsApiService)[method](input))).resolves.toBe('result-id');
    expect(request.mock.calls[0]?.[0]).toContain(`$input: ${inputType}!`);
    expect(request.mock.calls[0]?.[0]).toContain(`${mutationName}(input: $input)`);
    expect(request.mock.calls[0]?.[1]).toEqual({ input });
  });

  it.each([false, true])('builds a versioned delete with tournament scope: %s', async (scoped) => {
    request.mockReturnValue(of({ deleteSportsTeam: true }));
    const service = TestBed.inject(SportsApiService);

    await expect(
      firstValueFrom(service.deleteVersioned('deleteSportsTeam', 'team-1', 7, scoped ? 'tournament-1' : undefined)),
    ).resolves.toBe(true);

    const [query, variables] = request.mock.calls[0] as [string, Record<string, unknown>];
    expect(query.includes('$tournamentId: String!')).toBe(scoped);
    expect(query.includes('tournamentId: $tournamentId')).toBe(scoped);
    expect(variables).toEqual({ id: 'team-1', expectedRevision: 7, tournamentId: scoped ? 'tournament-1' : undefined });
  });

  it('uploads a team logo with an encoded path and multipart revision', async () => {
    const service = TestBed.inject(SportsApiService);
    const http = TestBed.inject(HttpTestingController);
    const file = new File(['logo'], 'logo.svg', { type: 'image/svg+xml' });
    const response = { teamId: 'team / 1', revision: 3, sha256: 'hash', downloadUrl: '/logo.svg' };

    const result = firstValueFrom(service.uploadTeamLogo('team / 1', 2, file));
    const pending = http.expectOne('/api/sports/admin/teams/team%20%2F%201/logo');

    expect(pending.request.method).toBe('POST');
    expect(pending.request.body.get('expectedRevision')).toBe('2');
    expect(pending.request.body.get('file')).toBe(file);
    pending.flush(response);
    await expect(result).resolves.toEqual(response);
    http.verify();
  });

  it('watches encoded tournament review events and decodes only object payloads', async () => {
    installFakeEventSource();
    const service = TestBed.inject(SportsApiService);
    const result = firstValueFrom(service.watchTournamentReview('tournament / 1'));
    const source = FakeEventSource.instances[0] as FakeEventSource;

    expect(source.url).toBe('/api/sports/tournaments/tournament%20%2F%201/review-events');
    source.emitMessage({ type: 'review-updated' });
    await expect(result).resolves.toEqual({ type: 'review-updated' });
    expect(source.close).toHaveBeenCalledOnce();
  });
});
