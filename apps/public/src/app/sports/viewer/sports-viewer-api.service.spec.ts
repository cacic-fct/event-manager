import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthService } from '@cacic-fct/shared-angular';
import { firstValueFrom } from 'rxjs';
import { SportsViewerApiService } from './sports-viewer-api.service';

describe('SportsViewerApiService', () => {
  const isAuthenticated = signal(false);

  beforeEach(() => {
    isAuthenticated.set(false);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { isAuthenticated } },
      ],
    });
  });

  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('loads the public tournament projection with brackets, standings, and matches', async () => {
    const api = TestBed.inject(SportsViewerApiService);
    const http = TestBed.inject(HttpTestingController);
    const result = firstValueFrom(api.getTournament('tournament / 1'));
    const request = http.expectOne('/api/graphql');

    expect(request.request.body.variables).toEqual({ tournamentId: 'tournament / 1' });
    expect(request.request.body.query).toContain('publicSportsTournamentDetail');
    expect(request.request.body.query).toContain('standings');
    expect(request.request.body.query).toContain('brackets');
    expect(request.request.body.query).toContain('rosters');

    request.flush({
      data: {
        publicSportsTournamentDetail: {
          id: 'tournament / 1',
          name: 'InterFCT',
          categories: [],
          teams: [],
          matches: [],
          overallScores: [],
        },
      },
    });

    await expect(result).resolves.toEqual(expect.objectContaining({ name: 'InterFCT' }));
  });

  it('uses the personalized match order for an authenticated athlete', async () => {
    isAuthenticated.set(true);
    const api = TestBed.inject(SportsViewerApiService);
    const http = TestBed.inject(HttpTestingController);
    const result = firstValueFrom(api.getTournament('tournament-1'));
    const request = http.expectOne('/api/graphql');

    expect(request.request.body.query).toContain('currentUserSportsTournamentDetail');
    expect(request.request.body.query).toContain('orderedMatches');

    request.flush({
      data: {
        currentUserSportsTournamentDetail: {
          tournament: {
            id: 'tournament-1',
            name: 'InterFCT',
            categories: [],
            teams: [],
            matches: [{ id: 'other-match' }],
            overallScores: [],
          },
          orderedMatches: [{ id: 'my-match' }, { id: 'team-match' }, { id: 'other-match' }],
        },
      },
    });

    await expect(result).resolves.toEqual(
      expect.objectContaining({
        matches: [{ id: 'my-match' }, { id: 'team-match' }, { id: 'other-match' }],
        matchesArePersonalized: true,
      }),
    );
  });

  it('loads the public match projection without a person identifier', async () => {
    const api = TestBed.inject(SportsViewerApiService);
    const http = TestBed.inject(HttpTestingController);
    const result = firstValueFrom(api.getMatch('match-1'));
    const request = http.expectOne('/api/graphql');

    expect(request.request.body.variables).toEqual({ matchId: 'match-1' });
    expect(request.request.body.query).toContain('publicSportsMatchDetail');
    expect(request.request.body.query).not.toContain('personId');

    request.flush({ data: { publicSportsMatchDetail: { id: 'match-1' } } });
    await expect(result).resolves.toEqual({ id: 'match-1' });
  });
});
