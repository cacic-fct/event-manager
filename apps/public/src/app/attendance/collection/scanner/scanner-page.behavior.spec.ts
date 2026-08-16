import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, Validators } from '@angular/forms';
import { computed, signal } from '@angular/core';
import { createPublicEvent, publicFixtureDateFromNow } from '@cacic-fct/event-manager-public-testing';
import { OfflineAttendanceQueueItem } from '@cacic-fct/public-indexed-db';
import { of, throwError } from 'rxjs';
import { AttendanceCollectionEvent, AttendanceCollectionLocation } from '../attendance-collection-api.service';
import { AttendanceScanner } from './scanner-page';

type ScannerDependencies = {
  access: { getPreciseLocation: MockFunction };
  api: {
    listCollectionEvents: MockFunction;
    listFeed: MockFunction;
    registerManual: MockFunction;
    registerScannerCode: MockFunction;
    watchFeed: MockFunction;
  };
  auth: { user: MockFunction };
  dialog: { open: MockFunction };
  feedback: { show: MockFunction };
  network: { isOnline: MockFunction };
  offlineQueue: {
    enqueue: MockFunction;
    getCollectionEvent: MockFunction;
    remove: MockFunction;
    replaceCollectionEvents: MockFunction;
    retry: MockFunction;
    watchEventItems: MockFunction;
  };
  offlineSync: {
    notifyPendingNow: MockFunction;
    syncPending: MockFunction;
  };
  router: { navigate: MockFunction };
  snackbar: { open: MockFunction };
};

type MockFunction = {
  (...args: never[]): unknown;
  mockClear: () => void;
  mockReturnValue: (value: unknown) => MockFunction;
  mockResolvedValue: (value: unknown) => MockFunction;
  mockRejectedValue: (value: unknown) => MockFunction;
};

const makeMock = () => vi.fn() as unknown as MockFunction;

const location: AttendanceCollectionLocation = {
  latitude: -22.12,
  longitude: -51.4,
  accuracyMeters: 12.4,
};

function collectionEvent(eventId = 'event-1'): AttendanceCollectionEvent {
  return {
    eventId,
    event: createPublicEvent({
      id: eventId,
      name: 'Evento de coleta',
      startDate: publicFixtureDateFromNow(0, 13),
      endDate: publicFixtureDateFromNow(0, 16),
    }),
  };
}

function queueItem(status: OfflineAttendanceQueueItem['status'], clientId = `client-${status.toLowerCase()}`) {
  const queuedAt = Date.parse(publicFixtureDateFromNow(0, 12));
  return {
    clientId,
    queuedByUserId: 'collector-1',
    eventId: 'event-1',
    eventName: 'Evento de coleta',
    createdByMethod: 'SCANNER' as const,
    code: 'QR-CODE',
    location,
    collectedAt: publicFixtureDateFromNow(0, 12),
    queuedAt,
    updatedAt: queuedAt,
    authorUserId: 'collector-1',
    authorName: 'Coletor',
    authorEmail: 'collector@example.test',
    status,
    attempts: 0,
    lastError: null,
  } satisfies OfflineAttendanceQueueItem;
}

