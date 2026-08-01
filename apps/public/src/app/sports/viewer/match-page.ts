import { DatePipe, Location } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatToolbarModule } from '@angular/material/toolbar';
import { ActivatedRoute } from '@angular/router';
import { Subject, catchError, distinctUntilChanged, filter, map, of, switchMap } from 'rxjs';
import { SportsViewerApiService } from './sports-viewer-api.service';
import { SportsViewerRealtimeService } from './sports-viewer-realtime.service';
import type { PublicSportsMatch, SportsViewerPageState } from './sports-viewer.types';
import {
  isRosterPublic,
  matchLocation,
  matchParticipantName,
  publicOfficialName,
  publicPlayerName,
  sportsLossReasonLabel,
  sportsMatchStateLabel,
  sportsOfficialRoleLabel,
  sportsRosterRoleLabel,
} from './sports-viewer.utils';

@Component({
  selector: 'app-sports-match-page',
  imports: [
    DatePipe,
    MatButtonModule,
    MatChipsModule,
    MatIconModule,
    MatProgressBarModule,
    MatToolbarModule,
  ],
  templateUrl: './match-page.html',
  styleUrl: './match-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SportsMatchPage {
  private readonly api = inject(SportsViewerApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly location = inject(Location);
  private readonly realtime = inject(SportsViewerRealtimeService);
  private readonly route = inject(ActivatedRoute);
  private readonly reload = new Subject<string>();

  readonly pageState = signal<SportsViewerPageState<PublicSportsMatch>>({ status: 'loading' });

  constructor() {
    this.reload
      .pipe(
        switchMap((matchId) =>
          this.api.getMatch(matchId).pipe(
            catchError((error: unknown) => {
              this.pageState.set({
                status: 'error',
                message:
                  error instanceof Error
                    ? error.message
                    : 'Não foi possível carregar esta partida.',
              });
              return of(null);
            }),
          ),
        ),
        filter((match): match is PublicSportsMatch => match !== null),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((match) =>
        this.pageState.set({ status: 'ready', data: match, liveConnectionLost: false }),
      );

    this.route.paramMap
      .pipe(
        map((params) => params.get('matchId') ?? params.get('id') ?? ''),
        filter(Boolean),
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((matchId) => {
        this.pageState.set({ status: 'loading' });
        this.reload.next(matchId);
        this.watchMatch(matchId);
      });
  }

  goBack(): void {
    this.location.back();
  }

  stateLabel(match: PublicSportsMatch): string {
    return sportsMatchStateLabel(match.state);
  }

  isLive(match: PublicSportsMatch): boolean {
    return match.state === 'LIVE' || match.state === 'PAUSED';
  }

  teamName(match: PublicSportsMatch, side: 'home' | 'away'): string {
    return matchParticipantName(match, side);
  }

  locationLabel(match: PublicSportsMatch): string {
    return matchLocation(match);
  }

  rosterIsPublic(match: PublicSportsMatch): boolean {
    return isRosterPublic(match);
  }

  playerName(name: string): string {
    return publicPlayerName(name);
  }

  officialName(name: string): string {
    return publicOfficialName(name);
  }

  officialRoleLabel(role: Parameters<typeof sportsOfficialRoleLabel>[0]): string {
    return sportsOfficialRoleLabel(role);
  }

  rosterRoleLabel(role: Parameters<typeof sportsRosterRoleLabel>[0]): string {
    return sportsRosterRoleLabel(role);
  }

  lossReasonLabel(reason: NonNullable<PublicSportsMatch['lossReason']>): string {
    return sportsLossReasonLabel(reason);
  }

  livestreamLabel(provider: PublicSportsMatch['livestreamProvider']): string {
    return {
      YOUTUBE: 'Assistir no YouTube',
      TWITCH: 'Assistir na Twitch',
      GENERAL: 'Assistir à transmissão',
    }[provider ?? 'GENERAL'];
  }

  private watchMatch(matchId: string): void {
    this.realtime
      .watchMatch(matchId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.reload.next(matchId),
        error: () => {
          const state = this.pageState();
          if (state.status === 'ready') {
            this.pageState.set({ ...state, liveConnectionLost: true });
          }
        },
      });
  }
}
