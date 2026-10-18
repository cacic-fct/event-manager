import { HttpClient, HttpErrorResponse, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AuthRefreshResult, AuthService, authInterceptor } from '@cacic-fct/shared-angular';
import { firstValueFrom, of, throwError } from 'rxjs';

describe('authInterceptor', () => {
  const refreshResult: AuthRefreshResult = {
    expiresAt: Date.now() + 300_000,
    sessionExpiresAt: Date.now() + 600_000,
  };
  let http: HttpClient;
  let httpTesting: HttpTestingController;
  let authService: {
    clearSession: ReturnType<typeof vi.fn>;
    refreshTokenSilently: ReturnType<typeof vi.fn>;
    redirectToOnboarding: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    authService = {
      clearSession: vi.fn(),
      refreshTokenSilently: vi.fn(() => of(refreshResult)),
      redirectToOnboarding: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        {
          provide: AuthService,
          useValue: authService,
        },
      ],
    });

    http = TestBed.inject(HttpClient);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('refreshes once and retries same-origin API requests that return 401', async () => {
    const response = firstValueFrom(http.get<{ ok: true }>('/api/private'));

    httpTesting.expectOne('/api/private').flush({ message: 'expired' }, { status: 401, statusText: 'Unauthorized' });
    httpTesting.expectOne('/api/private').flush({ ok: true });

    await expect(response).resolves.toEqual({ ok: true });
    expect(authService.refreshTokenSilently).toHaveBeenCalledOnce();
    expect(authService.clearSession).not.toHaveBeenCalled();
  });

  it('redirects on the REST onboarding code without refreshing or replaying the request', async () => {
    const response = firstValueFrom(http.post('/api/private', { input: 'original' }));
    httpTesting
      .expectOne('/api/private')
      .flush({ code: 'ONBOARDING_REQUIRED' }, { status: 403, statusText: 'Forbidden' });
    await expect(response).rejects.toBeInstanceOf(HttpErrorResponse);
    expect(authService.redirectToOnboarding).toHaveBeenCalledOnce();
    expect(authService.refreshTokenSilently).not.toHaveBeenCalled();
    expect(authService.clearSession).not.toHaveBeenCalled();
  });

  it.each([{ code: 'ONBOARDING_REQUIRED' }, { code: 'FORBIDDEN', originalError: { code: 'ONBOARDING_REQUIRED' } }])(
    'redirects on GraphQL onboarding errors returned with HTTP 200: %p',
    async (extensions) => {
      const body = { data: null, errors: [{ message: 'Cadastro incompleto.', extensions }] };
      const response = firstValueFrom(http.post('/api/graphql', { query: 'mutation { protectedOperation }' }));
      httpTesting.expectOne('/api/graphql').flush(body);
      await expect(response).resolves.toEqual(body);
      expect(authService.redirectToOnboarding).toHaveBeenCalledOnce();
      expect(authService.refreshTokenSilently).not.toHaveBeenCalled();
    },
  );

  it('handles an onboarding refusal on the retry after refreshing an expired token', async () => {
    const response = firstValueFrom(http.get('/api/private'));
    httpTesting.expectOne('/api/private').flush({}, { status: 401, statusText: 'Unauthorized' });
    httpTesting
      .expectOne('/api/private')
      .flush({ code: 'ONBOARDING_REQUIRED' }, { status: 403, statusText: 'Forbidden' });
    await expect(response).rejects.toBeInstanceOf(HttpErrorResponse);
    expect(authService.redirectToOnboarding).toHaveBeenCalledOnce();
    expect(authService.clearSession).not.toHaveBeenCalled();
  });

  it('does not treat ordinary GraphQL permission denials as onboarding errors', async () => {
    const body = { errors: [{ extensions: { code: 'FORBIDDEN' } }] };
    const response = firstValueFrom(http.post('/api/graphql', { query: '{ privateData }' }));
    httpTesting.expectOne('/api/graphql').flush(body);
    await expect(response).resolves.toEqual(body);
    expect(authService.redirectToOnboarding).not.toHaveBeenCalled();
  });

  it('does not recursively refresh auth endpoint failures', async () => {
    const response = firstValueFrom(http.get('/api/auth/me'));

    httpTesting
      .expectOne('/api/auth/me')
      .flush({ message: 'missing session' }, { status: 401, statusText: 'Unauthorized' });

    await expect(response).rejects.toBeInstanceOf(HttpErrorResponse);
    expect(authService.refreshTokenSilently).not.toHaveBeenCalled();
    expect(authService.clearSession).not.toHaveBeenCalled();
    expect(authService.redirectToOnboarding).not.toHaveBeenCalled();
  });

  it('does not mutate local auth state when an external CACiC integration returns 401', async () => {
    const accountManagerUrl = 'https://account.cacic.com.br/api/privacy/preferences';
    const response = firstValueFrom(http.get(accountManagerUrl));

    httpTesting
      .expectOne(accountManagerUrl)
      .flush({ message: 'unauthorized' }, { status: 401, statusText: 'Unauthorized' });

    await expect(response).rejects.toBeInstanceOf(HttpErrorResponse);
    expect(authService.refreshTokenSilently).not.toHaveBeenCalled();
    expect(authService.clearSession).not.toHaveBeenCalled();
  });

  it.each([
    [403, 'Forbidden'],
    [429, 'Too Many Requests'],
    [500, 'Internal Server Error'],
    [0, 'Unknown Error'],
  ])('does not clear local auth state when the retried business request fails with %s', async (status, statusText) => {
    const response = firstValueFrom(http.get('/api/private'));

    httpTesting.expectOne('/api/private').flush({ message: 'expired' }, { status: 401, statusText: 'Unauthorized' });
    httpTesting.expectOne('/api/private').flush({ message: 'business request failed' }, { status, statusText });

    await expect(response).rejects.toBeInstanceOf(HttpErrorResponse);
    expect(authService.refreshTokenSilently).toHaveBeenCalledOnce();
    expect(authService.clearSession).not.toHaveBeenCalled();
    expect(authService.redirectToOnboarding).not.toHaveBeenCalled();
  });

  it('does not clear local auth state when refresh fails because the provider is temporarily unavailable', async () => {
    const providerFailure = new HttpErrorResponse({
      status: 503,
      statusText: 'Service Unavailable',
      url: '/api/auth/refresh',
    });
    authService.refreshTokenSilently.mockReturnValue(throwError(() => providerFailure));
    const response = firstValueFrom(http.get('/api/private'));

    httpTesting.expectOne('/api/private').flush({ message: 'expired' }, { status: 401, statusText: 'Unauthorized' });

    await expect(response).rejects.toBe(providerFailure);
    expect(authService.clearSession).not.toHaveBeenCalled();
  });

  it('clears local auth state when the refresh endpoint confirms that the session is invalid', async () => {
    const invalidSession = new HttpErrorResponse({
      status: 401,
      statusText: 'Unauthorized',
      url: '/api/auth/refresh',
    });
    authService.refreshTokenSilently.mockReturnValue(throwError(() => invalidSession));
    const response = firstValueFrom(http.get('/api/private'));

    httpTesting.expectOne('/api/private').flush({ message: 'expired' }, { status: 401, statusText: 'Unauthorized' });

    await expect(response).rejects.toBe(invalidSession);
    expect(authService.clearSession).toHaveBeenCalledOnce();
  });
});
