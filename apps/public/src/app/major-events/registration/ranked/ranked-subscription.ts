import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, linkedSignal } from '@angular/core';
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
import { MarkdownComponent } from '@cacic-fct/shared-angular';
import { EmojiService } from '../../../shared/emoji.service';
import { RankedSubscriptionRankStep } from './rank-step';
import { RankedSubscriptionSelectStep } from './select-step';
import { RankedSubscriptionStore } from './registration.store';
import { SubscriptionFormFlow } from '../standard/subscription-form-flow';
import { SubscriptionTierSelection } from '../tier/tier-selection';

@Component({
  selector: 'app-ranked-subscription',
  imports: [
    MatButtonModule,
    MatChipsModule,
    CurrencyPipe,
    MatDialogModule,
    MatIconModule,
    MatProgressBarModule,
    MatSnackBarModule,
    MatToolbarModule,
    MarkdownComponent,
    RankedSubscriptionRankStep,
    RankedSubscriptionSelectStep,
    SubscriptionFormFlow,
    SubscriptionTierSelection,
    RouterLink,
    RouterOutlet,
  ],
  providers: [RankedSubscriptionStore],
  templateUrl: './ranked-subscription.html',
  styleUrls: ['../standard/subscription.css', './ranked-subscription.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RankedMajorEventSubscription {
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
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
  readonly currentStep = linkedSignal({
    source: this.store.majorEventId,
    computation: (): 'tier' | 'select' | 'rank' => 'tier',
  });
  readonly showingTierStep = computed(
    () =>
      this.currentStep() === 'tier' &&
      this.store.decisions().hasTierStep &&
      !this.store.isPreparingSubscriptionFlow() &&
      !this.store.subscriptionFormFlow(),
  );
  readonly eventChildActive = computed(() => {
    this.navigationTick();
    return this.route.firstChild?.snapshot.routeConfig?.path === 'event/:eventId';
  });

  showSelectionStep(): void {
    this.currentStep.set('select');
    this.focusStep();
  }

  showRankingStep(): void {
    if (!this.store.decisions().includesEvents) {
      return;
    }
    this.currentStep.set('rank');
    this.focusStep();
  }

  continueFromTier(): void {
    if (!this.store.decisions().tierResolved || this.store.currentUserSubscription() === undefined) {
      return;
    }
    if (this.store.decisions().includesEvents) {
      this.showSelectionStep();
      return;
    }
    this.store.submit();
  }

  returnToTier(): void {
    if (this.store.tierSelectionLocked()) {
      return;
    }
    this.currentStep.set('tier');
    this.focusStep();
  }

  returnFromForms(draft: Parameters<RankedSubscriptionStore['returnToRanking']>[0]): void {
    this.store.returnToRanking(draft);
    if (this.store.decisions().includesEvents) {
      this.currentStep.set('rank');
    } else {
      this.currentStep.set('tier');
    }
    this.focusStep();
  }

  private focusStep(): void {
    setTimeout(() =>
      this.element.nativeElement.querySelector<HTMLElement>('[data-step-title], #tier-selection-title')?.focus(),
    );
  }
}
