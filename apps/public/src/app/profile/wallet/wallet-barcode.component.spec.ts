import { ComponentFixture, TestBed } from '@angular/core/testing';
import { toSVG } from '@bwip-js/browser';
import { WalletBarcodeComponent } from './wallet-barcode.component';

describe('WalletBarcodeComponent', () => {
  let fixture: ComponentFixture<WalletBarcodeComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WalletBarcodeComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(WalletBarcodeComponent);
  });

  it('renders SVG markup that only uses the barcode whitelist', () => {
    fixture.componentRef.setInput(
      'svg',
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0H10" stroke="#000"/></svg>',
    );
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('svg')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('path')).not.toBeNull();
  });

  it('renders bwip-js Aztec SVG markup', () => {
    fixture.componentRef.setInput(
      'svg',
      toSVG({
        bcid: 'azteccode',
        text: 'user:test-user',
        height: 300,
        width: 300,
        includetext: false,
        textxalign: 'center',
        // @ts-expect-error - bwip-js supports eclevel for azteccode.
        eclevel: '35',
      }),
    );
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('svg')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('path')).not.toBeNull();
  });

  it('rejects SVG markup with executable content', () => {
    fixture.componentRef.setInput(
      'svg',
      '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(1)</script></svg>',
    );
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.barcode-content')?.innerHTML).toBe('');
  });
});
