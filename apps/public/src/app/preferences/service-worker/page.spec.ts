import { PLATFORM_ID, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { provideRouter } from '@angular/router';
import { ServiceWorkerService } from '@cacic-fct/shared-angular';
import { of } from 'rxjs';
import { ServiceWorker, ServiceWorkerUnregisterConfirmDialog } from './page';

type TestComponent = {
  confirmUnregisterServiceWorker: () => void;
};

describe('ServiceWorker', () => {
  let component: ServiceWorker;
  let fixture: ComponentFixture<ServiceWorker>;
  let dialog: { open: ReturnType<typeof vi.fn> };
  let serviceWorkerService: {
    hasServiceWorker: ReturnType<typeof signal<boolean>>;
    state: ReturnType<typeof signal<string>>;
    error: ReturnType<typeof signal<string | null>>;
    updateServiceWorker: ReturnType<typeof vi.fn>;
    unregisterServiceWorker: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    dialog = {
      open: vi.fn().mockReturnValue({
        afterClosed: () => of(false),
      }),
    };
    serviceWorkerService = {
      hasServiceWorker: signal(true),
      state: signal('idle'),
      error: signal(null),
      updateServiceWorker: vi.fn(),
      unregisterServiceWorker: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [ServiceWorker],
      providers: [
        provideRouter([]),
        { provide: PLATFORM_ID, useValue: 'browser' },
        { provide: MatDialog, useValue: dialog },
        { provide: ServiceWorkerService, useValue: serviceWorkerService },
      ],
    })
      .overrideProvider(MatDialog, { useValue: dialog })
      .overrideProvider(ServiceWorkerService, { useValue: serviceWorkerService })
      .compileComponents();

    fixture = TestBed.createComponent(ServiceWorker);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('asks for confirmation before unregistering the Service Worker', () => {
    (component as unknown as TestComponent).confirmUnregisterServiceWorker();

    expect(dialog.open).toHaveBeenCalledWith(ServiceWorkerUnregisterConfirmDialog, {
      width: '420px',
    });
    expect(serviceWorkerService.unregisterServiceWorker).not.toHaveBeenCalled();
  });

  it('unregisters the Service Worker when confirmed', () => {
    dialog.open.mockReturnValueOnce({
      afterClosed: () => of(true),
    });

    (component as unknown as TestComponent).confirmUnregisterServiceWorker();

    expect(serviceWorkerService.unregisterServiceWorker).toHaveBeenCalledTimes(1);
  });
});
