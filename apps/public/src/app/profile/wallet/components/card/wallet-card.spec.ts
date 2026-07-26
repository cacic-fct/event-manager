import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WalletCard } from './wallet-card';
import { WalletCardUser } from './wallet-card.types';

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
});
