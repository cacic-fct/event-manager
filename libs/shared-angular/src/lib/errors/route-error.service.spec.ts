import '@angular/compiler';
import { EnvironmentInjector, RESPONSE_INIT, createEnvironmentInjector, runInInjectionContext } from '@angular/core';
import {
  NavigationCancel,
  NavigationCancellationCode,
  NavigationEnd,
  NavigationError,
  RedirectCommand,
  Router,
  UrlTree,
} from '@angular/router';
import { Subject } from 'rxjs';
import { RouteErrorService, type RouteErrorOptions } from './route-error.service';

describe('RouteErrorService', () => {
  const rootEnvironmentInjector = null as unknown as EnvironmentInjector;
  let injector: EnvironmentInjector;
  let events: Subject<unknown>;
  let router: {
    events: Subject<unknown>;
    parseUrl: ReturnType<typeof vi.fn>;
    currentNavigation: ReturnType<typeof vi.fn>;
    serializeUrl: ReturnType<typeof vi.fn>;
    navigateByUrl: ReturnType<typeof vi.fn>;
    url: string;
  };
  let service: RouteErrorService;

  beforeEach(() => {
    events = new Subject<unknown>();
    router = {
      events,
      parseUrl: vi.fn((url: string) => ({ toString: () => url }) as UrlTree),
      currentNavigation: vi.fn().mockReturnValue(null),
      serializeUrl: vi.fn(),
      navigateByUrl: vi.fn().mockResolvedValue(true),
      url: '/current',
    };
    injector = createEnvironmentInjector(
      [{ provide: Router, useValue: router }, RouteErrorService],
      rootEnvironmentInjector,
    );
    service = runInInjectionContext(injector, () => injector.get(RouteErrorService));
  });

  afterEach(() => {
    injector.destroy();
    events.complete();
  });

  it('creates a query-free error URL and prevents options from leaking across statuses', () => {
    const options: RouteErrorOptions = {
      title: 'Conteúdo privado indisponível.',
      description: 'Este conteúdo não está disponível.',
      actionLabel: 'Voltar aos eventos',
      actionUrl: '/events',
    };

    const tree = service.redirect(404, options);

    expect(router.parseUrl).toHaveBeenCalledWith('/error/404');
    expect(tree.toString()).toBe('/error/404');
    expect(service.take(403)).toEqual({});
    expect(service.take(404)).toEqual({});
  });

  it('returns the matching page options once', () => {
    const options = { title: 'Sem acesso.' } satisfies RouteErrorOptions;
    service.redirect(403, options);

    expect(service.take(403)).toEqual(options);
    expect(service.take(403)).toEqual({});
  });

  it('returns a guard RedirectCommand that keeps the requested address in the browser', () => {
    const extractedUrl = { toString: () => '/events/private' } as UrlTree;
    const options = { title: 'Sem acesso.' } satisfies RouteErrorOptions;
    const requestedAddress = '/events/private?filter=restricted#details';
    router.currentNavigation.mockReturnValue({ extractedUrl });
    router.serializeUrl.mockReturnValue(requestedAddress);

    const command = service.guardRedirect(403, options);

    expect(command).toBeInstanceOf(RedirectCommand);
    expect(command.redirectTo.toString()).toBe('/error/403');
    expect(command.navigationBehaviorOptions).toEqual({
      browserUrl: requestedAddress,
    });
    expect(router.serializeUrl).toHaveBeenCalledWith(extractedUrl);
    expect(service.take(403)).toEqual(options);
  });

  it('can show a visible error URL when preserveUrl is disabled', () => {
    const command = service.guardRedirect(404, { preserveUrl: false });

    expect(command.redirectTo.toString()).toBe('/error/404');
    expect(command.navigationBehaviorOptions).toEqual({});
    expect(router.serializeUrl).not.toHaveBeenCalled();
  });

  it('navigates to the error route internally while retaining the requested browser URL', async () => {
    const extractedUrl = { toString: () => '/events/private' } as UrlTree;
    const requestedAddress = '/events/private?section=private';
    router.currentNavigation.mockReturnValue({ extractedUrl });
    router.serializeUrl.mockReturnValue(requestedAddress);

    await expect(service.navigate(403, { title: 'Sem acesso.' })).resolves.toBe(true);

    expect(router.navigateByUrl).toHaveBeenCalledWith(expect.objectContaining({ toString: expect.any(Function) }), {
      browserUrl: requestedAddress,
      replaceUrl: true,
    });
    expect(service.take(403)).toEqual({ title: 'Sem acesso.' });
  });

  it('falls back to the current router URL when no navigation is active', () => {
    router.url = '/events/current?view=mine';

    const command = service.guardRedirect(503);

    expect(command.navigationBehaviorOptions).toEqual({
      browserUrl: '/events/current?view=mine',
    });
  });

  it('clears pending copy when navigation ends or fails', () => {
    for (const event of [
      new NavigationEnd(1, '/private', '/private'),
      new NavigationError(2, '/private', new Error('navigation failed')),
      new NavigationCancel(3, '/private', 'guard rejected', NavigationCancellationCode.GuardRejected),
    ]) {
      service.redirect(403, { title: 'Temporary access copy.' });
      events.next(event);

      expect(service.take(403)).toEqual({});
    }
  });

  it('keeps pending copy through a redirect cancellation so the replacement route can consume it', () => {
    const options = { title: 'Sem acesso.' } satisfies RouteErrorOptions;
    service.redirect(403, options);
    events.next(new NavigationCancel(1, '/private', 'guard redirected', NavigationCancellationCode.Redirect));

    expect(service.take(403)).toEqual(options);
  });

  it('sets the response status and merges the no-cache headers with existing response headers', () => {
    const response: ResponseInit = {
      status: 200,
      headers: new Headers({ 'X-Request-Id': 'request-123', 'Cache-Control': 'public, max-age=60' }),
    };
    const serverInjector = createEnvironmentInjector(
      [
        { provide: Router, useValue: router },
        { provide: RESPONSE_INIT, useValue: response },
        RouteErrorService,
      ],
      rootEnvironmentInjector,
    );

    try {
      const serverService = runInInjectionContext(serverInjector, () => serverInjector.get(RouteErrorService));
      serverService.setResponseStatus(503);
      const headers = new Headers(response.headers);

      expect(response.status).toBe(503);
      expect(headers.get('X-Request-Id')).toBe('request-123');
      expect(headers.get('Cache-Control')).toBe('no-store, max-age=0');
      expect(headers.get('CDN-Cache-Control')).toBe('no-store');
      expect(headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
    } finally {
      serverInjector.destroy();
    }
  });

  it('does nothing when no server response is available', () => {
    expect(() => service.setResponseStatus(404)).not.toThrow();
  });
});
