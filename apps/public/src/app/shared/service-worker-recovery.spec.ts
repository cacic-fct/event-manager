import { DOCUMENT } from '@angular/common';
import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { ServiceWorkerService } from '@cacic-fct/shared-angular';
import { of } from 'rxjs';

type ServiceWorkerServiceInternals = {
  registerServiceWorker(): Promise<void>;
};

describe('ServiceWorkerService recovery', () => {
  const originalServiceWorker = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker');
  let register: ReturnType<typeof vi.fn>;
  let getRegistrations: ReturnType<typeof vi.fn>;
  let unregister: ReturnType<typeof vi.fn>;
  let service: ServiceWorkerService;

  beforeEach(() => {
    const appDocument = document.implementation.createHTMLDocument('service-worker-recovery');
    const base = appDocument.createElement('base');
    base.href = `${location.origin}/app/`;
    appDocument.head.append(base);

    register = vi.fn();
    getRegistrations = vi.fn();
    unregister = vi.fn().mockResolvedValue(true);

    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        register,
        getRegistration: vi.fn(),
        getRegistrations,
        controller: null,
        addEventListener: vi.fn(),
      } as unknown as ServiceWorkerContainer,
    });

    TestBed.configureTestingModule({
      providers: [
        ServiceWorkerService,
        { provide: DOCUMENT, useValue: appDocument },
        { provide: PLATFORM_ID, useValue: 'browser' },
        {
          provide: MatDialog,
          useValue: {
            open: vi.fn(() => ({ afterClosed: () => of(undefined) })),
          },
        },
      ],
    });

    service = TestBed.inject(ServiceWorkerService);
  });

  afterEach(() => {
    TestBed.resetTestingModule();

    if (originalServiceWorker) {
      Object.defineProperty(navigator, 'serviceWorker', originalServiceWorker);
      return;
    }

    Reflect.deleteProperty(navigator, 'serviceWorker');
  });

  it('unregisters and registers again when an update check fails', async () => {
    const registration = createRegistration(unregister);
    register.mockResolvedValueOnce(registration);
    getRegistrations.mockResolvedValue([registration]);
    registration.update = vi.fn().mockRejectedValue(new Error('worker update failed'));

    await service.updateServiceWorker();

    expect(unregister).toHaveBeenCalledOnce();
    expect(register).toHaveBeenCalledOnce();
  });

  it('does not repeat recovery when the replacement registration also fails', async () => {
    const registration = createRegistration(unregister);
    register.mockRejectedValue(new Error('worker registration failed'));
    getRegistrations.mockResolvedValue([registration]);

    await (service as unknown as ServiceWorkerServiceInternals).registerServiceWorker();

    expect(unregister).toHaveBeenCalledOnce();
    expect(register).toHaveBeenCalledTimes(2);
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
