import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { ServiceWorkerService } from '@cacic-fct/shared-angular';
import { of } from 'rxjs';
import { Wallet } from './wallet';

describe('Wallet', () => {
  let component: Wallet;
  let fixture: ComponentFixture<Wallet>;
  let hasServiceWorker: ReturnType<typeof signal<boolean>>;
  let dialog: { open: ReturnType<typeof vi.fn> };
  let printSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    hasServiceWorker = signal(false);
    dialog = {
      open: vi.fn(() => ({
        afterClosed: () => of(true),
      })),
    };
    printSpy = vi.spyOn(window, 'print').mockImplementation(() => undefined);

    await TestBed.configureTestingModule({
      imports: [Wallet],
      providers: [
        provideRouter([]),
        provideNoopAnimations(),
        {
          provide: ServiceWorkerService,
          useValue: {
            hasServiceWorker,
          },
        },
        {
          provide: MatDialog,
          useValue: dialog,
        },
      ],
    })
      .overrideProvider(MatDialog, { useValue: dialog })
      .compileComponents();

    fixture = TestBed.createComponent(Wallet);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  afterEach(() => {
    printSpy.mockRestore();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('prints immediately when the page is not controlled by a service worker', () => {
    component.print();

    expect(dialog.open).not.toHaveBeenCalled();
    expect(printSpy).toHaveBeenCalledOnce();
  });

  it('asks for confirmation before printing when the page is controlled by a service worker', () => {
    hasServiceWorker.set(true);

    component.print();

    expect(dialog.open).toHaveBeenCalledOnce();
    expect(printSpy).toHaveBeenCalledOnce();
  });
});
