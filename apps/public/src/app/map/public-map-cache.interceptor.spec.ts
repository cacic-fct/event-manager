import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { publicMapCacheInvalidationInterceptor } from './public-map-cache.interceptor';
import { PublicMapCacheService } from './public-map-cache.service';

describe('publicMapCacheInvalidationInterceptor', () => {
  let http: HttpClient;
  let httpTesting: HttpTestingController;
  let invalidate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    invalidate = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([publicMapCacheInvalidationInterceptor])),
        provideHttpClientTesting(),
        { provide: PublicMapCacheService, useValue: { invalidate } },
      ],
    });
    http = TestBed.inject(HttpClient);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpTesting.verify());

  it('invalidates map cache after any successful GraphQL mutation', async () => {
    const response = firstValueFrom(http.post('/api/graphql', { query: 'mutation Subscribe { subscribe }' }));
    httpTesting.expectOne('/api/graphql').flush({ data: { subscribe: true } });

    await response;
    expect(invalidate).toHaveBeenCalledOnce();
  });

  it.each([
    ['/api/graphql', { query: 'query Events { events { id } }' }],
    ['/api/events', { query: 'mutation Subscribe { subscribe }' }],
    ['/api/graphql', { variables: {} }],
  ])('does not invalidate for a non-mutation request to %s', async (url, body) => {
    const response = firstValueFrom(http.post(url, body));
    httpTesting.expectOne(url).flush({ data: {} });

    await response;
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('does not invalidate when the mutation request fails', async () => {
    const response = firstValueFrom(http.post('/api/graphql', { query: 'mutation Enroll { enroll }' }));
    httpTesting.expectOne('/api/graphql').flush({}, { status: 500, statusText: 'Server Error' });

    await expect(response).rejects.toBeDefined();
    expect(invalidate).not.toHaveBeenCalled();
  });
});
