import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AnalyticsService } from '../analytics/analytics.service';
import { MajorEvent } from './major-event';

describe('MajorEvent', () => {
  let component: MajorEvent;
  let fixture: ComponentFixture<MajorEvent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MajorEvent],
      providers: [
        {
          provide: AnalyticsService,
          useValue: {
            trackEvent: vi.fn(),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MajorEvent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
