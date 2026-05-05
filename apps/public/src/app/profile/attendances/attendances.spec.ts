import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { Attendances } from './attendances';

describe('Attendances', () => {
  let component: Attendances;
  let fixture: ComponentFixture<Attendances>;
  let httpTesting: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Attendances],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    }).compileComponents();

    httpTesting = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(Attendances);
    component = fixture.componentInstance;
    fixture.detectChanges();
    httpTesting.expectOne('/api/graphql').flush({
      data: {
        currentUserMajorEventFeed: [],
        currentUserSubscriptionFeed: {
          items: [],
        },
        currentUserEventAttendances: [],
      },
    });
    await fixture.whenStable();
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
