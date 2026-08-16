import { DatePipe, Location, isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTabsModule } from '@angular/material/tabs';
import { MatToolbarModule } from '@angular/material/toolbar';
import {
  SportsBracketComponent,
  SportsLiveDotComponent,
  SportsTeamLogoComponent,
  TwemojiComponent,
  MarkdownComponent,
} from '@cacic-fct/shared-angular';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subject, Subscription, catchError, distinctUntilChanged, filter, map, of, switchMap } from 'rxjs';
import { SportsViewerApiService } from './sports-viewer-api.service';
import { SportsViewerRealtimeService } from './sports-viewer-realtime.service';
import type {
  PublicSportsCategory,
  PublicSportsMatch,
  PublicSportsTournamentDetail,
  SportsViewerPageState,
} from './sports-viewer.types';
import {
  compareSportsMatches,
  matchLocation,
  matchParticipantName,
  sportsFormatLabel,
  sportsMatchStateLabel,
  sportsPresetLabel,
} from './sports-viewer.utils';
import { SportsAthletePreparationPanel } from './athlete-preparation-panel';

@Component({
  selector: 'app-sports-tournament-page',
  imports: [
    DatePipe,
    MatButtonModule,
    MatChipsModule,
    MatIconModule,
    MatProgressBarModule,
    MatTabsModule,
    MatToolbarModule,
    MarkdownComponent,
    RouterLink,
    SportsBracketComponent,
    SportsLiveDotComponent,
    SportsTeamLogoComponent,
    SportsAthletePreparationPanel,
    TwemojiComponent,
  ],
  templateUrl: './tournament-page.html',
  styleUrl: './tournament-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SportsTournamentPage {
  private readonly api = inject(SportsViewerApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly location = inject(Location);
  private readonly realtime = inject(SportsViewerRealtimeService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly reload = new Subject<string>();
  private currentTournamentId = '';
  private realtimeSubscription?: Subscription;

  readonly pageState = signal<SportsViewerPageState<PublicSportsTournamentDetail>>({ status: 'loading' });
  readonly selectedCategoryId = signal<string | null>(null);
  readonly now = signal(Date.now());

  readonly tournament = computed(() => {
    const state = this.pageState();
    return state.status === 'ready' ? state.data : null;
  });
  readonly selectedCategory = computed(() => {
    const tournament = this.tournament();
    return (
      tournament?.categories.find((category) => category.id === this.selectedCategoryId()) ??
      tournament?.categories[0] ??
      null
    );
  });
  readonly orderedMatches = computed(() => {
    const tournament = this.tournament();
    if (!tournament) {
      return [];
    }
    return tournament.matchesArePersonalized ? tournament.matches : [...tournament.matches].sort(compareSportsMatches);
  });
  readonly liveMatches = computed(() =>
    this.orderedMatches().filter((match) => match.state === 'LIVE' || match.state === 'PAUSED'),
  );
  readonly upcomingMatches = computed(() =>
    this.orderedMatches().filter((match) => match.state === 'SCHEDULED' || match.state === 'CHECK_IN'),
  );
  readonly recentMatches = computed(() =>
    this.orderedMatches()
      .filter((match) => ['FINISHED', 'DRAW', 'CANCELED', 'AWAITING_REVIEW'].includes(match.state))
      .reverse(),
  );

  constructor() {
    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      const timer = setInterval(() => this.now.set(Date.now()), 1000);
      this.destroyRef.onDestroy(() => clearInterval(timer));
    }
    this.reload
      .pipe(
        switchMap((tournamentId) =>
          this.api.getTournament(tournamentId).pipe(
            catchError((error: unknown) => {
              this.pageState.set({
                status: 'error',
                message: error instanceof Error ? error.message : 'Não foi possível carregar este torneio.',
              });
              return of(null);
            }),
          ),
        ),
        filter((tournament): tournament is PublicSportsTournamentDetail => tournament !== null),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((tournament) => {
        const categoryStillExists = tournament.categories.some((category) => category.id === this.selectedCategoryId());
        if (!categoryStillExists) {
          this.selectedCategoryId.set(tournament.categories[0]?.id ?? null);
        }
        this.pageState.set({ status: 'ready', data: tournament, liveConnectionLost: false });
      });

    this.route.paramMap
      .pipe(
        map((params) => params.get('tournamentId') ?? params.get('id') ?? ''),
        filter(Boolean),
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((tournamentId) => {
        this.currentTournamentId = tournamentId;
        this.pageState.set({ status: 'loading' });
        this.reload.next(tournamentId);
        this.watchTournament(tournamentId);
      });
  }

  retry(): void {
    if (!this.currentTournamentId) {
      return;
    }
    this.pageState.set({ status: 'loading' });
    this.reload.next(this.currentTournamentId);
  }

  goBack(): void {
    this.location.back();
  }

  selectCategory(index: number): void {
    this.selectedCategoryId.set(this.tournament()?.categories[index]?.id ?? null);
  }

  categoryTitle(category: PublicSportsCategory): string {
    const details = [sportsPresetLabel(category.sport, category.customSportName), category.division].filter(Boolean);
    return details.join(' · ');
  }

  formatLabel(category: PublicSportsCategory): string {
    return sportsFormatLabel(category.format);
  }

  stateLabel(match: PublicSportsMatch): string {
    return sportsMatchStateLabel(match.state);
  }

  participantName(match: PublicSportsMatch, side: 'home' | 'away'): string {
    return matchParticipantName(match, side);
  }

  locationLabel(match: PublicSportsMatch): string {
    return matchLocation(match);
  }

  overallClock(match: PublicSportsMatch): string {
    const startedAt =
      match.timerStartedAtUnixMs ?? (match.timerStartedAt ? new Date(match.timerStartedAt).getTime() : null);
    const elapsed = match.elapsedBeforePauseMs + (startedAt == null ? 0 : Math.max(0, this.now() - startedAt));
    const totalSeconds = Math.floor(elapsed / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return [hours, minutes, seconds].map((part) => String(part).padStart(2, '0')).join(':');
  }

  openMatch(matchId: string): void {
    void this.router.navigate(['/sports/match', matchId]);
  }

  private watchTournament(tournamentId: string): void {
    this.realtimeSubscription?.unsubscribe();
    this.realtimeSubscription = this.realtime
      .watchTournament(tournamentId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.reload.next(tournamentId),
        error: () => {
          const state = this.pageState();
          if (state.status === 'ready') {
            this.pageState.set({ ...state, liveConnectionLost: true });
          }
        },
      });
  }
}
