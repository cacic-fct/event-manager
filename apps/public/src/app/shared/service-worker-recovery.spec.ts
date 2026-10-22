import { DOCUMENT } from '@angular/common';
import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NavigationEnd, Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { ServiceWorkerService } from '@cacic-fct/shared-angular';
import { Subject } from 'rxjs';

type ServiceWorkerServiceInternals = {
  registerServiceWorker(): Promise<void>;
  handleCurrentRegistration(registration: ServiceWorkerRegistration): void;
};

describe('ServiceWorkerService recovery', () => {
  const originalServiceWorker = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker');
  let register: ReturnType<typeof vi.fn>;
  let getRegistrations: ReturnType<typeof vi.fn>;
  let unregister: ReturnType<typeof vi.fn>;
  let service: ServiceWorkerService;
  let container: EventTarget & { controller: object | null };
  let navigation: Subject<NavigationEnd>;
  const open = vi.fn();
  const close = vi.fn();
  const setInput = vi.fn();

  beforeEach(() => {
    const appDocument = document.implementation.createHTMLDocument('service-worker-recovery');
    const base = appDocument.createElement('base');
    base.href = `${location.origin}/app/`;
    appDocument.head.append(base);
    Object.defineProperty(appDocument, 'visibilityState', { value: 'visible' });

    vi.stubGlobal('ngDevMode', false);
    navigation = new Subject<NavigationEnd>();
    vi.useFakeTimers();
    vi.clearAllMocks();
    open.mockReturnValue({ close, componentRef: { setInput }, afterClosed: () => new Subject() });
    container = Object.assign(new EventTarget(), { controller: null as object | null });
    register = vi.fn();
    getRegistrations = vi.fn();
    unregister = vi.fn().mockResolvedValue(true);

    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: Object.assign(container, {
        register,
        getRegistration: vi.fn(),
        getRegistrations,
      }),
    });

    TestBed.configureTestingModule({
      providers: [
        ServiceWorkerService,
        { provide: Router, useValue: { events: navigation } },
        { provide: DOCUMENT, useValue: appDocument },
        { provide: PLATFORM_ID, useValue: 'browser' },
        {
          provide: MatDialog,
          useValue: {
            open,
          },
        },
      ],
    });

    service = TestBed.inject(ServiceWorkerService);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
    vi.unstubAllGlobals();

    if (originalServiceWorker) {
      Object.defineProperty(navigator, 'serviceWorker', originalServiceWorker);
      return;
    }

    Reflect.deleteProperty(navigator, 'serviceWorker');
  });

  it('preserves offline support when an update check fails', async () => {
    const registration = createRegistration(unregister);
    navigator.serviceWorker.getRegistration = vi.fn().mockResolvedValue(registration);
    getRegistrations.mockResolvedValue([registration]);
    registration.update = vi.fn().mockRejectedValue(new Error('worker update failed'));

    await service.updateServiceWorker();

    expect(unregister).not.toHaveBeenCalled();
    expect(register).not.toHaveBeenCalled();
    expect(service.state()).toBe('failed');
    expect(open).not.toHaveBeenCalled();
  });

  it('does not repeat recovery when the replacement registration also fails', async () => {
    const registration = createRegistration(unregister);
    register.mockRejectedValue(new Error('worker registration failed'));
    getRegistrations.mockResolvedValue([registration]);

    await (service as unknown as ServiceWorkerServiceInternals).registerServiceWorker();

    expect(unregister).toHaveBeenCalledOnce();
    expect(register).toHaveBeenCalledTimes(2);
  });

  it('reloads an existing client even when the worker skips the waiting state', async () => {
    container.controller = {};
    register.mockResolvedValue(createRegistration(unregister));
    const reload = vi.spyOn(service as unknown as { reload(): void }, 'reload').mockImplementation(() => undefined);
    service.start();
    await Promise.resolve();
    container.controller = {};
    container.dispatchEvent(new Event('controllerchange'));
    container.dispatchEvent(new Event('controllerchange'));
    expect(reload).toHaveBeenCalledTimes(1);
    expect(setInput).toHaveBeenLastCalledWith('phase', 'ready');
  });

  it('does not reload or interrupt on the first installation', async () => {
    register.mockResolvedValue(createRegistration(unregister));
    const reload = vi.spyOn(service as unknown as { reload(): void }, 'reload').mockImplementation(() => undefined);
    service.start();
    await Promise.resolve();
    container.controller = {};
    container.dispatchEvent(new Event('controllerchange'));
    expect(reload).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
  });

  it('keeps one progress dialog open through activation and offers recovery on timeout', async () => {
    container.controller = {};
    const registration = createRegistration(unregister);
    const postMessage = vi.fn();
    Object.assign(registration, { waiting: { postMessage } });
    const internals = service as unknown as ServiceWorkerServiceInternals;
    internals.handleCurrentRegistration(registration);
    internals.handleCurrentRegistration(registration);
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({ disableClose: true }));
    expect(close).not.toHaveBeenCalled();
    expect(postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    await vi.advanceTimersByTimeAsync(90_000);
    expect(close).toHaveBeenCalledOnce();
    expect(service.state()).toBe('failed');
    expect(open).toHaveBeenCalledTimes(2);
    expect(unregister).not.toHaveBeenCalled();
  });

  it('checks on return and reconnection without polling', async () => {
    const registration = createRegistration(unregister);
    register.mockResolvedValue(registration);
    service.start();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(registration.update).not.toHaveBeenCalled();
    TestBed.inject(DOCUMENT).dispatchEvent(new Event('visibilitychange'));
    await Promise.resolve();
    expect(registration.update).toHaveBeenCalledOnce();
    await Promise.resolve();
    window.dispatchEvent(new Event('online'));
    await Promise.resolve();
    expect(registration.update).toHaveBeenCalledTimes(2);
  });

  it('throttles navigation checks', async () => {
    const registration = createRegistration(unregister);
    register.mockResolvedValue(registration);
    service.start();
    await Promise.resolve();
    navigation.next(new NavigationEnd(1, '/events', '/events'));
    expect(registration.update).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(60_000);
    navigation.next(new NavigationEnd(2, '/profile', '/profile'));
    await Promise.resolve();
    navigation.next(new NavigationEnd(3, '/events', '/events'));
    expect(registration.update).toHaveBeenCalledOnce();
  });

  it('does not overlap update checks', async () => {
    const registration = createRegistration(unregister);
    let finishUpdate: (() => void) | undefined;
    registration.update = vi.fn(
      () =>
        new Promise<ServiceWorkerRegistration>((resolve) => {
          finishUpdate = () => resolve(registration);
        }),
    );
    navigator.serviceWorker.getRegistration = vi.fn().mockResolvedValue(registration);
    const firstCheck = service.checkForUpdate();
    await Promise.resolve();
    await service.checkForUpdate();
    expect(registration.update).toHaveBeenCalledOnce();
    finishUpdate?.();
    await firstCheck;
  });

  it('uses only frontend version events to check for a deployment and closes the stream on teardown', async () => {
    const source = Object.assign(new EventTarget(), { close: vi.fn() });
    const eventSource = vi.fn(function () {
      return source;
    });
    vi.stubGlobal('EventSource', eventSource);
    const registration = createRegistration(unregister);
    register.mockResolvedValue(registration);
    service.start('frontend-a');
    await Promise.resolve();
    await Promise.resolve();
    expect(eventSource).toHaveBeenCalledWith(new URL('api/version/events', TestBed.inject(DOCUMENT).baseURI));
    source.dispatchEvent(new MessageEvent('frontend-version', { data: '{invalid' }));
    source.dispatchEvent(new MessageEvent('frontend-version', { data: JSON.stringify({ version: 'frontend-a' }) }));
    source.dispatchEvent(new MessageEvent('backend-version', { data: JSON.stringify({ version: 'backend-b' }) }));
    expect(registration.update).not.toHaveBeenCalled();
    source.dispatchEvent(new MessageEvent('frontend-version', { data: JSON.stringify({ version: 'frontend-b' }) }));
    await Promise.resolve();
    expect(registration.update).toHaveBeenCalledOnce();
    TestBed.resetTestingModule();
    expect(source.close).toHaveBeenCalledOnce();
  });

  it('does not lose a deployment signal that arrives during an update check', async () => {
    const source = new EventTarget();
    vi.stubGlobal(
      'EventSource',
      vi.fn(function () {
        return Object.assign(source, { close: vi.fn() });
      }),
    );
    const registration = createRegistration(unregister);
    register.mockResolvedValue(registration);
    service.start('frontend-a');
    await Promise.resolve();
    await Promise.resolve();
    let finishUpdate: (() => void) | undefined;
    const update = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<ServiceWorkerRegistration>((resolve) => {
            finishUpdate = () => resolve(registration);
          }),
      )
      .mockResolvedValue(registration);
    registration.update = update;
    const firstCheck = service.checkForUpdate();
    source.dispatchEvent(new MessageEvent('frontend-version', { data: JSON.stringify({ version: 'frontend-b' }) }));
    expect(update).toHaveBeenCalledOnce();
    finishUpdate?.();
    await firstCheck;
    await Promise.resolve();
    expect(update).toHaveBeenCalledTimes(2);
  });

  it('unregisters only the application scope and reloads once', async () => {
    const appRegistration = createRegistration(unregister);
    const otherUnregister = vi.fn().mockResolvedValue(true);
    const otherRegistration = createRegistration(otherUnregister, `${location.origin}/other/`);
    getRegistrations.mockResolvedValue([appRegistration, otherRegistration]);
    const reload = vi.spyOn(service as unknown as { reload: () => void }, 'reload').mockImplementation(() => undefined);

    await service.unregisterServiceWorker();

    expect(unregister).toHaveBeenCalledTimes(1);
    expect(otherUnregister).not.toHaveBeenCalled();
    expect(reload).toHaveBeenCalledTimes(1);
    reload.mockRestore();
  });
});

function createRegistration(
  unregister: ReturnType<typeof vi.fn>,
  scope = `${location.origin}/app/`,
): ServiceWorkerRegistration {
  return {
    scope,
    update: vi.fn(),
    unregister,
    addEventListener: vi.fn(),
  } as unknown as ServiceWorkerRegistration;
}
