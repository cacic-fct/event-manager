import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';

import { AztecScannerComponent } from './aztec-scanner.component';

describe('AztecScannerComponent', () => {
  let component: AztecScannerComponent;
  let fixture: ComponentFixture<AztecScannerComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      imports: [AztecScannerComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(AztecScannerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }));

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
