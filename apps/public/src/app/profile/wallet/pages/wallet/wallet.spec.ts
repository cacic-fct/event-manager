import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { AuthService, ServiceWorkerService } from '@cacic-fct/shared-angular';
import { of, Subject, throwError } from 'rxjs';
import type { TicketRealtimeInvalidation } from '@cacic-fct/shared-ticketing';
import { TotpSeedSessionService } from '../../../../shared/totp/totp-seed-session.service';
import { createWalletStoryTicket, createWalletStoryTotpSeed } from '../../testing/wallet-story-fixtures';
import { parseTicketBarcode } from '@cacic-fct/shared-ticketing';
import { TICKET_FIXTURE_HOLDER_USER_ID } from '@cacic-fct/shared-ticketing/testing';
import { OfflineCodeStateService } from '../../components/offline-code-card/offline-code-state.service';
import { TicketingApiService } from '../../../ticketing/ticketing-api.service';
import { Wallet } from './wallet';

describe('Wallet', () => {
  let component: Wallet;
  let fixture: ComponentFixture<Wallet>;
  let hasServiceWorker: ReturnType<typeof signal<boolean>>;
  let dialog: { open: ReturnType<typeof vi.fn> };
  let printSpy: ReturnType<typeof vi.spyOn>;
  let scrollToSpy: ReturnType<typeof vi.spyOn>;
  let getWalletSeed: ReturnType<typeof vi.fn>;
  let getWalletTickets: ReturnType<typeof vi.fn>;
  let ticketUpdates: Subject<TicketRealtimeInvalidation>;
  let currentWalletUser: ReturnType<typeof signal<{ sub: string; claims: Record<string, unknown> } | null>>;

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
    getWalletTickets = vi.fn(() => of([]));
    ticketUpdates = new Subject<TicketRealtimeInvalidation>();
    currentWalletUser = signal<{ sub: string; claims: Record<string, unknown> } | null>(null);

    await TestBed.configureTestingModule({
      imports: [Wallet],
      providers: [
        provideRouter([]),
        provideNoopAnimations(),
        {
          provide: AuthService,
          useValue: {
            user: () => currentWalletUser(),
            isAuthenticated: () => Boolean(currentWalletUser()),
          },
        },
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
        {
          provide: TicketingApiService,
          useValue: {
            myWalletTickets: getWalletTickets,
            watchCurrentUser: () => ticketUpdates,
          },
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

  it('clears the previous account ticket and selection when the replacement account load fails', async () => {
    getWalletTickets.mockReturnValue(of([createWalletStoryTicket()]) as never);
    currentWalletUser.set({ sub: 'first-user', claims: {} });
    fixture.detectChanges();
    await fixture.whenStable();
    expect(component.tickets()).toHaveLength(1);
    component.selectedCard.set(`ticket:${component.tickets()[0].id}`);
    component.walletView.set('detail');
    component.showExpiredTickets.set(true);
    getWalletTickets.mockReturnValue(throwError(() => new Error('Unavailable')) as never);

    currentWalletUser.set({ sub: 'second-user', claims: {} });
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.tickets()).toEqual([]);
    expect(component.selectedTicket()).toBeNull();
    expect(component.selectedCard()).toBeNull();
    expect(component.walletView()).toBe('list');
    expect(component.showExpiredTickets()).toBe(false);
  });

  it('preserves the selected ticket when the same account updates its claims', async () => {
    const ticket = createWalletStoryTicket();
    getWalletTickets.mockReturnValue(of([ticket]) as never);
    currentWalletUser.set({ sub: 'same-user', claims: {} });
    fixture.detectChanges();
    await fixture.whenStable();
    component.selectedCard.set(`ticket:${ticket.id}`);
    component.walletView.set('detail');
    currentWalletUser.set({ sub: 'same-user', claims: { name: 'Updated name' } });
    fixture.detectChanges();
    await fixture.whenStable();
    expect(component.selectedCard()).toBe(`ticket:${ticket.id}`);
    expect(component.walletView()).toBe('detail');
  });

  it('creates an expired ticket with a valid holder barcode', () => {
    const now = new Date();
    const ticket = createWalletStoryTicket({ status: 'EXPIRED' });
    const barcode = ticket.aztecPayload;

    expect(Date.parse(ticket.effectiveExpiresAt)).toBeLessThan(now.getTime());
    expect(barcode).not.toBeNull();
    if (!barcode) throw new Error('Fixture tickets retain their holder barcode when archived.');
    expect(parseTicketBarcode(barcode)).toEqual({
      ticketId: ticket.id,
      holderUserId: TICKET_FIXTURE_HOLDER_USER_ID,
      userBarcode: `user:${TICKET_FIXTURE_HOLDER_USER_ID}`,
    });
  });

  it('routes the wallet add button to the add-card page', () => {
    const addButton = fixture.nativeElement.querySelector('a[aria-label="Adicionar cartão"]') as HTMLAnchorElement;
    expect(addButton).not.toBeNull();
    expect(addButton.getAttribute('href')).toBe('/profile/wallet/add-card');
    expect(fixture.nativeElement.textContent).not.toContain('Restaurante Universitário');
    expect(component.stackedCards().map((card) => card.selectionId)).toEqual(['offline-code']);
  });

  it('shows only the title and expiry reason and returns from the archived pass', () => {
    const activeTicket = createWalletStoryTicket();
    const usedTicket = createWalletStoryTicket({
      id: '018f47a1-3d5b-7abc-8def-0123456789ac',
      name: 'Kit de boas-vindas',
      status: 'CONSUMED',
    });
    component.tickets.set([activeTicket, usedTicket]);
    fixture.detectChanges();

    expect(component.stackedCards().map((card) => card.selectionId)).toEqual([
      'offline-code',
      `ticket:${activeTicket.id}`,
    ]);
    const archiveToggle = fixture.nativeElement.querySelector('.wallet-ticket-archive > button') as HTMLButtonElement;
    expect(archiveToggle.textContent).toContain('Ver 1 bilhetes expirados');

    archiveToggle.click();
    fixture.detectChanges();

    const archivedRow = fixture.nativeElement.querySelector('button.wallet-expired-ticket') as HTMLButtonElement;
    expect(archivedRow.querySelectorAll('[matListItemTitle], [matListItemLine]')).toHaveLength(2);
    expect(archivedRow.querySelector('[matListItemTitle]')?.textContent?.trim()).toBe('Kit de boas-vindas');
    expect(archivedRow.querySelector('[matListItemLine]')?.textContent?.trim()).toBe('Bilhete já utilizado');
    expect(archivedRow.querySelectorAll('img, mat-icon, time')).toHaveLength(0);

    archivedRow.click();
    fixture.detectChanges();

    expect(component.walletView()).toBe('detail');
    expect(component.selectedCard()).toBe(`ticket:${usedTicket.id}`);
    expect(fixture.nativeElement.querySelector('.ticket-expiration-notice')?.textContent).toContain('Expirado');
    expect(fixture.nativeElement.querySelector('.ticket-expiration-notice')?.textContent).not.toContain(usedTicket.name);
    expect(fixture.nativeElement.querySelector('.ticket-expiration-notice')?.textContent).toContain('Bilhete já utilizado');
    const archivedBarcode = fixture.nativeElement.querySelector('.expired-barcode .barcode-content') as HTMLElement;
    expect(archivedBarcode.getAttribute('aria-hidden')).toBe('true');
    expect(fixture.nativeElement.querySelector('.expired-barcode')).not.toBeNull();

    (fixture.nativeElement.querySelector('.wallet-card-detail app-wallet-card-header button') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(component.walletView()).toBe('list');
    expect(component.selectedCard()).toBeNull();
    expect(fixture.nativeElement.querySelector('button.wallet-expired-ticket')).not.toBeNull();
  });

  it('archives an active ticket at effective expiry without SSE', async () => {
    vi.useFakeTimers();
    const activeTicket = createWalletStoryTicket({
      id: '018f47a1-3d5b-7abc-8def-0123456789ad',
      name: 'Bilhete que expira',
      effectiveExpiresAt: new Date(Date.now() + 1000).toISOString(),
    });
    const usedTicket = createWalletStoryTicket({
      id: '018f47a1-3d5b-7abc-8def-0123456789ae',
      name: 'Kit de boas-vindas',
      status: 'CONSUMED',
    });
    const revokedTicket = createWalletStoryTicket({
      id: '018f47a1-3d5b-7abc-8def-0123456789af',
      name: 'Credencial da palestra',
      status: 'REVOKED',
    });
    const serverSnapshot = [activeTicket, usedTicket, revokedTicket];
    getWalletTickets.mockReturnValue(of(serverSnapshot));
    component.tickets.set(serverSnapshot);
    component.ticketExpiryNow.set(Date.now());
    (component as unknown as { scheduleTicketExpiryRefresh(): void }).scheduleTicketExpiryRefresh();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.wallet-ticket-archive > button')?.textContent).toContain(
      'Ver 2 bilhetes expirados',
    );

    await vi.advanceTimersByTimeAsync(1000);
    fixture.detectChanges();

    expect(component.activeTickets()).toEqual([]);
    expect(component.expiredTickets()).toHaveLength(3);
    expect(fixture.nativeElement.querySelector('.wallet-ticket-archive > button')?.textContent).toContain(
      'Ver 3 bilhetes expirados',
    );
    (fixture.nativeElement.querySelector('.wallet-ticket-archive > button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Prazo de validade encerrado');
    expect(fixture.nativeElement.textContent).toContain('Kit de boas-vindas');
    expect(fixture.nativeElement.textContent).toContain('Credencial da palestra');
    expect(fixture.nativeElement.textContent).toContain('Bilhete já utilizado');
    expect(fixture.nativeElement.textContent).toContain('Bilhete revogado');
    expect(getWalletTickets).toHaveBeenCalled();
  });

  it('keeps an open pass and its faded barcode when the ticket expires during the session', async () => {
    vi.useFakeTimers();
    const ticket = createWalletStoryTicket({
      id: '018f47a1-3d5b-7abc-8def-0123456789b0',
      effectiveExpiresAt: new Date(Date.now() + 1000).toISOString(),
    });
    getWalletTickets.mockReturnValue(of([ticket]));
    component.tickets.set([ticket]);
    component.selectedCard.set(`ticket:${ticket.id}`);
    component.walletView.set('detail');
    component.ticketExpiryNow.set(Date.now());
    (component as unknown as { scheduleTicketExpiryRefresh(): void }).scheduleTicketExpiryRefresh();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.expired-barcode')).toBeNull();

    await vi.advanceTimersByTimeAsync(1000);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.walletView()).toBe('detail');
    expect(fixture.nativeElement.querySelector('.ticket-expiration-notice')?.textContent).toContain('Expirado');
    expect(fixture.nativeElement.querySelector('.ticket-expiration-notice')?.textContent).toContain(
      'Prazo de validade encerrado',
    );
    expect(fixture.nativeElement.querySelector('.expired-barcode .barcode-content')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('returns to the wallet when a transfer removes the selected pass', async () => {
    const ticket = createWalletStoryTicket({ id: '018f47a1-3d5b-7abc-8def-0123456789b1' });
    getWalletTickets.mockReturnValue(of([ticket]));
    currentWalletUser.set({ sub: TICKET_FIXTURE_HOLDER_USER_ID, claims: { name: 'Marina da Silva' } });
    fixture.detectChanges();
    await fixture.whenStable();
    component.tickets.set([ticket]);
    component.selectedCard.set(`ticket:${ticket.id}`);
    component.walletView.set('detail');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.holder-details h2')?.textContent).toContain(ticket.holder?.fullName);

    getWalletTickets.mockReturnValue(of([]));
    ticketUpdates.next({
      revision: 'transfer-accepted-1',
      type: 'TICKETS_CHANGED',
      ticketId: ticket.id,
      changedAt: new Date().toISOString(),
    });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.walletView()).toBe('list');
    expect(component.selectedCard()).toBeNull();
    expect(fixture.nativeElement.querySelector('.wallet-card-detail')).toBeNull();
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
