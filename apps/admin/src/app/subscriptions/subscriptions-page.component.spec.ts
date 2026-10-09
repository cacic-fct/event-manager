import { TestBed } from '@angular/core/testing';
import { Component, input, output } from '@angular/core';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { FormControl, FormGroup } from '@angular/forms';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Permission } from '@cacic-fct/shared-permissions';
import { watchReplayableEventSource } from '@cacic-fct/shared-angular';
import { FakeEventSource, installFakeEventSource } from '@cacic-fct/shared-angular/testing';
import { BehaviorSubject, NEVER, of, throwError } from 'rxjs';
import { ReceiptValidationApiService, type ReceiptValidationQueue } from '../graphql/receipt-validation-api.service';
import { PermissionsService } from '../permissions/permissions.service';
import { SubscriptionsService } from './subscriptions.service';
import { SubscriptionsPageComponent } from './subscriptions-page.component';
import { flushAsync } from '../testing/async-test-helpers';
import { EventSubscriptionsComponent } from './event-subscriptions.component';
import { MajorEventSubscriptionsComponent } from './major-event-subscriptions.component';
import { EventInterestsComponent } from './event-interests.component';
import { EventContextPickerComponent, type EventContextRef } from '../shared/event-context-picker.component';

@Component({ selector: 'app-event-context-picker', template: '' })
class EventContextPickerStub {
  readonly hideInShell = input(false);
  readonly allowGroups = input(false);
  readonly context = input<EventContextRef | null>(null);
  readonly contextChange = output<EventContextRef>();
}

@Component({ selector: 'app-workspace-event-subscriptions-subtab', template: '' })
class EventSubscriptionsTabStub {}

@Component({ selector: 'app-workspace-major-event-subscriptions-subtab', template: '' })
class MajorEventSubscriptionsTabStub {
  readonly pendingReceiptsCount = input(0);
}

@Component({ selector: 'app-workspace-event-interests', template: 'Interesses' })
class EventInterestsTabStub {
  readonly context = input<EventContextRef | null>(null);
  static readonly initialize = vi.fn();

  constructor() {
    EventInterestsTabStub.initialize();
  }
}

