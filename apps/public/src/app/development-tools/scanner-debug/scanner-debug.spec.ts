import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ScannerDebug } from './scanner-debug';

describe('ScannerDebug', () => {
  let component: ScannerDebug;
  let fixture: ComponentFixture<ScannerDebug>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ScannerDebug],
    }).compileComponents();

    fixture = TestBed.createComponent(ScannerDebug);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
