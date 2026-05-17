import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
import { DevelopmentTools } from './development-tools';

describe('DevelopmentTools', () => {
  let component: DevelopmentTools;
  let fixture: ComponentFixture<DevelopmentTools>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DevelopmentTools],
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

    fixture = TestBed.createComponent(DevelopmentTools);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