function createScanner(overrides: Partial<Record<keyof ScannerDependencies, unknown>> = {}) {
  const queuedAttendances = signal<OfflineAttendanceQueueItem[]>([]);
  const deps: ScannerDependencies = {
    access: { getPreciseLocation: makeMock().mockResolvedValue(location) },
    api: {
      listCollectionEvents: makeMock().mockReturnValue(of([collectionEvent()])),
      listFeed: makeMock().mockReturnValue(of([])),
      registerManual: makeMock().mockReturnValue(
        of({ eventId: 'event-1', personId: 'person-1', attendedAt: publicFixtureDateFromNow(0, 12), category: 'REGULAR' }),
      ),
      registerScannerCode: makeMock().mockReturnValue(
        of({ eventId: 'event-1', personId: 'person-1', attendedAt: publicFixtureDateFromNow(0, 12), category: 'REGULAR' }),
      ),
      watchFeed: makeMock().mockReturnValue(of([])),
    },
    auth: {
      user: makeMock().mockReturnValue({
        sub: 'collector-1',
        preferredUsername: 'preferido',
        email: 'collector@example.test',
        claims: { name: 'Nome do coletor', email: 'claim@example.test' },
      }),
    },
    dialog: { open: makeMock() },
    feedback: { show: makeMock() },
    network: { isOnline: makeMock().mockReturnValue(true) },
    offlineQueue: {
      enqueue: makeMock().mockResolvedValue(undefined),
      getCollectionEvent: makeMock().mockResolvedValue(collectionEvent()),
      remove: makeMock().mockResolvedValue(undefined),
      replaceCollectionEvents: makeMock().mockResolvedValue(undefined),
      retry: makeMock().mockResolvedValue(undefined),
      watchEventItems: makeMock().mockReturnValue(of([])),
    },
    offlineSync: {
      notifyPendingNow: makeMock(),
      syncPending: makeMock().mockResolvedValue(undefined),
    },
    router: { navigate: makeMock().mockResolvedValue(true) },
    snackbar: { open: makeMock() },
  };

  for (const [key, value] of Object.entries(overrides)) {
    Object.assign(deps[key as keyof ScannerDependencies], value);
  }

  const component = Object.create(AttendanceScanner.prototype) as AttendanceScanner;
  Object.assign(component, {
    ...deps,
    route: { snapshot: { paramMap: { get: () => 'event-1' } } },
    destroyRef: { onDestroy: vi.fn() },
    event: signal<AttendanceCollectionEvent | null>(collectionEvent()),
    attendances: signal([]),
    queuedAttendances,
    locationStatus: signal('Solicitando localização precisa.'),
    hasPreciseLocation: signal(false),
    pendingQueueCount: computed(
      () => queuedAttendances().filter((item) => item.status === 'PENDING' || item.status === 'FAILED').length,
    ),
    manualForm: new FormBuilder().nonNullable.group({ value: ['', Validators.required] }),
  });

  return { component, deps, queuedAttendances };
}

function handleScan(component: AttendanceScanner, code: string) {
  return (component as unknown as { handleScan: (value: string) => Promise<void> }).handleScan(code);
}

function registerManual(component: AttendanceScanner) {
  return (component as unknown as { registerManualAttendance: () => Promise<void> }).registerManualAttendance();
}

function syncQueued(component: AttendanceScanner) {
  return (component as unknown as { syncQueuedAttendances: () => Promise<void> }).syncQueuedAttendances();
}

function retryQueued(component: AttendanceScanner, item: OfflineAttendanceQueueItem) {
  return (component as unknown as { retryQueuedAttendance: (value: OfflineAttendanceQueueItem) => Promise<void> }).retryQueuedAttendance(item);
}

function removeQueued(component: AttendanceScanner, item: OfflineAttendanceQueueItem) {
  return (component as unknown as { removeQueuedAttendance: (value: OfflineAttendanceQueueItem) => Promise<void> }).removeQueuedAttendance(item);
}

