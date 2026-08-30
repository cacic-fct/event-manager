import { WritableSignal, computed, signal } from '@angular/core';
import { createPublicEvent, publicFixtureDateFromNow } from '@cacic-fct/event-manager-public-testing';
import { OralAttendanceDecision, OralAttendancePerson } from '@cacic-fct/shared-angular';
import { FakeEventSource, installFakeEventSource } from '@cacic-fct/shared-angular/testing';
import { NEVER, Subject, of, throwError } from 'rxjs';
import { watchReplayableEventSource } from '@cacic-fct/shared-angular';
import {
  AttendanceCollectionEvent,
  AttendanceCollectionLocation,
  AttendanceScannerFeedItem,
} from '../attendance-collection-api.service';
import { OralAttendancePage } from './oral-page';

type OralDependencies = {
  access: { getPreciseLocation: MockFunction };
  api: { listCollectionEvents: MockFunction; listOralRoster: MockFunction; watchFeed: MockFunction };
  auth: { user: MockFunction };
  collectionEventsQueue: { getCollectionEvent: MockFunction };
  destroyRef: { onDestroy: MockFunction };
  manualQueue: { enqueue: MockFunction };
  network: { isOnline: MockFunction };
  offline: {
    cacheRoster: MockFunction;
    enqueue: MockFunction;
    getRoster: MockFunction;
    listAll: MockFunction;
    watchPending: MockFunction;
  };
  offlineSync: { syncPending: MockFunction };
  router: { navigate: MockFunction };
  snackbar: { open: MockFunction };
};

type MockFunction = {
  (...args: never[]): unknown;
  mockClear: () => void;
  mockReturnValue: (value: unknown) => MockFunction;
  mockReturnValueOnce: (value: unknown) => MockFunction;
  mockResolvedValue: (value: unknown) => MockFunction;
  mockRejectedValue: (value: unknown) => MockFunction;
};

const makeMock = () => vi.fn() as unknown as MockFunction;

const location: AttendanceCollectionLocation = {
  latitude: -22.12,
  longitude: -51.4,
  accuracyMeters: 12,
};

function collectionEvent(shouldAllowOralAttendance = true): AttendanceCollectionEvent {
  return {
    eventId: 'event-oral',
    event: createPublicEvent({
      id: 'event-oral',
      name: 'Evento oral',
      shouldAllowOralAttendance,
      startDate: publicFixtureDateFromNow(0, 13),
      endDate: publicFixtureDateFromNow(0, 16),
    }),
  };
}

function createPage(overrides: Partial<Record<keyof OralDependencies, unknown>> = {}) {
  const event = signal<AttendanceCollectionEvent | null>(collectionEvent());
  const people = signal<OralAttendancePerson[]>([]);
  const decisions = signal<ReadonlyMap<string, OralAttendanceDecision>>(new Map());
  const pendingCount = signal(0);

  const deps: OralDependencies = {
    access: { getPreciseLocation: makeMock().mockResolvedValue(location) },
    api: {
      listCollectionEvents: makeMock().mockReturnValue(of([collectionEvent()])),
      listOralRoster: makeMock().mockReturnValue(of([])),
      watchFeed: makeMock().mockReturnValue(NEVER),
    },
    auth: {
      user: makeMock().mockReturnValue({
        sub: 'collector-1',
        preferredUsername: 'coletor',
        email: 'collector@example.test',
      }),
    },
    collectionEventsQueue: { getCollectionEvent: makeMock().mockResolvedValue(collectionEvent()) },
    destroyRef: { onDestroy: makeMock() },
    manualQueue: { enqueue: makeMock().mockResolvedValue(undefined) },
    network: { isOnline: makeMock().mockReturnValue(true) },
    offline: {
      cacheRoster: makeMock().mockResolvedValue(undefined),
      enqueue: makeMock().mockResolvedValue(undefined),
      getRoster: makeMock().mockResolvedValue([]),
      listAll: makeMock().mockResolvedValue([]),
      watchPending: makeMock().mockReturnValue(of([])),
    },
    offlineSync: { syncPending: makeMock().mockResolvedValue(undefined) },
    router: { navigate: makeMock().mockResolvedValue(true) },
    snackbar: { open: makeMock() },
  };

  for (const [key, value] of Object.entries(overrides)) {
    Object.assign(deps[key as keyof OralDependencies], value);
  }

  const page = Object.create(OralAttendancePage.prototype) as OralAttendancePage;
  Object.assign(page, {
    ...deps,
    route: { snapshot: { paramMap: { get: () => 'event-oral' } } },
    platformId: 'browser',
    event,
    people,
    decisions,
    pendingCount,
    syncLabel: computed(() =>
      !deps.network.isOnline()
        ? `${pendingCount()} alterações salvas off-line`
        : pendingCount()
          ? `${pendingCount()} alterações pendentes`
          : 'Tudo sincronizado',
    ),
  });

  return { page, deps, state: { event, people, decisions, pendingCount } };
}

