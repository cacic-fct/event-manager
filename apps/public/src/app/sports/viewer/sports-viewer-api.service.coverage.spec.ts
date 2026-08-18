import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthService } from '@cacic-fct/shared-angular';
import { firstValueFrom } from 'rxjs';
import { SportsViewerApiService } from './sports-viewer-api.service';

describe('SportsViewerApiService uncovered operations', () => {
  const isAuthenticated = signal(true);
  let api: SportsViewerApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    isAuthenticated.set(true);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { isAuthenticated } },
      ],
    });
    api = TestBed.inject(SportsViewerApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('updates the authenticated athlete profile with the exact profile input', async () => {
    const input = {
      registrationMemberId: 'member-1',
      gameNickname: 'Ninja',
      gameAccountName: 'ninja@example.test',
      gameAccountUrl: null,
    };
    const before = structuredClone(input);
    const result = firstValueFrom(api.updateAthleteProfile(input));
    const request = http.expectOne('/api/graphql');

    expect(request.request.body.query).toContain('mutation UpdateOwnSportsAthleteProfile');
    expect(request.request.body.variables).toEqual({ input });
    request.flush({ data: { updateCurrentUserSportsAthleteProfile: 'profile-updated' } });

    await expect(result).resolves.toBe('profile-updated');
    expect(input).toEqual(before);
  });

  it('surfaces athlete-profile GraphQL errors', async () => {
    const result = firstValueFrom(
      api.updateAthleteProfile({
        registrationMemberId: 'member-1',
        gameNickname: 'Ninja',
        gameAccountName: 'ninja',
        gameAccountUrl: 'https://game.example.test/ninja',
      }),
    );
    http.expectOne('/api/graphql').flush({ errors: [{ message: 'Perfil bloqueado' }, { message: 'Tente novamente' }] });

    await expect(result).rejects.toThrow('Perfil bloqueado\nTente novamente');
  });

  it('rejects an athlete-profile response without GraphQL data', async () => {
    const result = firstValueFrom(
      api.updateAthleteProfile({
        registrationMemberId: 'member-1',
        gameNickname: 'Ninja',
        gameAccountName: 'ninja',
        gameAccountUrl: null,
      }),
    );
    http.expectOne('/api/graphql').flush({});

    await expect(result).rejects.toThrow('Resposta GraphQL sem dados.');
  });
});
