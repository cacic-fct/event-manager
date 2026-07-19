import { PLATFORM_ID, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NavigationEnd, Router } from '@angular/router';
import { AuthService } from '@cacic-fct/shared-angular';
import { Subject, of, throwError } from 'rxjs';
import { PublicFeatureFlagService } from '../feature-flags/public-feature-flag.service';
import type { Interruption } from './interruption-flow';
import { INTERRUPTION_FLOW, InterruptionFlow } from './interruption-flow';
import { InterruptionCoordinatorService, selectNextInterruption } from './interruption-coordinator.service';

const attendance = interruption('online-attendance', 'NORMAL', 100);
const requiredForm = interruption('required-subscription-form', 'NORMAL', 200);
const urgent = interruption('urgent-security-action', 'URGENT', 500);

describe('selectNextInterruption', () => {
  it('keeps online attendance ahead of required subscription forms', () => {
    expect(selectNextInterruption([requiredForm, attendance], { currentUrl: '/menu' })).toBe(attendance);
  });

  it('keeps urgent flows ahead of every normal flow', () => {
    expect(selectNextInterruption([attendance, urgent, requiredForm], { currentUrl: '/menu' })).toBe(urgent);
  });

  it('does not interrupt form completion, attendance registration, or scanner collection with normal flows', () => {
    expect(selectNextInterruption([attendance, requiredForm], { currentUrl: '/profile/forms/form-1' })).toBeNull();
    expect(selectNextInterruption([attendance, requiredForm], { currentUrl: '/attendance/register/event-1' })).toBeNull();
    expect(selectNextInterruption([attendance, requiredForm], { currentUrl: '/attendance/collect/event-1' })).toBeNull();
  });

  it('still permits urgent interruptions on protected normal-flow pages', () => {
    expect(selectNextInterruption([urgent, attendance], { currentUrl: '/profile/forms/form-1' })).toBe(urgent);
  });
});

describe('InterruptionCoordinatorService', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('starts checks, reacts to flow changes and navigation, and stops listening on cleanup', async () => {
    const changes = new Subject<void>();
    const flow = {
      resolve: vi.fn(() => of(attendance)),
      changes: () => changes,
    } satisfies InterruptionFlow;
    const { events, router, service } = createService([flow]);

    service.start();
    expect(router.navigateByUrl).toHaveBeenCalledWith(attendance.target);

    await settleNavigation();
    router.navigateByUrl.mockClear();
    changes.next();
    expect(router.navigateByUrl).toHaveBeenCalledWith(attendance.target);

    await settleNavigation();
    router.navigateByUrl.mockClear();
    events.next(new NavigationEnd(1, '/menu', '/menu'));
    expect(router.navigateByUrl).toHaveBeenCalledWith(attendance.target);

    service.ngOnDestroy();
    await settleNavigation();
    router.navigateByUrl.mockClear();
    changes.next();
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });

  it('isolates a failed flow and still follows a valid interruption', () => {
    const failingFlow = {
      resolve: vi.fn(() => throwError(() => new Error('offline'))),
    } satisfies InterruptionFlow;
    const { router, service } = createService([failingFlow, { resolve: () => of(urgent) }]);

    service.start();

    expect(router.navigateByUrl).toHaveBeenCalledWith(urgent.target);
  });

  it('does not navigate when logout happens while an interruption is resolving', () => {
    const resolution = new Subject<Interruption | null>();
    const auth = signal(true);
    const { router, service } = createService([{ resolve: () => resolution }], auth);

    service.start();
    auth.set(false);
    resolution.next(attendance);
    resolution.complete();

    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });

  it('does not navigate when the global kill switch is disabled while an interruption is resolving', () => {
    const resolution = new Subject<Interruption | null>();
    const interruptionsEnabled = signal(true);
    const { router, service } = createService([{ resolve: () => resolution }], signal(true), interruptionsEnabled);

    service.start();
    interruptionsEnabled.set(false);
    resolution.next(attendance);
    resolution.complete();

    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });

  it('does not resolve or navigate interruptions when the global kill switch is disabled', () => {
    const flow = { resolve: vi.fn(() => of(attendance)) } satisfies InterruptionFlow;
    const { router, service } = createService([flow], signal(true), signal(false));

    service.start();

    expect(flow.resolve).not.toHaveBeenCalled();
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });
});

function createService(
  flows: readonly InterruptionFlow[],
  authenticated = signal(true),
  interruptionsEnabled = signal(true),
): {
  events: Subject<unknown>;
  router: { navigateByUrl: ReturnType<typeof vi.fn> };
  service: InterruptionCoordinatorService;
} {
  const events = new Subject<unknown>();
  const router = {
    events,
    navigateByUrl: vi.fn(() => Promise.resolve(true)),
    url: '/menu',
  };

  TestBed.configureTestingModule({
    providers: [
      InterruptionCoordinatorService,
      { provide: AuthService, useValue: { isAuthenticated: authenticated } },
      { provide: PublicFeatureFlagService, useValue: { booleanValue: () => interruptionsEnabled() } },
      { provide: Router, useValue: router },
      { provide: PLATFORM_ID, useValue: 'browser' },
      ...flows.map((flow) => ({ provide: INTERRUPTION_FLOW, useValue: flow, multi: true })),
    ],
  });

  return {
    events,
    router,
    service: TestBed.inject(InterruptionCoordinatorService),
  };
}

async function settleNavigation(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function interruption(id: string, priority: Interruption['priority'], priorityOrder: number): Interruption {
  return {
    id,
    priority,
    priorityOrder,
    target: {} as Interruption['target'],
  };
}
