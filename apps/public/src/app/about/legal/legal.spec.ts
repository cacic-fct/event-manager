import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
import { Legal } from './legal';

describe('Licenses', () => {
  let component: Legal;
  let fixture: ComponentFixture<Legal>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Legal],
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

    fixture = TestBed.createComponent(Legal);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
