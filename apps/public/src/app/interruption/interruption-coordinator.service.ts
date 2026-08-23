import { isPlatformBrowser } from '@angular/common';
import { Service, OnDestroy, PLATFORM_ID, effect, inject } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { AuthService } from '@cacic-fct/shared-angular';
import { Observable, Subject, Subscription, catchError, defer, filter, forkJoin, map, of, switchMap } from 'rxjs';
import { PublicFeatureFlagService } from '../feature-flags/public-feature-flag.service';
import {
  INTERRUPTION_FLOW,
  INTERRUPTION_PRIORITIES,
  Interruption,
  InterruptionContext,
  InterruptionFlow,
} from './interruption-flow';

const NORMAL_INTERRUPTION_EXEMPTION_PATHS = [
  '/profile/forms/',
  '/attendance/collect/',
  '/attendance/register',
  '/sports/operate/',
  '/sports/team/',
];
const NORMAL_INTERRUPTION_EXEMPTION_PATTERNS = [
  /^\/major-event\/[^/]+\/(?:subscription|ranked-subscription|payment)(?:\/|\?|$)/,
  /^\/tournament\/[^/]+\/subscribe(?:\/|\?|$)/,
];

type InterruptionResolution = {
  interruption: Interruption | null;
  isFallback: boolean;
};

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

  return !(
    NORMAL_INTERRUPTION_EXEMPTION_PATHS.some((path) => context.currentUrl.startsWith(path)) ||
    NORMAL_INTERRUPTION_EXEMPTION_PATTERNS.some((pattern) => pattern.test(context.currentUrl))
  );
}

@Service()
export class InterruptionCoordinatorService implements OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly featureFlags = inject(PublicFeatureFlagService);
  private readonly flows = (inject(INTERRUPTION_FLOW, { optional: true }) as readonly InterruptionFlow[] | null) ?? [];
  private readonly platformId = inject(PLATFORM_ID);
  private readonly router = inject(Router);
  private readonly checks = new Subject<void>();
  private readonly subscriptions = new Subscription();
  private readonly handledNormalInterruptionIds = new Set<string>();

  private started = false;
  private navigating = false;

  constructor() {
    effect(() => {
      const authenticated = this.auth.isAuthenticated();
      if (!authenticated) {
        this.handledNormalInterruptionIds.clear();
        return;
      }

      if (this.featureFlags.booleanValue('interruptionsEnabled')) {
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
      this.router.events
        .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
        .subscribe(() => {
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
        .subscribe(({ interruption, isFallback }) => {
          if (
            !interruption ||
            !this.auth.isAuthenticated() ||
            (!this.featureFlags.booleanValue('interruptionsEnabled') && !isFallback)
          ) {
            return;
          }

          if (interruption.priority === 'NORMAL') {
            this.handledNormalInterruptionIds.add(interruption.id);
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
    const context: InterruptionContext = { currentUrl: this.router.url || '/menu' };
    const fallbackFlows = this.flows.filter((flow) => flow.isFallback);
    const interruptionFlows = this.featureFlags.booleanValue('interruptionsEnabled')
      ? this.flows.filter((flow) => !flow.isFallback)
      : [];
    const fallbackResolution = this.resolveFlows(fallbackFlows, context).pipe(
      map((interruption): InterruptionResolution => ({ interruption, isFallback: true })),
    );

    return this.resolveFlows(interruptionFlows, context).pipe(
      switchMap((interruption): Observable<InterruptionResolution> =>
        interruption
          ? of({ interruption, isFallback: false })
          : fallbackResolution,
      ),
    );
  }

  private resolveFlows(flows: readonly InterruptionFlow[], context: InterruptionContext) {
    if (flows.length === 0) {
      return of<Interruption | null>(null);
    }

    return defer(() =>
      forkJoin(
        flows.map((flow) =>
          defer(() => flow.resolve(context)).pipe(
            catchError(() => of(null)),
          ),
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
    return selectNextInterruption(
      interruptions.map((interruption) =>
        interruption &&
        interruption.priority === 'NORMAL' &&
        this.handledNormalInterruptionIds.has(interruption.id)
          ? null
          : interruption,
      ),
      context,
    );
  }
}
