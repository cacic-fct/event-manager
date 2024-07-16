import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BarcodeScannerPage } from './barcode-scanner.page';

describe('BarcodeScannerPage', () => {
  let component: BarcodeScannerPage;
  let fixture: ComponentFixture<BarcodeScannerPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(BarcodeScannerPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
