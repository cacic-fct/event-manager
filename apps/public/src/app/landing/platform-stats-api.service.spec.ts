import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { PlatformStatsApiService } from './platform-stats-api.service';

describe('PlatformStatsApiService', () => {
  let service: PlatformStatsApiService;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(PlatformStatsApiService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpTesting.verify());

  it('loads public platform stats through GraphQL', () => {
    let result: unknown;
    service.getPublicPlatformStats().subscribe((stats) => (result = stats));

    const request = httpTesting.expectOne('/api/graphql');
    expect(request.request.body.query).toContain('query PublicPlatformStats');
    request.flush({
      data: {
        publicPlatformStats: { peopleCount: 1, eventsCount: 2, majorEventsCount: 3, certificatesCount: 4 },
      },
    });

    expect(result).toEqual({ peopleCount: 1, eventsCount: 2, majorEventsCount: 3, certificatesCount: 4 });
  });
});
