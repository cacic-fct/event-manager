import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { publicFixtureDateFromNow } from '@cacic-fct/event-manager-public-testing';
import { firstValueFrom } from 'rxjs';
import { TotpApiService } from './totp-api.service';

describe('TotpApiService', () => {
  let service: TotpApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(TotpApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('gets the current wallet TOTP seed from the public API', async () => {
    const result = firstValueFrom(service.getSeed());
    const request = http.expectOne('/api/totp/seed');
    const seed = {
      userId: 'user-1',
      seed: 'BASE32SEED',
      algorithm: 'SHA512' as const,
      digits: 6,
      periodSeconds: 30,
      serverTime: publicFixtureDateFromNow(0, 12),
      sessionExpiresAt: Date.parse(publicFixtureDateFromNow(0, 12)) + 60_000,
    };

    expect(request.request.method).toBe('GET');
    expect(request.request.body).toBeNull();
    request.flush(seed);

    await expect(result).resolves.toEqual(seed);
  });

  it('propagates seed endpoint failures without inventing a fallback seed', async () => {
    const result = firstValueFrom(service.getSeed());
    http.expectOne('/api/totp/seed').flush(
      { message: 'Sessão expirada' },
      new HttpErrorResponse({ status: 401, statusText: 'Unauthorized' }),
    );

    await expect(result).rejects.toMatchObject({ status: 401, statusText: 'Unauthorized' });
  });
});
