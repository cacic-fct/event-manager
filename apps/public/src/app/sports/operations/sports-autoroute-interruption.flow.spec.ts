import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { AuthService } from '@cacic-fct/shared-angular';
import { firstValueFrom, of } from 'rxjs';
import { DefaultRedirectApiService } from '../../landing/default-redirect-api.service';
import { SportsAutorouteInterruptionFlow } from './sports-autoroute-interruption.flow';

describe('SportsAutorouteInterruptionFlow', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('does not trap representatives in team management', async () => {
    const api = {
      getCurrentUserSportsAutoroute: vi.fn(() =>
        of({ mode: 'TEAM' as const, teamId: 'team-1' }),
      ),
    };
    TestBed.configureTestingModule({
      providers: [
        SportsAutorouteInterruptionFlow,
        { provide: PLATFORM_ID, useValue: 'browser' },
        { provide: AuthService, useValue: { isAuthenticated: () => true } },
        { provide: DefaultRedirectApiService, useValue: api },
        { provide: Router, useValue: { parseUrl: vi.fn() } },
      ],
    });

    await expect(
      firstValueFrom(TestBed.inject(SportsAutorouteInterruptionFlow).resolve({ currentUrl: '/calendar' })),
    ).resolves.toBeNull();
  });
});
