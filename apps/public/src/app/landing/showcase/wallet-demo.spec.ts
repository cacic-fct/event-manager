import userEvent from '@testing-library/user-event';
import { ComponentFixture, DeferBlockState, TestBed } from '@angular/core/testing';
import { TOTP_PERIOD_SECONDS } from '@cacic-fct/account-manager-m2m-contracts';
import { WalletDemoComponent, walletCodePreviewAt } from './wallet-demo';

describe('WalletDemoComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [WalletDemoComponent] }).compileComponents();
  });

  it('stacks all full cards with the credential in front by default', () => {
    const fixture = createFixture();
    const component = fixture.componentInstance;

    expect(component.selectedCard()).toBeNull();
    expect(headerButton(fixture, 'credential').getAttribute('aria-pressed')).toBe('false');
    expect(headerButton(fixture, 'ticket').getAttribute('aria-pressed')).toBe('false');
    expect(headerButton(fixture, 'offline').getAttribute('aria-pressed')).toBe('false');
    expect(card(fixture, 'offline').style.transform).toBe('translateY(0px)');
    expect(card(fixture, 'ticket').style.transform).toBe('translateY(56px)');
    expect(card(fixture, 'credential').style.transform).toBe('translateY(112px)');

    for (const cardId of ['offline', 'ticket', 'credential']) {
      expect(body(fixture, cardId).hasAttribute('hidden')).toBe(false);
      expect(card(fixture, cardId).hasAttribute('inert')).toBe(false);
    }
  });

  it('moves the same fixed-size ticket card to the front and restores the stack when closed', () => {
    const fixture = createFixture();
    const ticketButton = headerButton(fixture, 'ticket');
    const heightsBeforeSelection = Array.from(
      fixture.nativeElement.querySelectorAll('.wallet-card') as NodeListOf<HTMLElement>,
      (element) => getComputedStyle(element).height,
    );

    ticketButton.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.selectedCard()).toBe('ticket');
    expect(card(fixture, 'ticket').style.transform).toBe('translateY(0px)');
    expect(card(fixture, 'offline').style.transform).toBe('translateY(600px)');
    expect(card(fixture, 'credential').style.transform).toBe('translateY(656px)');
    expect(headerButton(fixture, 'ticket').getAttribute('aria-pressed')).toBe('true');
    expect(card(fixture, 'offline').hasAttribute('inert')).toBe(true);
    expect(card(fixture, 'credential').hasAttribute('inert')).toBe(true);
    expect(body(fixture, 'ticket').hasAttribute('hidden')).toBe(false);
    expect(body(fixture, 'credential').hasAttribute('hidden')).toBe(false);
    expect(body(fixture, 'offline').hasAttribute('hidden')).toBe(false);
    expect(
      Array.from(
        fixture.nativeElement.querySelectorAll('.wallet-card') as NodeListOf<HTMLElement>,
        (element) => getComputedStyle(element).height,
      ),
    ).toEqual(heightsBeforeSelection);

    ticketButton.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.selectedCard()).toBeNull();
    expect(card(fixture, 'offline').style.transform).toBe('translateY(0px)');
    expect(card(fixture, 'ticket').style.transform).toBe('translateY(56px)');
    expect(card(fixture, 'credential').style.transform).toBe('translateY(112px)');
    expect(card(fixture, 'credential').hasAttribute('inert')).toBe(false);
    expect(card(fixture, 'offline').hasAttribute('inert')).toBe(false);
    expect(body(fixture, 'credential').hasAttribute('hidden')).toBe(false);
    expect(body(fixture, 'ticket').hasAttribute('hidden')).toBe(false);
  });

  it('opens a card with native keyboard activation', async () => {
    const fixture = createFixture();
    const user = userEvent.setup();
    const offlineButton = headerButton(fixture, 'offline');

    expect(offlineButton.tagName).toBe('BUTTON');
    offlineButton.focus();
    await user.keyboard('{Enter}');
    fixture.detectChanges();

    expect(fixture.componentInstance.selectedCard()).toBe('offline');
    expect(offlineButton.getAttribute('aria-pressed')).toBe('true');
    expect(body(fixture, 'offline').hasAttribute('hidden')).toBe(false);
  });

  it('rotates the fixed example code and countdown by elapsed TOTP periods', () => {
    const periodMs = TOTP_PERIOD_SECONDS * 1000;

    expect(walletCodePreviewAt(0)).toMatchObject({ displayCode: '836 429', secondsRemaining: 30 });
    expect(walletCodePreviewAt(periodMs - 1000)).toMatchObject({ displayCode: '836 429', secondsRemaining: 1 });
    expect(walletCodePreviewAt(periodMs)).toMatchObject({ displayCode: '271 804', secondsRemaining: 30 });
    expect(walletCodePreviewAt(periodMs * 2 + 1000)).toMatchObject({
      displayCode: '590 163',
      secondsRemaining: 29,
    });
    expect(walletCodePreviewAt(periodMs * 3)).toMatchObject({ displayCode: '836 429', secondsRemaining: 30 });
  });

  it('shows the ticket transfer flow and records local completion in the wallet', async () => {
    const fixture = createFixture();
    const user = userEvent.setup();

    await user.click(headerButton(fixture, 'ticket'));
    fixture.detectChanges();
    await user.click(buttonByText(fixture, 'Transferir bilhete'));
    fixture.detectChanges();

    expect(fixture.componentInstance.view()).toBe('transfer');
    const [transferBlock] = await fixture.getDeferBlocks();
    await transferBlock.render(DeferBlockState.Complete);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-landing-ticket-transfer-demo')).not.toBeNull();
    expect(buttonByText(fixture, 'Enviar bilhete')).toBeTruthy();

    await user.click(buttonByText(fixture, 'Enviar bilhete'));
    fixture.detectChanges();
    await user.click(buttonByText(fixture, 'Ver recebimento'));
    fixture.detectChanges();
    await user.click(buttonByText(fixture, 'Receber bilhete'));
    fixture.detectChanges();

    expect(fixture.componentInstance.view()).toBe('transfer');
    expect(fixture.componentInstance.ticketTransferCompleted()).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('Bilhete recebido');
    await user.click(buttonByText(fixture, 'Voltar à carteira'));
    fixture.detectChanges();
    expect(fixture.componentInstance.view()).toBe('cards');
    expect(fixture.nativeElement.textContent).toContain('Transferência concluída');
  });

  it('opens the incoming transfer view from the initial view input', async () => {
    const fixture = TestBed.createComponent(WalletDemoComponent);
    fixture.componentRef.setInput('initialView', 'incoming');
    fixture.detectChanges();
    fixture.detectChanges();

    expect(fixture.componentInstance.view()).toBe('incoming');
    const [transferBlock] = await fixture.getDeferBlocks();
    await transferBlock.render(DeferBlockState.Complete);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Marina Costa quer transferir este bilhete');
    expect(fixture.nativeElement.textContent).toContain('Rafael Almeida');

    await userEvent.click(buttonByText(fixture, 'Voltar à carteira'));
    fixture.detectChanges();

    expect(fixture.componentInstance.view()).toBe('cards');
    expect(fixture.componentInstance.selectedCard()).toBe('ticket');
  });
});

