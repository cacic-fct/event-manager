import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { DefaultRedirectApiService } from './default-redirect-api.service';

describe('DefaultRedirectApiService', () => {
  let httpTesting: HttpTestingController;
  let service: DefaultRedirectApiService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });

    httpTesting = TestBed.inject(HttpTestingController);
    service = TestBed.inject(DefaultRedirectApiService);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('accepts a redirect route from the shared contract', async () => {
    const responsePromise = firstValueFrom(service.getCurrentUserDefaultRedirect());

    httpTesting.expectOne('/api/graphql').flush({
      data: { currentUserDefaultRedirect: 'WALLET' },
    });

    await expect(responsePromise).resolves.toBe('WALLET');
  });

  it('rejects a redirect route outside the shared contract', async () => {
    const responsePromise = firstValueFrom(service.getCurrentUserDefaultRedirect());

    httpTesting.expectOne('/api/graphql').flush({
      data: { currentUserDefaultRedirect: 'CORRUPTED_ROUTE' },
    });

    await expect(responsePromise).rejects.toThrow('Resposta GraphQL com rota de redirecionamento inválida.');
  });
});
