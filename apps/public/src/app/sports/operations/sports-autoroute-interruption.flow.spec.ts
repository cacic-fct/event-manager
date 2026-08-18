import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '@cacic-fct/shared-angular';
import { firstValueFrom, of } from 'rxjs';
import { DefaultRedirectApiService } from '../../landing/default-redirect-api.service';
import { SportsAutorouteInterruptionFlow } from './sports-autoroute-interruption.flow';

describe('SportsAutorouteInterruptionFlow', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('does not trap representatives in team management', async () => {
    const flow = createFlow({ teamId: 'team-1', mode: 'TEAM' });

    await expect(firstValueFrom(flow.resolve({ currentUrl: '/calendar' }))).resolves.toBeNull();
  });

  it('routes a nearby player to the wallet without polling', async () => {
    const flow = createFlow({
      matchId: 'match-1',
      mode: 'WALLET',
    });

    const interruption = await firstValueFrom(flow.resolve({ currentUrl: '/calendar' }));

    expect(interruption?.target.toString()).toBe('/profile/wallet?sportsMatchId=match-1');
  });

  it('does not keep interrupting while the user is already at the resolved target', async () => {
    const flow = createFlow({
      matchId: 'match-1',
      mode: 'OPERATE',
    });

    const interruption = await firstValueFrom(flow.resolve({ currentUrl: '/sports/operate/match-1?mode=OPERATE' }));

    expect(interruption).toBeNull();
  });

  it('ignores match detail suggestions because they are not time-sensitive operations', async () => {
    const flow = createFlow({
      matchId: 'match-1',
      mode: 'MATCH_DETAIL',
    });

    expect(await firstValueFrom(flow.resolve({ currentUrl: '/calendar' }))).toBeNull();
  });
});

function createFlow(route: { matchId?: string; teamId?: string; mode: string }): SportsAutorouteInterruptionFlow {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      SportsAutorouteInterruptionFlow,
      { provide: PLATFORM_ID, useValue: 'browser' },
      {
        provide: AuthService,
        useValue: { isAuthenticated: () => true },
      },
      {
        provide: DefaultRedirectApiService,
        useValue: { getCurrentUserSportsAutoroute: () => of(route) },
      },
    ],
  });
  return TestBed.inject(SportsAutorouteInterruptionFlow);
}
