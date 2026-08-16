import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { requestActivityInterceptor } from './request-activity.interceptor';
import { RequestActivityService } from './request-activity.service';

describe('requestActivityInterceptor', () => {
  let httpTesting: HttpTestingController;
  let activity: RequestActivityService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([requestActivityInterceptor])), provideHttpClientTesting()],
    });
    httpTesting = TestBed.inject(HttpTestingController);
    activity = TestBed.inject(RequestActivityService);
  });

  afterEach(() => httpTesting.verify());

  it('tracks overlapping API requests until the final response arrives', () => {
    const http = TestBed.inject(HttpClient);

    http.get('/api/one').subscribe();
    http.get('/api/two').subscribe();
    expect(activity.loading()).toBe(true);

    httpTesting.expectOne('/api/one').flush({ ok: true });
    expect(activity.loading()).toBe(true);

    httpTesting.expectOne('/api/two').flush({ ok: true });
    expect(activity.loading()).toBe(false);
  });

  it('releases activity after an API error and ignores non-API requests', () => {
    const http = TestBed.inject(HttpClient);

    http.get('/assets/config.json').subscribe();
    expect(activity.loading()).toBe(false);
    httpTesting.expectOne('/assets/config.json').flush({});

    http.get('/api/failure').subscribe({ error: () => undefined });
    expect(activity.loading()).toBe(true);
    httpTesting.expectOne('/api/failure').flush('Falha', { status: 503, statusText: 'Unavailable' });
    expect(activity.loading()).toBe(false);
  });
});