describe('SubscriptionsPageComponent lazy interest loading', () => {
  it('loads interests only after the interests route is selected', async () => {
    EventInterestsTabStub.initialize.mockClear();
    const paramMap = new BehaviorSubject(convertToParamMap({}));
    const route = { paramMap, snapshot: { url: [] as Array<{ path: string }> } };
    await TestBed.configureTestingModule({
      imports: [SubscriptionsPageComponent],
      providers: [
        provideRouter([]),
        { provide: Router, useValue: { navigate: vi.fn(async () => true) } },
        { provide: ActivatedRoute, useValue: route },
        { provide: SubscriptionsService, useValue: {
          majorEventForm: new FormGroup({ majorEventId: new FormControl('', { nonNullable: true }) }),
          closeLiveUpdates: vi.fn(),
        } },
        { provide: PermissionsService, useValue: { evaluateWorkspacePermissions: vi.fn(async () => undefined), has: () => false } },
        { provide: ReceiptValidationApiService, useValue: {} },
      ],
    }).overrideComponent(SubscriptionsPageComponent, {
      remove: { imports: [EventContextPickerComponent, EventSubscriptionsComponent, MajorEventSubscriptionsComponent, EventInterestsComponent] },
      add: { imports: [EventContextPickerStub, EventSubscriptionsTabStub, MajorEventSubscriptionsTabStub, EventInterestsTabStub] },
    }).compileComponents();
    const fixture = TestBed.createComponent(SubscriptionsPageComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(EventInterestsTabStub.initialize).not.toHaveBeenCalled();

    route.snapshot.url = [{ path: 'interests' }];
    paramMap.next(convertToParamMap({ eventId: 'event-1' }));
    fixture.detectChanges();
    await fixture.whenStable();
    expect(EventInterestsTabStub.initialize).toHaveBeenCalledOnce();
  });
});

describe('SubscriptionsPageComponent receipt queue live updates', () => {
  let workspace: {
    majorEventForm: FormGroup<{ majorEventId: FormControl<string> }>;
    closeLiveUpdates: ReturnType<typeof vi.fn>;
  };
  let permissions: {
    evaluateWorkspacePermissions: ReturnType<typeof vi.fn>;
    has: ReturnType<typeof vi.fn>;
  };
  let receiptApi: {
    watchQueue: ReturnType<typeof vi.fn>;
    getQueue: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    workspace = {
      majorEventForm: new FormGroup({ majorEventId: new FormControl('major-event-1', { nonNullable: true }) }),
      closeLiveUpdates: vi.fn(),
    };
    permissions = {
      evaluateWorkspacePermissions: vi.fn().mockResolvedValue(undefined),
      has: vi.fn((scope: Permission) => scope === Permission.Receipt.Read),
    };
    receiptApi = {
      watchQueue: vi.fn((majorEventId: string) => queueStream(majorEventId)),
      getQueue: vi.fn(() => of({ pendingCount: 0, items: [] } satisfies ReceiptValidationQueue)),
    };

    await TestBed.configureTestingModule({
      imports: [SubscriptionsPageComponent],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { paramMap: of(convertToParamMap({})), snapshot: { url: [] } },
        },
        { provide: SubscriptionsService, useValue: workspace },
        { provide: PermissionsService, useValue: permissions },
        { provide: ReceiptValidationApiService, useValue: receiptApi },
        { provide: MatSnackBar, useValue: { open: vi.fn() } },
      ],
    })
      .overrideComponent(SubscriptionsPageComponent, { set: { template: '', imports: [] } })
      .compileComponents();
  });

  it('starts with actual context selection and routes group interests without category tabs', () => {
    const fixture = TestBed.createComponent(SubscriptionsPageComponent);
    expect(fixture.componentInstance.context()).toBeNull();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture.componentInstance.selectContext({ kind: 'event', id: 'event-2' });
    expect(navigate).toHaveBeenLastCalledWith(['/subscriptions', 'event', 'event-2']);
    fixture.componentInstance.interestsMode.set(true);
    fixture.componentInstance.selectContext({ kind: 'group', id: 'group-2' });
    expect(navigate).toHaveBeenLastCalledWith(['/subscriptions', 'group', 'group-2', 'interests']);
  });

  it.each([
    { parameter: 'eventId', kind: 'event' },
    { parameter: 'groupId', kind: 'group' },
    { parameter: 'majorEventId', kind: 'major-event' },
  ])('restores the $kind interests scope from a deep link', ({ parameter, kind }) => {
    TestBed.overrideProvider(ActivatedRoute, {
      useValue: {
        paramMap: of(convertToParamMap({ [parameter]: 'linked-1' })),
        snapshot: { url: [{ path: 'interests' }] },
      },
    });
    const fixture = TestBed.createComponent(SubscriptionsPageComponent);
    expect(fixture.componentInstance.interestsMode()).toBe(true);
    expect(fixture.componentInstance.context()).toEqual({ kind, id: 'linked-1' });
    expect(workspace.closeLiveUpdates).toHaveBeenCalled();
    expect(receiptApi.watchQueue).not.toHaveBeenCalled();
  });

  it.each(['event', 'major-event', 'group'] as const)('preserves the %s scope in the interests link', (kind) => {
    const fixture = TestBed.createComponent(SubscriptionsPageComponent);
    fixture.componentInstance.context.set({ kind, id: 'selected-1' });
    expect(fixture.componentInstance.interestsLink()).toEqual(['/subscriptions', kind, 'selected-1', 'interests']);
    expect(fixture.componentInstance.subscriptionsLink()).toEqual(kind === 'group'
      ? ['/subscriptions'] : ['/subscriptions', kind, 'selected-1']);
  });

  it('opens one stream for the selected major event and updates the badge to zero', async () => {
    const restoreEventSource = installFakeEventSource();
    try {
      const fixture = TestBed.createComponent(SubscriptionsPageComponent);
      fixture.detectChanges();
      await flushAsync();

      expect(receiptApi.watchQueue).toHaveBeenCalledOnce();
      expect(receiptApi.watchQueue).toHaveBeenCalledWith('major-event-1');
      const source = FakeEventSource.instances[0] as FakeEventSource;
      source.emitMessage({ pendingCount: 3, items: [] });
      await flushAsync();
      expect(pendingCount(fixture.componentInstance)).toBe(3);

      source.emitMessage({ pendingCount: 0, items: [] });
      await flushAsync();
      expect(pendingCount(fixture.componentInstance)).toBe(0);
    } finally {
      restoreEventSource();
    }
  });

  it('closes the old queue stream and opens only the new selected scope', async () => {
    const restoreEventSource = installFakeEventSource();
    try {
      const fixture = TestBed.createComponent(SubscriptionsPageComponent);
      fixture.detectChanges();
      await flushAsync();
      const firstSource = FakeEventSource.instances[0] as FakeEventSource;

      workspace.majorEventForm.controls.majorEventId.setValue('major-event-2');
      await flushAsync();

      expect(firstSource.close).toHaveBeenCalledOnce();
      expect(receiptApi.watchQueue).toHaveBeenNthCalledWith(2, 'major-event-2');
      expect(FakeEventSource.instances).toHaveLength(2);
    } finally {
      restoreEventSource();
    }
  });

  it('closes the selected queue stream when the page is destroyed', async () => {
    const restoreEventSource = installFakeEventSource();
    try {
      const fixture = TestBed.createComponent(SubscriptionsPageComponent);
      fixture.detectChanges();
      await flushAsync();
      const source = FakeEventSource.instances[0] as FakeEventSource;

      fixture.destroy();

      expect(source.close).toHaveBeenCalledOnce();
      expect(workspace.closeLiveUpdates).toHaveBeenCalledOnce();
    } finally {
      restoreEventSource();
    }
  });

  it('uses one authenticated HTTP fallback and reconnects after a terminal stream error', async () => {
    const restoreEventSource = installFakeEventSource();
    try {
      const fixture = TestBed.createComponent(SubscriptionsPageComponent);
      fixture.detectChanges();
      await flushAsync();
      const firstSource = FakeEventSource.instances[0] as FakeEventSource;
      firstSource.emitMessage({ pendingCount: 5, items: [] });
      await flushAsync();
      receiptApi.getQueue.mockReturnValueOnce(of({ pendingCount: 7, items: [] }));

      firstSource.readyState = FakeEventSource.CLOSED;
      firstSource.emitError();
      await flushAsync();

      expect(receiptApi.getQueue).toHaveBeenCalledOnce();
      expect(receiptApi.getQueue).toHaveBeenCalledWith('major-event-1');
      expect(pendingCount(fixture.componentInstance)).toBe(7);
      expect(FakeEventSource.instances).toHaveLength(2);
    } finally {
      restoreEventSource();
    }
  });

  it('retains the previous count when fallback HTTP fails and still reconnects', async () => {
    const restoreEventSource = installFakeEventSource();
    try {
      const fixture = TestBed.createComponent(SubscriptionsPageComponent);
      fixture.detectChanges();
      await flushAsync();
      const firstSource = FakeEventSource.instances[0] as FakeEventSource;
      firstSource.emitMessage({ pendingCount: 4, items: [] });
      await flushAsync();
      receiptApi.getQueue.mockReturnValueOnce(throwError(() => new Error('Sessão indisponível')));

      firstSource.readyState = FakeEventSource.CLOSED;
      firstSource.emitError();
      await flushAsync();

      expect(pendingCount(fixture.componentInstance)).toBe(4);
      expect(FakeEventSource.instances).toHaveLength(2);
    } finally {
      restoreEventSource();
    }
  });

  it('does not open a queue stream without permission or a selected target', async () => {
    const restoreEventSource = installFakeEventSource();
    permissions.has.mockReturnValue(false);
    workspace.majorEventForm.controls.majorEventId.setValue('');
    try {
      const fixture = TestBed.createComponent(SubscriptionsPageComponent);
      fixture.detectChanges();
      await flushAsync();

      expect(receiptApi.watchQueue).not.toHaveBeenCalled();
      expect(pendingCount(fixture.componentInstance)).toBe(0);
    } finally {
      restoreEventSource();
    }
  });

  it('keeps the stream field empty after a synchronous subscription error', () => {
    receiptApi.watchQueue.mockReturnValue(throwError(() => new Error('EventSource indisponível')));
    receiptApi.getQueue.mockReturnValue(NEVER);
    const fixture = TestBed.createComponent(SubscriptionsPageComponent);

    fixture.detectChanges();

    expect((fixture.componentInstance as unknown as { receiptQueueStream: unknown }).receiptQueueStream).toBeNull();
  });
});

function queueStream(majorEventId: string) {
  return watchReplayableEventSource(`/test/receipt-queue/${majorEventId}`, {
    decode: (event) => JSON.parse(event.data) as ReceiptValidationQueue,
    errorMessage: 'Não foi possível acompanhar a fila de comprovantes.',
  });
}

function pendingCount(component: SubscriptionsPageComponent): number {
  return (
    component as unknown as {
      selectedMajorEventPendingReceiptsCount: () => number;
    }
  ).selectedMajorEventPendingReceiptsCount();
}