function stateOf(page: OralAttendancePage) {
  return page as unknown as {
    event: WritableSignal<AttendanceCollectionEvent | null>;
    people: WritableSignal<OralAttendancePerson[]>;
    decisions: WritableSignal<ReadonlyMap<string, OralAttendanceDecision>>;
    pendingCount: WritableSignal<number>;
    syncLabel: () => string;
  };
}

function registerDecision(page: OralAttendancePage, person: OralAttendancePerson, decision: OralAttendanceDecision) {
  return (
    page as unknown as {
      registerDecision: (value: OralAttendancePerson, status: OralAttendanceDecision) => Promise<void>;
    }
  ).registerDecision(person, decision);
}

function registerManual(page: OralAttendancePage, value: string) {
  return (page as unknown as { registerManual: (value: string) => Promise<void> }).registerManual(value);
}

function goBack(page: OralAttendancePage) {
  return (page as unknown as { goBack: () => void }).goBack();
}

describe('OralAttendancePage operations', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('loads the allowed roster, preserves server decisions, overlays unsynced decisions, and caches people', async () => {
    const roster: AttendanceScannerFeedItem[] = [
      {
        personId: 'person-1',
        eventId: 'event-oral',
        fullName: '',
        identityDocument: 'ID-1',
        unespRole: 'STUDENT',
        status: 'PRESENT',
      },
      { personId: 'person-2', eventId: 'event-oral', fullName: 'Pessoa Dois', status: null },
    ];
    const { page, deps, state } = createPage();
    deps.api.listOralRoster.mockReturnValue(of(roster));
    deps.offline.watchPending.mockReturnValue(of([{ personId: 'person-1' }, { personId: 'person-2' }]));
    deps.offline.listAll.mockResolvedValue([
      {
        clientId: 'decision-1',
        queuedByUserId: 'collector-1',
        eventId: 'event-oral',
        personId: 'person-1',
        status: 'ABSENT' as const,
        location,
        collectedAt: publicFixtureDateFromNow(0, 12),
        queuedAt: Date.parse(publicFixtureDateFromNow(0, 12)),
        attempts: 0,
        syncedAt: null,
        lastError: null,
      },
    ]);

    page.ngOnInit();
    await vi.waitFor(() => expect(state.people()).toHaveLength(2));

    expect(state.people()).toEqual([
      { personId: 'person-1', fullName: 'Nome não informado', identityDocument: 'ID-1', unespRole: 'STUDENT' },
      { personId: 'person-2', fullName: 'Pessoa Dois', identityDocument: undefined, unespRole: undefined },
    ]);
    expect(state.decisions()).toEqual(new Map([['person-1', 'ABSENT']]));
    expect(state.pendingCount()).toBe(2);
    expect(deps.offline.cacheRoster).toHaveBeenCalledWith('collector-1', 'event-oral', state.people());
    expect(deps.offlineSync.syncPending).not.toHaveBeenCalled();
  });

  it('merges remote roster snapshots through the existing overlay so unsynced local decisions win', async () => {
    const initialRoster: AttendanceScannerFeedItem[] = [
      { personId: 'person-1', eventId: 'event-oral', fullName: 'Pessoa Um', status: 'PRESENT' },
    ];
    const remoteRoster: AttendanceScannerFeedItem[] = [
      { personId: 'person-1', eventId: 'event-oral', fullName: 'Pessoa Um atualizada', status: 'PRESENT' },
      { personId: 'person-2', eventId: 'event-oral', fullName: 'Pessoa Dois', status: 'ABSENT' },
    ];
    const remoteUpdates = new Subject<AttendanceScannerFeedItem[]>();
    const { page, deps, state } = createPage();
    deps.api.listOralRoster.mockReturnValue(of(initialRoster));
    deps.api.watchFeed.mockReturnValue(remoteUpdates.asObservable());
    deps.offline.listAll.mockResolvedValue([
      {
        clientId: 'decision-1',
        queuedByUserId: 'collector-1',
        eventId: 'event-oral',
        personId: 'person-1',
        status: 'ABSENT' as const,
        location,
        collectedAt: publicFixtureDateFromNow(0, 12),
        queuedAt: Date.parse(publicFixtureDateFromNow(0, 12)),
        attempts: 0,
        syncedAt: null,
        lastError: null,
      },
    ]);

    page.ngOnInit();
    await vi.waitFor(() => expect(deps.api.watchFeed).toHaveBeenCalledWith('event-oral'));

    remoteUpdates.next(remoteRoster);
    await vi.waitFor(() => expect(state.people()).toHaveLength(2));

    expect(state.people()[0]?.fullName).toBe('Pessoa Um atualizada');
    expect(state.decisions()).toEqual(
      new Map([
        ['person-1', 'ABSENT'],
        ['person-2', 'ABSENT'],
      ]),
    );
  });

  it('reloads once after a terminal feed error, keeps the roster, and reconnects a single stream', async () => {
    vi.useFakeTimers();
    installFakeEventSource();
    const roster: AttendanceScannerFeedItem[] = [
      { personId: 'person-1', eventId: 'event-oral', fullName: 'Pessoa Um', status: 'PRESENT' },
    ];
    const { page, deps, state } = createPage();
    deps.api.listOralRoster.mockReturnValueOnce(of(roster)).mockReturnValueOnce(of(roster));
    deps.api.watchFeed.mockReturnValue(
      watchReplayableEventSource('/api/oral-feed', {
        decode: () => null,
        errorMessage: 'Falha no feed.',
      }),
    );

    page.ngOnInit();
    await vi.waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    const firstSource = FakeEventSource.instances[0] as FakeEventSource;
    firstSource.readyState = FakeEventSource.CLOSED;
    firstSource.emitError();

    await vi.waitFor(() => expect(deps.api.listOralRoster).toHaveBeenCalledTimes(2));
    expect(state.people()).toEqual([{ personId: 'person-1', fullName: 'Pessoa Um' }]);
    expect(state.decisions()).toEqual(new Map([['person-1', 'PRESENT']]));

    await vi.advanceTimersByTimeAsync(1000);
    await vi.waitFor(() => expect(FakeEventSource.instances).toHaveLength(2));
    expect(firstSource.close).toHaveBeenCalledOnce();
    expect(deps.api.watchFeed).toHaveBeenCalledTimes(2);
  });

  it.each([
    { label: 'missing event id', routeEventId: null, user: { sub: 'collector-1' } },
    { label: 'missing authenticated collector', routeEventId: 'event-oral', user: null },
  ])('redirects before loading when $label', ({ routeEventId, user }) => {
    const { page, deps } = createPage();
    Object.assign(page, {
      route: { snapshot: { paramMap: { get: () => routeEventId } } },
    });
    deps.auth.user.mockReturnValue(user);

    page.ngOnInit();

    expect(deps.router.navigate).toHaveBeenCalledWith(['/attendance/collect']);
    expect(deps.api.listCollectionEvents).not.toHaveBeenCalled();
  });

  it('redirects when the selected event does not allow oral attendance', () => {
    const { page, deps } = createPage();
    deps.api.listCollectionEvents.mockReturnValue(of([collectionEvent(false)]));

    page.ngOnInit();

    expect(deps.router.navigate).toHaveBeenCalledWith(['/attendance/collect']);
    expect(deps.api.listOralRoster).not.toHaveBeenCalled();
  });

  it('hydrates an allowed event, roster, and saved decisions from offline storage after an API failure', async () => {
    const cachedEvent = collectionEvent(true);
    const cachedPeople: OralAttendancePerson[] = [{ personId: 'person-1', fullName: 'Pessoa cache' }];
    const savedDecision = {
      clientId: 'decision-1',
      queuedByUserId: 'collector-1',
      eventId: 'event-oral',
      personId: 'person-1',
      status: 'PRESENT' as const,
      location,
      collectedAt: publicFixtureDateFromNow(0, 12),
      queuedAt: Date.parse(publicFixtureDateFromNow(0, 12)),
      attempts: 0,
      syncedAt: null,
      lastError: null,
    };
    const { page, deps, state } = createPage();
    deps.api.listCollectionEvents.mockReturnValue(throwError(() => new Error('offline')));
    deps.collectionEventsQueue.getCollectionEvent.mockResolvedValue(cachedEvent);
    deps.offline.getRoster.mockResolvedValue(cachedPeople);
    deps.offline.listAll.mockResolvedValue([savedDecision]);

    page.ngOnInit();
    await vi.waitFor(() => expect(state.people()).toEqual(cachedPeople));

    expect(state.event()).toEqual(cachedEvent);
    expect(state.decisions()).toEqual(new Map([['person-1', 'PRESENT']]));
  });

  it('navigates back to the method screen for the selected event or to collection when empty', () => {
    const { page, deps, state } = createPage();

    goBack(page);
    expect(deps.router.navigate).toHaveBeenCalledWith(['/attendance/collect', 'event-oral', 'method']);

    deps.router.navigate.mockClear();
    state.event.set(null);
    goBack(page);
    expect(deps.router.navigate).toHaveBeenCalledWith(['/attendance/collect']);
  });

  it('records an oral decision with location and keeps the previous decisions map immutable', async () => {
    const person: OralAttendancePerson = { personId: 'person-1', fullName: 'Pessoa' };
    const { page, deps, state } = createPage();
    const previous = new Map<string, OralAttendanceDecision>([['person-2', 'ABSENT']]);
    state.decisions.set(previous);

    await registerDecision(page, person, 'PRESENT');

    expect(state.decisions()).toEqual(
      new Map([
        ['person-2', 'ABSENT'],
        ['person-1', 'PRESENT'],
      ]),
    );
    expect(state.decisions()).not.toBe(previous);
    expect(previous).toEqual(new Map([['person-2', 'ABSENT']]));
    expect(deps.offline.enqueue).toHaveBeenCalledWith({
      queuedByUserId: 'collector-1',
      eventId: 'event-oral',
      personId: 'person-1',
      status: 'PRESENT',
      location,
      collectedAt: expect.any(String),
      lastError: null,
    });
    expect(deps.offlineSync.syncPending).toHaveBeenCalledOnce();
  });

  it('reports oral decision location failures without changing decisions or queue state', async () => {
    const person: OralAttendancePerson = { personId: 'person-1', fullName: 'Pessoa' };
    const { page, deps, state } = createPage();
    deps.access.getPreciseLocation.mockRejectedValue(new Error('Localização bloqueada'));

    await registerDecision(page, person, 'ABSENT');

    expect(state.decisions()).toEqual(new Map());
    expect(deps.offline.enqueue).not.toHaveBeenCalled();
    expect(deps.snackbar.open).toHaveBeenCalledWith(
      'Não foi possível obter sua localização. Tente novamente para registrar a chamada.',
      'Fechar',
      { duration: 5000 },
    );
  });

  it('queues manual attendance with event and collector provenance', async () => {
    const { page, deps } = createPage();

    await registerManual(page, '123456789');

    expect(deps.manualQueue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        queuedByUserId: 'collector-1',
        eventId: 'event-oral',
        eventName: 'Evento oral',
        createdByMethod: 'MANUAL_INPUT',
        value: '123456789',
        location,
        authorUserId: 'collector-1',
        authorName: 'coletor',
        authorEmail: 'collector@example.test',
        status: 'PENDING',
        attempts: 0,
        lastError: null,
        clientId: expect.any(String),
        collectedAt: expect.any(String),
        queuedAt: expect.any(Number),
        updatedAt: expect.any(Number),
      }),
    );
    expect(deps.snackbar.open).toHaveBeenCalledWith(
      'Registro manual salvo. A sincronização continuará em segundo plano.',
      'Fechar',
      { duration: 3200 },
    );
    expect(deps.offlineSync.syncPending).toHaveBeenCalledOnce();
  });

  it('reports manual attendance location failures without queueing', async () => {
    const { page, deps } = createPage();
    deps.access.getPreciseLocation.mockRejectedValue(new Error('Localização bloqueada'));

    await registerManual(page, '123456789');

    expect(deps.manualQueue.enqueue).not.toHaveBeenCalled();
    expect(deps.snackbar.open).toHaveBeenCalledWith(
      'Não foi possível obter sua localização. Tente novamente para registrar a presença.',
      'Fechar',
      { duration: 5000 },
    );
  });

  it('does not collect a decision or manual value when event or user identity is unavailable', async () => {
    const person: OralAttendancePerson = { personId: 'person-1', fullName: 'Pessoa' };
    const { page, deps, state } = createPage();
    state.event.set(null);

    await registerDecision(page, person, 'PRESENT');
    await registerManual(page, '123456789');

    expect(deps.access.getPreciseLocation).not.toHaveBeenCalled();
    expect(deps.offline.enqueue).not.toHaveBeenCalled();
    expect(deps.manualQueue.enqueue).not.toHaveBeenCalled();

    state.event.set(collectionEvent());
    deps.auth.user.mockReturnValue(null);
    await registerDecision(page, person, 'ABSENT');
    await registerManual(page, '123456789');
    expect(deps.access.getPreciseLocation).not.toHaveBeenCalled();
  });

  it('describes pending state according to online and offline network status', () => {
    const offline = createPage();
    offline.state.pendingCount.set(2);
    offline.deps.network.isOnline.mockReturnValue(false);
    expect(stateOf(offline.page).syncLabel()).toBe('2 alterações salvas off-line');

    const online = createPage();
    online.state.pendingCount.set(2);
    expect(stateOf(online.page).syncLabel()).toBe('2 alterações pendentes');

    online.state.pendingCount.set(0);
    expect(stateOf(online.page).syncLabel()).toBe('Tudo sincronizado');
  });
});