function createFixture(): ComponentFixture<WalletDemoComponent> {
  const fixture = TestBed.createComponent(WalletDemoComponent);
  fixture.detectChanges();
  return fixture;
}

function card(fixture: ComponentFixture<WalletDemoComponent>, cardId: string): HTMLElement {
  const element = fixture.nativeElement.querySelector(`#wallet-card-${cardId}`) as HTMLElement | null;
  if (!element) {
    throw new Error(`Wallet card not found: ${cardId}`);
  }
  return element;
}

function body(fixture: ComponentFixture<WalletDemoComponent>, cardId: string): HTMLElement {
  const element = fixture.nativeElement.querySelector(`#wallet-card-body-${cardId}`) as HTMLElement | null;
  if (!element) {
    throw new Error(`Wallet card body not found: ${cardId}`);
  }
  return element;
}

function headerButton(fixture: ComponentFixture<WalletDemoComponent>, cardId: string): HTMLButtonElement {
  const element = fixture.nativeElement.querySelector(
    `#wallet-card-${cardId} .wallet-card__header`,
  ) as HTMLButtonElement | null;
  if (!element) {
    throw new Error(`Wallet card header not found: ${cardId}`);
  }
  return element;
}

function buttonByText(fixture: ComponentFixture<WalletDemoComponent>, label: string): HTMLButtonElement {
  const buttons = Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[];
  const button = buttons.find((candidate) => {
    const labelClone = candidate.cloneNode(true) as HTMLButtonElement;
    labelClone.querySelectorAll('mat-icon, lib-twemoji').forEach((icon) => icon.remove());
    return labelClone.textContent?.trim().replace(/\s+/g, ' ') === label;
  });
  if (!button) {
    throw new Error(`Wallet button not found: ${label}`);
  }
  return button;
}
