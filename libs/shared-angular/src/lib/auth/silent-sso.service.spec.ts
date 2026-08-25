import '@angular/compiler';
import { DOCUMENT } from '@angular/common';
import { EnvironmentInjector, PLATFORM_ID, createEnvironmentInjector, runInInjectionContext } from '@angular/core';
import { SilentSsoService } from './silent-sso.service';

describe('SilentSsoService', () => {
  const rootEnvironmentInjector = null as unknown as EnvironmentInjector;
  let injector: EnvironmentInjector;

  beforeEach(() => {
    document.head.innerHTML = '<base href="/admin/">';
    document.body.innerHTML = '';
    injector = createEnvironmentInjector(
      [SilentSsoService, { provide: DOCUMENT, useValue: document }, { provide: PLATFORM_ID, useValue: 'browser' }],
      rootEnvironmentInjector,
    );
  });

  afterEach(() => {
    injector.destroy();
    vi.useRealTimers();
  });

  it('checks the existing Keycloak session in a hidden iframe and reports authentication', async () => {
    const service = runInInjectionContext(injector, () => injector.get(SilentSsoService));
    const result = service.check();
    const iframe = requireIframe();
    const authorizationUrl = new URL(iframe.src);

    expect(iframe.hidden).toBe(true);
    expect(authorizationUrl.pathname).toBe('/api/auth/login/redirect');
    expect(authorizationUrl.searchParams.get('prompt')).toBe('none');
    expect(authorizationUrl.searchParams.get('returnTo')).toBe('/admin/silent-check-sso.html');

    dispatchCompletionMessage(iframe, 'http://localhost:3000/admin/silent-check-sso.html');

    await expect(result).resolves.toBe('authenticated');
    expect(document.querySelector('iframe')).toBeNull();
  });

  it('treats Keycloak login_required as an ordinary unauthenticated result', async () => {
    const service = runInInjectionContext(injector, () => injector.get(SilentSsoService));
    const result = service.check();
    const iframe = requireIframe();

    dispatchCompletionMessage(iframe, 'http://localhost:3000/admin/silent-check-sso.html?sso=none');

    await expect(result).resolves.toBe('unauthenticated');
  });

  it('ignores messages that do not come from the silent SSO iframe', async () => {
    vi.useFakeTimers();
    const service = runInInjectionContext(injector, () => injector.get(SilentSsoService));
    const result = service.check();
    const iframe = requireIframe();

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          type: 'cacic-silent-sso-complete',
          href: 'http://localhost:3000/admin/silent-check-sso.html',
        },
        origin: window.location.origin,
        source: window,
      }),
    );
    const rejection = expect(result).rejects.toThrow('Silent SSO check timed out.');
    await vi.advanceTimersByTimeAsync(15_000);

    await rejection;
    expect(iframe.isConnected).toBe(false);
  });

  it('rejects unexpected completion paths so the caller can use the redirect fallback', async () => {
    const service = runInInjectionContext(injector, () => injector.get(SilentSsoService));
    const result = service.check();
    const iframe = requireIframe();

    dispatchCompletionMessage(iframe, 'http://localhost:3000/admin/not-the-sso-callback.html');

    await expect(result).rejects.toThrow('Silent SSO returned an unexpected completion URL.');
  });

  function requireIframe(): HTMLIFrameElement {
    const iframe = document.querySelector('iframe');
    expect(iframe).toBeInstanceOf(HTMLIFrameElement);
    return iframe as HTMLIFrameElement;
  }

  function dispatchCompletionMessage(iframe: HTMLIFrameElement, href: string): void {
    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          type: 'cacic-silent-sso-complete',
          href,
        },
        origin: window.location.origin,
        source: iframe.contentWindow,
      }),
    );
  }
});
