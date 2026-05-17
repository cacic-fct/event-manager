import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { MajorEventSubscription } from './subscription';

describe('Subscription', () => {
  let component: MajorEventSubscription;
  let fixture: ComponentFixture<MajorEventSubscription>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MajorEventSubscription],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: of(convertToParamMap({ eventId: 'test-event' })),
            queryParamMap: of(convertToParamMap({})),
            snapshot: {
              paramMap: convertToParamMap({ eventId: 'test-event' }),
              queryParamMap: convertToParamMap({}),
            },
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MajorEventSubscription);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
