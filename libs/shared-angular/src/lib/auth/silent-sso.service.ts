import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { PLATFORM_ID, Service, inject } from '@angular/core';

export type SilentSsoResult = 'authenticated' | 'unauthenticated';

type SilentSsoMessage = {
  type: 'cacic-silent-sso-complete';
  href: string;
};

@Service()
export class SilentSsoService {
  private readonly timeoutMs = 15_000;
  private readonly document = inject(DOCUMENT);
  private readonly platformId = inject(PLATFORM_ID);

  check(): Promise<SilentSsoResult> {
    if (!isPlatformBrowser(this.platformId)) {
      return Promise.resolve('unauthenticated');
    }

    const window = this.document.defaultView;
    if (!window || !this.document.body) {
      return Promise.reject(new Error('Silent SSO requires a browser document.'));
    }

    const completionUrl = new URL('silent-check-sso.html', this.getBaseUrl(window));
    const authorizationUrl = new URL('/api/auth/login/redirect', window.location.origin);
    authorizationUrl.searchParams.set('returnTo', completionUrl.pathname);
    authorizationUrl.searchParams.set('prompt', 'none');

    return new Promise<SilentSsoResult>((resolve, reject) => {
      const iframe = this.document.createElement('iframe');
      iframe.hidden = true;
      iframe.title = 'Verificação silenciosa de autenticação';
      iframe.setAttribute('aria-hidden', 'true');

      const cleanup = () => {
        window.clearTimeout(timeoutId);
        window.removeEventListener('message', handleMessage);
        iframe.remove();
      };
      const fail = (error: Error) => {
        cleanup();
        reject(error);
      };
      const handleMessage = (event: MessageEvent<unknown>) => {
        if (event.origin !== window.location.origin || event.source !== iframe.contentWindow) {
          return;
        }

        if (!this.isCompletionMessage(event.data)) {
          return;
        }

        let resultUrl: URL;
        try {
          resultUrl = new URL(event.data.href);
        } catch {
          fail(new Error('Silent SSO returned an invalid completion URL.'));
          return;
        }

        if (resultUrl.origin !== window.location.origin || resultUrl.pathname !== completionUrl.pathname) {
          fail(new Error('Silent SSO returned an unexpected completion URL.'));
          return;
        }

        cleanup();
        resolve(resultUrl.searchParams.get('sso') === 'none' ? 'unauthenticated' : 'authenticated');
      };
      const timeoutId = window.setTimeout(() => fail(new Error('Silent SSO check timed out.')), this.timeoutMs);

      iframe.addEventListener('error', () => fail(new Error('Silent SSO iframe failed to load.')), { once: true });
      window.addEventListener('message', handleMessage);
      iframe.src = authorizationUrl.toString();
      this.document.body.append(iframe);
    });
  }

  private getBaseUrl(window: Window): URL {
    const baseHref = this.document.querySelector('base')?.getAttribute('href') ?? '/';
    return new URL(baseHref, window.location.origin);
  }

  private isCompletionMessage(value: unknown): value is SilentSsoMessage {
    if (typeof value !== 'object' || value === null) {
      return false;
    }

    const message = value as Record<string, unknown>;
    return message['type'] === 'cacic-silent-sso-complete' && typeof message['href'] === 'string';
  }
}
