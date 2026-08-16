import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { ServiceWorkerService } from '@cacic-fct/shared-angular';
import { of } from 'rxjs';
import { TotpSeedSessionService } from '../../../../shared/totp/totp-seed-session.service';
import { createWalletStoryTotpSeed } from '../../testing/wallet-story-fixtures';
import { OfflineCodeStateService } from '../../components/offline-code-card/offline-code-state.service';
import { Wallet } from './wallet';

describe('Wallet', () => {
  let component: Wallet;
  let fixture: ComponentFixture<Wallet>;
  let hasServiceWorker: ReturnType<typeof signal<boolean>>;
  let dialog: { open: ReturnType<typeof vi.fn> };
  let printSpy: ReturnType<typeof vi.spyOn>;
  let scrollToSpy: ReturnType<typeof vi.spyOn>;
  let getWalletSeed: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    hasServiceWorker = signal(false);
    dialog = {
      open: vi.fn(() => ({
        afterClosed: () => of(true),
      })),
    };
    printSpy = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    getWalletSeed = vi.fn(() => Promise.resolve(createWalletStoryTotpSeed()));

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
        {
          provide: TotpSeedSessionService,
          useValue: { getWalletSeed },
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
    scrollToSpy.mockRestore();
    vi.useRealTimers();
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

  it('returns to the card list after selecting another card', () => {
    component.selectCard('offline-code');
    expect(component.selectedCard()).toBe('offline-code');
    expect(component.walletView()).toBe('selecting');

    component.returnToCardList();
    expect(component.selectedCard()).toBeNull();
    expect(component.walletView()).toBe('list');
  });

  it('preserves the clicked position while moving the card to the top slot', () => {
    vi.useFakeTimers();
    const topCardSlot = fixture.nativeElement.querySelector('.wallet-primary-card') as HTMLElement;
    const selectedCard = fixture.nativeElement.querySelector('.wallet-card-list app-wallet-card') as HTMLElement;
    const animate = vi.fn(() => ({ cancel: vi.fn() })) as unknown as typeof selectedCard.animate;
    Object.defineProperty(selectedCard, 'animate', { configurable: true, value: animate });
    vi.spyOn(selectedCard, 'getBoundingClientRect')
      .mockReturnValueOnce(DOMRect.fromRect({ y: 540 }))
      .mockReturnValue(DOMRect.fromRect({ y: 640 }));
    vi.spyOn(topCardSlot, 'getBoundingClientRect').mockReturnValue(DOMRect.fromRect({ y: 84 }));

    component.selectCard('offline-code');

    expect(scrollToSpy).toHaveBeenCalledWith(window.scrollX, 0);
    expect(animate).toHaveBeenCalledWith([{ transform: 'translateY(-100px)' }, { transform: 'translateY(-556px)' }], {
      duration: 420,
      easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
      fill: 'forwards',
    });

    vi.advanceTimersByTime(420);
    expect(component.walletView()).toBe('detail');
  });

  it('keeps the prepared TOTP state when the selected card enters detail view', async () => {
    const offlineCodeState = fixture.debugElement.injector.get(OfflineCodeStateService);
    const initialState = offlineCodeState.state();

    expect(initialState.status).toBe('ready');
    expect(getWalletSeed).toHaveBeenCalledOnce();

    vi.useFakeTimers();
    component.selectCard('offline-code');
    vi.advanceTimersByTime(420);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.walletView()).toBe('detail');
    expect(getWalletSeed).toHaveBeenCalledOnce();
    expect(offlineCodeState.state()).toBe(initialState);
    expect(fixture.nativeElement.querySelector('.offline-card-email')?.textContent).toContain('marina@unesp.br');
  });

  it('returns to the card list when the expanded card header is selected', () => {
    component.selectedCard.set('offline-code');
    component.walletView.set('detail');

    component.selectCard('offline-code');

    expect(component.selectedCard()).toBeNull();
    expect(component.walletView()).toBe('list');
  });

  it('moves the expanded card back to its original stack position', () => {
    vi.useFakeTimers();
    component.selectedCard.set('offline-code');
    component.walletView.set('detail');
    fixture.detectChanges();
    (component as unknown as { listScrollPosition: number }).listScrollPosition = 320;
    scrollToSpy.mockClear();

    const animate = vi.fn(() => ({ cancel: vi.fn() }));
    Object.defineProperty(HTMLElement.prototype, 'animate', {
      configurable: true,
      value: animate,
    });
    const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      if (this.classList.contains('wallet-card-detail')) return DOMRect.fromRect({ y: 84 });
      if (this.matches('.wallet-card-list app-wallet-card')) return DOMRect.fromRect({ y: 540 });
      return DOMRect.fromRect();
    });

    component.returnToCardList();

    expect(component.walletView()).toBe('closing');
    expect(scrollToSpy).toHaveBeenCalledWith(window.scrollX, 320);
    expect(animate).toHaveBeenCalledWith([{ transform: 'translateY(-456px)' }, { transform: 'translateY(0)' }], {
      duration: 420,
      easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
      fill: 'forwards',
    });

    vi.advanceTimersByTime(420);
    expect(component.selectedCard()).toBeNull();
    expect(component.walletView()).toBe('list');
    rectSpy.mockRestore();
    delete (HTMLElement.prototype as Partial<HTMLElement>).animate;
  });
});
