import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WalletBarcodeComponent } from './barcode';

describe('WalletBarcodeComponent', () => {
  let fixture: ComponentFixture<WalletBarcodeComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WalletBarcodeComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(WalletBarcodeComponent);
  });

  it('renders an Aztec SVG for the wallet user id', () => {
    fixture.componentRef.setInput('value', 'test-user');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('svg')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('path')).not.toBeNull();
  });

  it('renders an empty barcode container when the user id is empty', () => {
    fixture.componentRef.setInput('value', '');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.barcode-content')?.innerHTML).toBe('');
  });

  it('does not inject the user id as markup', () => {
    fixture.componentRef.setInput('value', '<script>alert(1)</script>');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('svg')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('script')).toBeNull();
  });

  it('renders a Code 128 barcode without injecting markup from its value', () => {
    fixture.componentRef.setInput('barcodeType', 'code128');
    fixture.componentRef.setInput('value', '<script>alert(1)</script>');
    fixture.detectChanges();

    const svg = fixture.nativeElement.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg.getAttribute('viewBox')).toBe('0 0 620 122');
    expect(fixture.nativeElement.querySelector('script')).toBeNull();
  });
});
