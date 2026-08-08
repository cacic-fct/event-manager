import { DatePipe, Location, isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, PLATFORM_ID, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatToolbarModule } from '@angular/material/toolbar';
import { ActivatedRoute } from '@angular/router';
import { Subject, Subscription, catchError, distinctUntilChanged, filter, map, of, switchMap } from 'rxjs';
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
  private realtimeSubscription?: Subscription;

  readonly pageState = signal<SportsViewerPageState<PublicSportsMatch>>({ status: 'loading' });
  readonly now = signal(Date.now());

  constructor() {
    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      const timer = setInterval(() => this.now.set(Date.now()), 1000);
      this.destroyRef.onDestroy(() => clearInterval(timer));
    }
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

  overallClock(match: PublicSportsMatch): string {
    const startedAt = match.timerStartedAtUnixMs ?? (match.timerStartedAt ? new Date(match.timerStartedAt).getTime() : null);
    const running = startedAt == null ? 0 : Math.max(0, this.now() - startedAt);
    return this.formatElapsed(match.elapsedBeforePauseMs + running);
  }

  periodClock(match: PublicSportsMatch, periodNumber: number): string | null {
    const timer = match.periodTimers.find((candidate) => candidate.periodNumber === periodNumber);
    if (!timer) {
      return null;
    }
    const running = timer.startedAtUnixMs == null ? 0 : Math.max(0, this.now() - timer.startedAtUnixMs);
    const elapsed = timer.elapsedBeforePauseMs + running;
    const displayed = timer.capMs != null && !timer.allowOvertime ? Math.min(elapsed, timer.capMs) : elapsed;
    return this.formatElapsed(displayed);
  }

  private formatElapsed(value: number): string {
    const totalSeconds = Math.floor(Math.max(0, value) / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return [hours, minutes, seconds].map((part) => String(part).padStart(2, '0')).join(':');
  }

  private watchMatch(matchId: string): void {
    this.realtimeSubscription?.unsubscribe();
    this.realtimeSubscription = this.realtime
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
