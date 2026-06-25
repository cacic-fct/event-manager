import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { AuthService } from '@cacic-fct/shared-angular';
import { AnalyticsService } from '../analytics/analytics.service';
import { MajorEvent } from './major-event';
import { MajorEventSubscriptionApiService } from './subscription/subscription-api.service';

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
        {
          provide: AuthService,
          useValue: {
            isAuthenticated: () => false,
            login: vi.fn(),
          },
        },
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: of(convertToParamMap({})),
            snapshot: {
              paramMap: convertToParamMap({}),
            },
          },
        },
        {
          provide: MajorEventSubscriptionApiService,
          useValue: {
            listMajorEvents: vi.fn(() => of([])),
            listCurrentUserSubscriptions: vi.fn(() => of([])),
            getPreviewMajorEvents: vi.fn(() => of({ events: [], expiresAt: new Date().toISOString() })),
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
