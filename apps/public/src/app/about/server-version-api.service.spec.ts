import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ServerVersionApiService } from './server-version-api.service';

describe('ServerVersionApiService', () => {
  let service: ServerVersionApiService;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ServerVersionApiService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpTesting.verify());

  it('loads the deployed backend version through GraphQL', () => {
    let result: string | undefined;
    service.getServerVersion().subscribe((version) => (result = version));

    const request = httpTesting.expectOne('/api/graphql');
    expect(request.request.body.query).toContain('query ServerVersion');
    request.flush({ data: { serverVersion: '2026-07-19-1' } });

    expect(result).toBe('2026-07-19-1');
  });
});