describe('AttendanceScanner operations', () => {
  it('loads the selected event, filters the realtime feed, caches events, and subscribes to queued items', () => {
    const present = { personId: 'person-1', eventId: 'event-1', status: 'PRESENT' as const };
    const absent = { personId: 'person-2', eventId: 'event-1', status: 'ABSENT' as const };
    const queued = [queueItem('PENDING')];
    const selectedEvent = collectionEvent();
    const { component, deps, queuedAttendances } = createScanner();
    deps.api.listCollectionEvents.mockReturnValue(of([selectedEvent]));
    deps.api.listFeed.mockReturnValue(of([present, absent]));
    deps.api.watchFeed.mockReturnValue(of([present, absent]));
    deps.offlineQueue.watchEventItems.mockReturnValue(of(queued));

    component.ngOnInit();

    expect(component.event()).toEqual(selectedEvent);
    expect(component.attendances()).toEqual([present]);
    expect(queuedAttendances()).toEqual(queued);
    expect(deps.offlineQueue.replaceCollectionEvents).toHaveBeenCalledWith('collector-1', [selectedEvent]);
  });

  it('redirects when the route has no event id', () => {
    const { component, deps } = createScanner();
    Object.assign(component, { route: { snapshot: { paramMap: { get: () => null } } } });

    component.ngOnInit();

    expect(deps.router.navigate).toHaveBeenCalledWith(['/attendance/collect']);
    expect(deps.api.listCollectionEvents).not.toHaveBeenCalled();
  });

  it('loads a cached event when the collection API is unavailable', async () => {
    const cached = collectionEvent();
    const { component, deps } = createScanner();
    deps.api.listCollectionEvents.mockReturnValue(throwError(() => new Error('offline')));
    deps.offlineQueue.getCollectionEvent.mockResolvedValue(cached);

    component.ngOnInit();
    await vi.waitFor(() => expect(component.event()).toEqual(cached));

    expect(deps.snackbar.open).not.toHaveBeenCalledWith('Não foi possível carregar o evento.', 'Fechar', { duration: 3500 });
  });

  it('reports a missing cached event after a collection API failure', async () => {
    const { component, deps } = createScanner();
    deps.api.listCollectionEvents.mockReturnValue(throwError(() => new Error('offline')));
    deps.offlineQueue.getCollectionEvent.mockResolvedValue(null);

    component.ngOnInit();
    await vi.waitFor(() =>
      expect(deps.snackbar.open).toHaveBeenCalledWith('Não foi possível carregar o evento.', 'Fechar', { duration: 3500 }),
    );
  });

  it('registers an online scanner code, maps category feedback, and refreshes the feed', async () => {
    const present = { personId: 'person-1', eventId: 'event-1', status: 'PRESENT' as const };
    const { component, deps } = createScanner();
    deps.api.registerScannerCode.mockReturnValue(
      of({ eventId: 'event-1', personId: 'person-1', attendedAt: publicFixtureDateFromNow(0, 12), category: 'NON_SUBSCRIBED' }),
    );
    deps.api.listFeed.mockReturnValue(of([present]));

    await handleScan(component, 'QR-CODE');

    expect(deps.api.registerScannerCode).toHaveBeenCalledWith('event-1', 'QR-CODE', location);
    expect(deps.feedback.show).toHaveBeenCalledWith('nonSubscribed');
    expect(deps.snackbar.open).toHaveBeenCalledWith('Presença registrada.', 'Fechar', { duration: 2500 });
    expect(component.attendances()).toEqual([present]);
  });

  it('queues scanner input while offline with collector provenance and wakes the sync service', async () => {
    const { component, deps } = createScanner();
    deps.network.isOnline.mockReturnValue(false);

    await handleScan(component, 'QR-CODE');

    expect(deps.api.registerScannerCode).not.toHaveBeenCalled();
    expect(deps.offlineQueue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        queuedByUserId: 'collector-1',
        eventId: 'event-1',
        eventName: 'Evento de coleta',
        createdByMethod: 'SCANNER',
        code: 'QR-CODE',
        location,
        authorUserId: 'collector-1',
        authorName: 'Nome do coletor',
        authorEmail: 'collector@example.test',
        status: 'PENDING',
        attempts: 0,
        lastError: null,
      }),
    );
    expect(deps.feedback.show).toHaveBeenCalledWith('valid');
    expect(deps.offlineSync.notifyPendingNow).toHaveBeenCalledOnce();
    expect(deps.snackbar.open).toHaveBeenCalledWith(
      'Presença salva off-line. Sincronize quando houver conexão.',
      'Fechar',
      { duration: 3500 },
    );
  });

  it('queues scanner input after a network transport failure without losing the original location', async () => {
    const { component, deps } = createScanner();
    deps.api.registerScannerCode.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 0, statusText: 'Offline' })),
    );

    await handleScan(component, 'QR-CODE');

    expect(deps.offlineQueue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ createdByMethod: 'SCANNER', code: 'QR-CODE', location }),
    );
    expect(deps.feedback.show).toHaveBeenCalledWith('valid');
    expect(deps.snackbar.open).not.toHaveBeenCalledWith('Não foi possível registrar a presença.', 'Fechar', {
      duration: 5000,
    });
  });

  it('does not call the API for an invalid manual form', async () => {
    const { component, deps } = createScanner();

    await registerManual(component);

    expect(deps.access.getPreciseLocation).not.toHaveBeenCalled();
    expect(deps.api.registerManual).not.toHaveBeenCalled();
    expect(component.manualForm.controls.value.touched).toBe(true);
  });

  it('registers an online manual value, resets the form, and refreshes the feed', async () => {
    const { component, deps } = createScanner();
    component.manualForm.controls.value.setValue('123456789');

    await registerManual(component);

    expect(deps.api.registerManual).toHaveBeenCalledWith('event-1', '123456789', location);
    expect(component.manualForm.controls.value.value).toBe('');
    expect(deps.feedback.show).toHaveBeenCalledWith('valid');
    expect(deps.snackbar.open).toHaveBeenCalledWith('Presença registrada.', 'Fechar', { duration: 2500 });
  });

  it('queues a manual value while offline and resets the form', async () => {
    const { component, deps } = createScanner();
    deps.network.isOnline.mockReturnValue(false);
    component.manualForm.controls.value.setValue('123456789');

    await registerManual(component);

    expect(deps.api.registerManual).not.toHaveBeenCalled();
    expect(deps.offlineQueue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ createdByMethod: 'MANUAL_INPUT', value: '123456789', location }),
    );
    expect(component.manualForm.controls.value.value).toBe('');
  });

  it('queues a manual value after a network transport failure and resets the form', async () => {
    const { component, deps } = createScanner();
    component.manualForm.controls.value.setValue('123456789');
    deps.api.registerManual.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 0, statusText: 'Offline' })),
    );

    await registerManual(component);

    expect(deps.offlineQueue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ createdByMethod: 'MANUAL_INPUT', value: '123456789', location }),
    );
    expect(component.manualForm.controls.value.value).toBe('');
  });

  it('maps duplicate and invalid registration errors to feedback and dialogs', async () => {
    const duplicate = new HttpErrorResponse({ status: 409, error: { message: 'Presença já registrada.' } });
    const { component, deps } = createScanner();
    deps.api.registerScannerCode.mockReturnValue(throwError(() => duplicate));

    await handleScan(component, 'QR-CODE');

    expect(deps.feedback.show).toHaveBeenCalledWith('duplicate');
    expect(deps.snackbar.open).toHaveBeenCalledWith('Presença já registrada.', 'Fechar', { duration: 5000 });

    deps.feedback.show.mockClear();
    deps.snackbar.open.mockClear();
    deps.api.registerScannerCode.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 400, error: { message: 'Pessoa tem registros duplicados.' } })),
    );

    await handleScan(component, 'QR-CODE');

    expect(deps.feedback.show).toHaveBeenCalledWith('duplicate');
    expect(deps.dialog.open).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ width: 'min(32rem, 94vw)', disableClose: true, data: { message: 'Pessoa tem registros duplicados.' } }),
    );
    expect(deps.snackbar.open).not.toHaveBeenCalled();

    deps.feedback.show.mockClear();
    deps.api.registerScannerCode.mockReturnValue(throwError(() => new Error('Código inválido.')));

    await handleScan(component, 'QR-CODE');

    expect(deps.feedback.show).toHaveBeenCalledWith('invalid');
    expect(deps.snackbar.open).toHaveBeenCalledWith('Código inválido.', 'Fechar', { duration: 5000 });
  });

  it('reports location failures and keeps the precise-location state false', async () => {
    const { component, deps } = createScanner();
    deps.access.getPreciseLocation.mockRejectedValue(new Error('Permita a localização.'));

    await handleScan(component, 'QR-CODE');

    expect(component.hasPreciseLocation()).toBe(false);
    expect(component.locationStatus()).toBe('Permita a localização.');
    expect(deps.feedback.show).toHaveBeenCalledWith('invalid');
    expect(deps.snackbar.open).toHaveBeenCalledWith('Permita a localização.', 'Fechar', { duration: 5000 });
  });

  it('does not queue offline attendance without an authenticated collector', async () => {
    const { component, deps } = createScanner();
    deps.auth.user.mockReturnValue(null);
    deps.network.isOnline.mockReturnValue(false);

    await handleScan(component, 'QR-CODE');

    expect(deps.offlineQueue.enqueue).not.toHaveBeenCalled();
    expect(deps.snackbar.open).toHaveBeenCalledWith('Faça login antes de coletar presença off-line.', 'Fechar', {
      duration: 4500,
    });
  });

  it('synchronizes, retries, and removes queued attendance using the authenticated collector scope', async () => {
    const item = queueItem('FAILED', 'client-1');
    const { component, deps } = createScanner();
    deps.api.listFeed.mockReturnValue(of([]));

    await syncQueued(component);
    await retryQueued(component, item);
    await removeQueued(component, item);

    expect(deps.offlineSync.syncPending).toHaveBeenCalledTimes(2);
    expect(deps.offlineQueue.retry).toHaveBeenCalledWith('collector-1', 'client-1');
    expect(deps.offlineQueue.remove).toHaveBeenCalledWith('collector-1', 'client-1');
    expect(deps.snackbar.open).toHaveBeenCalledWith('Pendência removida.', 'Fechar', { duration: 2500 });
    expect(deps.api.listFeed).toHaveBeenCalledWith('event-1');
  });

  it('counts only pending and failed queue entries and exposes every operation label', () => {
    const { component, queuedAttendances } = createScanner();
    queuedAttendances.set([
      queueItem('PENDING'),
      queueItem('FAILED'),
      queueItem('SYNCING'),
      queueItem('DUPLICATE'),
      queueItem('CONFLICT'),
      queueItem('FORBIDDEN'),
    ]);

    expect(component.pendingQueueCount()).toBe(2);

    const labels = component as unknown as {
      methodLabel: (method: string | null | undefined) => string;
      queueStatusLabel: (status: OfflineAttendanceQueueItem['status']) => string;
      roleLabel: (role: string | null | undefined) => string;
    };
    expect(['CSV_IMPORT', 'EVENT_DUPLICATION', 'MANUAL_INPUT', 'ORAL_CALL', 'SCANNER', 'ONLINE_CODE', 'UNKNOWN', null, undefined].map((method) => labels.methodLabel(method))).toEqual([
      'CSV',
      'duplicação de evento',
      'manual',
      'chamada oral',
      'scanner',
      'código online',
      '-',
      '-',
      '-',
    ]);
    expect(['PENDING', 'SYNCING', 'DUPLICATE', 'CONFLICT', 'FORBIDDEN', 'FAILED'].map((status) => labels.queueStatusLabel(status as OfflineAttendanceQueueItem['status']))).toEqual([
      'pendente',
      'sincronizando',
      'já registrada',
      'conflito',
      'sem permissão',
      'falhou',
    ]);
    expect(labels.roleLabel(null)).toBe('-');
  });

  it('returns without side effects when no event is selected', async () => {
    const { component, deps } = createScanner();
    component.event.set(null);

    await handleScan(component, 'QR-CODE');
    await registerManual(component);

    expect(deps.access.getPreciseLocation).not.toHaveBeenCalled();
    expect(deps.api.registerScannerCode).not.toHaveBeenCalled();
    expect(deps.api.registerManual).not.toHaveBeenCalled();
  });
});
