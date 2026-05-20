import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { MatToolbarModule } from '@angular/material/toolbar';
import { ActivatedRoute, NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { EmojiService } from '../../profile/attendances/emoji.service';
import { RankedSubscriptionRankStep } from './ranked-subscription-rank-step';
import { RankedSubscriptionSelectStep } from './ranked-subscription-select-step';
import { RankedSubscriptionStore } from './ranked-subscription.store';

@Component({
  selector: 'app-ranked-subscription',
  imports: [
    MatButtonModule,
    MatChipsModule,
    MatDialogModule,
    MatIconModule,
    MatProgressBarModule,
    MatSnackBarModule,
    MatToolbarModule,
    RankedSubscriptionRankStep,
    RankedSubscriptionSelectStep,
    RouterLink,
    RouterOutlet,
  ],
  providers: [RankedSubscriptionStore],
  templateUrl: './ranked-subscription.html',
  styleUrls: ['./subscription.css', './ranked-subscription.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RankedMajorEventSubscription {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly navigationTick = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map(() => this.router.url),
    ),
    { initialValue: this.router.url },
  );

  readonly emoji = inject(EmojiService);
  readonly store = inject(RankedSubscriptionStore);
  readonly currentStep = signal<'select' | 'rank'>('select');
  readonly eventChildActive = computed(() => {
    this.navigationTick();
    return this.route.firstChild?.snapshot.routeConfig?.path === 'event/:eventId';
  });

  showSelectionStep(): void {
    this.currentStep.set('select');
  }

  showRankingStep(): void {
    this.currentStep.set('rank');
  }
}
