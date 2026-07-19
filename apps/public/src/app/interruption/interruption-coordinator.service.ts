import { isPlatformBrowser } from '@angular/common';
import { Injectable, OnDestroy, PLATFORM_ID, effect, inject } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { AuthService } from '@cacic-fct/shared-angular';
import { EMPTY, Subject, Subscription, catchError, filter, forkJoin, map, of, switchMap } from 'rxjs';
import { PublicFeatureFlagService } from '../feature-flags/public-feature-flag.service';
import {
  INTERRUPTION_FLOW,
  INTERRUPTION_PRIORITIES,
  Interruption,
  InterruptionContext,
  InterruptionFlow,
} from './interruption-flow';

const NORMAL_INTERRUPTION_EXEMPTION_PATHS = ['/profile/forms/', '/attendance/collect/', '/attendance/register'];

export function selectNextInterruption(
  interruptions: readonly (Interruption | null)[],
  context: InterruptionContext,
): Interruption | null {
  return (
    interruptions
      .filter((interruption): interruption is Interruption => Boolean(interruption))
      .filter((interruption) => canApplyInterruption(interruption, context))
      .sort((left, right) => {
        const priorityDifference = INTERRUPTION_PRIORITIES[left.priority] - INTERRUPTION_PRIORITIES[right.priority];
        return priorityDifference || left.priorityOrder - right.priorityOrder || left.id.localeCompare(right.id);
      })[0] ?? null
  );
}

function canApplyInterruption(interruption: Interruption, context: InterruptionContext): boolean {
  if (interruption.priority === 'URGENT') {
    return true;
  }

  return !NORMAL_INTERRUPTION_EXEMPTION_PATHS.some((path) => context.currentUrl.startsWith(path));
}

@Injectable({ providedIn: 'root' })
export class InterruptionCoordinatorService implements OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly featureFlags = inject(PublicFeatureFlagService);
  private readonly flows = (inject(INTERRUPTION_FLOW, { optional: true }) as readonly InterruptionFlow[] | null) ?? [];
  private readonly platformId = inject(PLATFORM_ID);
  private readonly router = inject(Router);
  private readonly checks = new Subject<void>();
  private readonly subscriptions = new Subscription();

  private started = false;
  private navigating = false;

  constructor() {
    effect(() => {
      if (this.auth.isAuthenticated() && this.featureFlags.booleanValue('interruptionsEnabled')) {
        this.requestCheck();
      }
    });
  }

  start(): void {
    if (this.started || !isPlatformBrowser(this.platformId)) {
      return;
    }
    this.started = true;

    this.subscriptions.add(
      this.router.events.pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd)).subscribe(() => {
        this.requestCheck();
      }),
    );
    for (const flow of this.flows) {
      if (flow.changes) {
        this.subscriptions.add(flow.changes().subscribe(() => this.requestCheck()));
      }
    }
    this.subscriptions.add(
      this.checks
        .pipe(
          filter(() => this.auth.isAuthenticated() && !this.navigating),
          switchMap(() => this.resolveNextInterruption()),
        )
        .subscribe((interruption) => {
          if (!interruption || !this.auth.isAuthenticated()) {
            return;
          }

          this.navigating = true;
          void this.router.navigateByUrl(interruption.target).finally(() => {
            this.navigating = false;
          });
        }),
    );
    this.requestCheck();
  }

  requestCheck(): void {
    if (this.started && isPlatformBrowser(this.platformId)) {
      this.checks.next();
    }
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  private resolveNextInterruption() {
    if (!this.featureFlags.booleanValue('interruptionsEnabled')) {
      return of(null);
    }

    if (this.flows.length === 0) {
      return EMPTY;
    }

    const context: InterruptionContext = { currentUrl: this.router.url || '/menu' };
    return forkJoin(
      this.flows.map((flow) =>
        flow.resolve(context).pipe(
          catchError(() => of(null)),
        ),
      ),
    ).pipe(
      map((interruptions) => this.selectNext(interruptions, context)),
    );
  }

  private selectNext(
    interruptions: readonly (Interruption | null)[],
    context: InterruptionContext,
  ): Interruption | null {
    return selectNextInterruption(interruptions, context);
  }
}
