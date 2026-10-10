import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WalletCard } from './wallet-card';
import { WalletCardUser } from './wallet-card.types';
import { createWalletStoryTicket } from '../../testing/wallet-story-fixtures';
import { WalletBarcodeComponent } from '../barcode/barcode';
import { By } from '@angular/platform-browser';
import { WalletEventCard } from './wallet-event-card';

describe('WalletCard', () => {
  let fixture: ComponentFixture<WalletCard>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WalletCard],
    }).compileComponents();

    fixture = TestBed.createComponent(WalletCard);
    fixture.componentRef.setInput('user', {
      userId: 'user-123',
      name: 'Marina da Silva',
      picture: null,
      unespRole: 'aluno-graduacao',
      enrollmentNumber: '00123456',
      identityDocument: '52998224725',
    } satisfies WalletCardUser);
    fixture.detectChanges();
  });

  it('shows the holder identity and formatted credential details', () => {
    const card = fixture.nativeElement as HTMLElement;

    expect(card.querySelector('h1')?.textContent).toContain('Marina da Silva');
    expect(card.querySelector('h2')?.textContent).toContain('Aluno de Ciência da Computação');
    expect(card.querySelector('.identity-document')?.textContent).toContain('529.982.247-25');
    expect(card.querySelector('[aria-label="Código de barras"]')).not.toBeNull();
  });

  it('requests a 512px rendition of Google profile pictures', () => {
    fixture.componentRef.setInput('user', {
      userId: 'user-123',
      name: 'Marina da Silva',
      picture: 'https://lh3.googleusercontent.com/a/test-user=s96-c',
      unespRole: 'aluno-graduacao',
      enrollmentNumber: '00123456',
      identityDocument: '52998224725',
    } satisfies WalletCardUser);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.avatar')?.getAttribute('src')).toBe(
      'https://lh3.googleusercontent.com/a/test-user=s512-c',
    );
  });

  it.each([
    'https://lh3.googleusercontent.com.evil.example/a/test-user=s96-c',
    'https://example.com/lh3.googleusercontent.com/a/test-user=s96-c',
    'http://lh3.googleusercontent.com/a/test-user=s96-c',
  ])('does not resize an untrusted profile picture URL: %s', (picture) => {
    const eventCard = fixture.debugElement.query(By.directive(WalletEventCard)).componentInstance as WalletEventCard;

    expect(eventCard.googlePictureUrl(picture)).toBe(picture);
  });

  it('shows a ticket as its own pass with a raw prefixed payload', () => {
    const ticket = createWalletStoryTicket();
    fixture.componentRef.setInput('ticket', ticket);
    fixture.componentRef.setInput('selectionId', `ticket:${ticket.id}`);
    fixture.detectChanges();

    const card = fixture.nativeElement as HTMLElement;
    expect(card.textContent).toContain(ticket.name);
    expect(card.textContent).toContain(ticket.holder?.fullName);
    expect(card.querySelector('app-wallet-card-header')?.textContent).toContain(ticket.name);
    expect(card.querySelector('.holder-details')?.textContent).toContain('Aluno de Ciência da Computação');
    expect(card.querySelector('.identity-document')?.textContent).toBe('529.982.247-25');
    const barcode = fixture.debugElement.query(By.directive(WalletBarcodeComponent)).componentInstance as WalletBarcodeComponent;
    expect(barcode.value()).toBe(ticket.aztecPayload);
    expect(barcode.payloadPrefix()).toBe('');
  });

  it('shows the holder passport in full on a ticket', () => {
    fixture.componentRef.setInput('ticket', createWalletStoryTicket());
    fixture.componentRef.setInput('user', {
      userId: 'user-123', name: 'Alex Morgan', picture: null,
      unespRole: 'participant', identityDocument: 'XK1234567',
    } satisfies WalletCardUser);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.identity-document')?.textContent).toBe('XK1234567');
  });
});
