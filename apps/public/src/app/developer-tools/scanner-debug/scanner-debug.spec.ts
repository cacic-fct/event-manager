import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
import { ScannerDebug } from './scanner-debug';

describe('ScannerDebug', () => {
  let component: ScannerDebug;
  let fixture: ComponentFixture<ScannerDebug>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ScannerDebug],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: of({}),
            queryParamMap: of({}),
            snapshot: {
              paramMap: new Map(),
              queryParamMap: new Map(),
            },
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ScannerDebug);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
