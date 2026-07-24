import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { CalendarPreferencesApiService } from './calendar-preferences-api.service';

describe('CalendarPreferencesApiService', () => {
  let httpTesting: HttpTestingController;
  let service: CalendarPreferencesApiService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });

    httpTesting = TestBed.inject(HttpTestingController);
    service = TestBed.inject(CalendarPreferencesApiService);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('loads current user calendar feed settings from GraphQL', async () => {
    const responsePromise = firstValueFrom(service.getSettings());
    const request = httpTesting.expectOne('/api/graphql');

    expect(request.request.body.query).toContain('currentUserCalendarFeedSettings');
    expect(request.request.body.query).toContain('disabledReason');
    expect(request.request.body.query).not.toContain('rotatedAt');
    expect(request.request.body.variables).toBeUndefined();

    request.flush({
      data: {
        currentUserCalendarFeedSettings: settingsFixture(),
      },
    });

    await expect(responsePromise).resolves.toEqual(settingsFixture());
  });

  it('sets current user calendar feed enablement with GraphQL variables', async () => {
    const responsePromise = firstValueFrom(service.setEnabled(true));
    const request = httpTesting.expectOne('/api/graphql');

    expect(request.request.body.query).toContain('setCurrentUserCalendarFeedEnabled');
    expect(request.request.body.variables).toEqual({ enabled: true });

    request.flush({
      data: {
        setCurrentUserCalendarFeedEnabled: settingsFixture({ enabled: true }),
      },
    });

    await expect(responsePromise).resolves.toEqual(settingsFixture({ enabled: true }));
  });

  it('rotates the current user calendar feed key', async () => {
    const responsePromise = firstValueFrom(service.rotateKey());
    const request = httpTesting.expectOne('/api/graphql');

    expect(request.request.body.query).toContain('rotateCurrentUserCalendarFeedKey');

    request.flush({
      data: {
        rotateCurrentUserCalendarFeedKey: settingsFixture({ feedPath: '/api/calendar/feeds/rotated.ics' }),
      },
    });

    await expect(responsePromise).resolves.toEqual(settingsFixture({ feedPath: '/api/calendar/feeds/rotated.ics' }));
  });

  it('throws GraphQL errors from feed operations', async () => {
    const responsePromise = firstValueFrom(service.setEnabled(true));

    httpTesting.expectOne('/api/graphql').flush({
      errors: [{ message: 'Feed indisponível.' }, { message: 'Tente novamente.' }],
    });

    await expect(responsePromise).rejects.toThrow('Feed indisponível.\nTente novamente.');
  });

  it('throws when the GraphQL response is missing data', async () => {
    const responsePromise = firstValueFrom(service.setEnabled(true));

    httpTesting.expectOne('/api/graphql').flush({});

    await expect(responsePromise).rejects.toThrow('Resposta GraphQL sem dados.');
  });
});

function settingsFixture(overrides: Record<string, unknown> = {}) {
  return {
    enabled: false,
    feedPath: '/api/calendar/feeds/user-key.ics',
    disabledAt: null,
    disabledReason: 'STALE_LOGIN',
    ...overrides,
  };
}
