import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject, makeEnvironmentProviders, provideEnvironmentInitializer } from '@angular/core';

const EXTERNAL_SCRIPT_URLS = new Set([
  'https://a.cacic.com.br/b.js',
  'https://a.cacic.com.br/recorder.js',
  'https://challenges.cloudflare.com/turnstile/v0/api.js',
]);
const PUBLIC_SERVICE_WORKER_PATH = '/app/cacic-public-worker.js';

const EXTERNAL_SCRIPT_POLICY_NAME = 'cacic#external-script';
const DEFAULT_POLICY_NAME = 'default';

type TrustedTypesPolicyFactory = {
  createPolicy: (
    name: string,
    rules: {
      createScriptURL: (value: string) => string;
    },
  ) => {
    createScriptURL: (value: string) => string;
  };
};

let externalScriptPolicy: ReturnType<TrustedTypesPolicyFactory['createPolicy']> | null = null;

/**
 * Validates the exact external scripts approved by the frontend CSP.
 *
 * Keep this list and the `event-manager-frontend-security` Traefik middleware
 * aligned whenever a third-party script is intentionally added.
 */
export function assertTrustedExternalScriptUrl(value: string): string {
  const url = new URL(value);

  if (!EXTERNAL_SCRIPT_URLS.has(url.href)) {
    throw new Error(`External script URL is not approved by the Trusted Types policy: ${url.href}`);
  }

  return url.href;
}

/**
 * Produces a TrustedScriptURL in browsers that enforce Trusted Types and a
 * validated string everywhere else.
 */
export function trustedExternalScriptUrl(value: string): string {
  const url = assertTrustedExternalScriptUrl(value);
  return externalScriptPolicy?.createScriptURL(url) ?? url;
}

/**
 * Validates the public app's same-origin service worker script.
 *
 * ServiceWorkerContainer.register() is a Trusted Types script URL sink in
 * browsers that enforce `require-trusted-types-for 'script'`.
 */
export function assertTrustedServiceWorkerUrl(value: string): string {
  const url = new URL(value);

  if (url.origin !== location.origin || url.pathname !== PUBLIC_SERVICE_WORKER_PATH || url.search || url.hash) {
    throw new Error(`Service worker URL is not approved by the Trusted Types policy: ${url.href}`);
  }

  return url.href;
}

/**
 * Produces a TrustedScriptURL for the public app's same-origin service worker.
 */
export function trustedServiceWorkerUrl(value: string): string {
  const url = assertTrustedServiceWorkerUrl(value);
  return externalScriptPolicy?.createScriptURL(url) ?? url;
}

@Injectable({ providedIn: 'root' })
export class CacicTrustedTypesService {
  private readonly platformId = inject(PLATFORM_ID);
  private initialized = false;

  initialize(): void {
    if (this.initialized || !isPlatformBrowser(this.platformId)) {
      return;
    }

    this.initialized = true;

    const trustedTypes = getTrustedTypesPolicyFactory();
    if (!trustedTypes) {
      return;
    }

    const createTrustedScriptUrl = (value: string) => {
      try {
        return assertTrustedExternalScriptUrl(value);
      } catch {
        return assertTrustedServiceWorkerUrl(value);
      }
    };

    try {
      externalScriptPolicy = trustedTypes.createPolicy(EXTERNAL_SCRIPT_POLICY_NAME, {
        createScriptURL: createTrustedScriptUrl,
      });

      // ngx-umami currently assigns its configured script URL directly. The
      // default policy keeps that vetted dependency compatible with enforcement
      // without accepting arbitrary script URLs.
      trustedTypes.createPolicy(DEFAULT_POLICY_NAME, {
        createScriptURL: createTrustedScriptUrl,
      });
    } catch (error: unknown) {
      if (isDuplicateTrustedTypesPolicyError(error)) {
        return;
      }

      this.initialized = false;
      const detail = error instanceof Error ? ` ${error.message}` : '';
      throw new Error(`Could not initialize the CACiC Trusted Types policies.${detail}`);
    }
  }
}

export function provideCacicTrustedTypes() {
  return makeEnvironmentProviders([
    provideEnvironmentInitializer(() => {
      inject(CacicTrustedTypesService).initialize();
    }),
  ]);
}

function isDuplicateTrustedTypesPolicyError(error: unknown): boolean {
  return error instanceof Error && /policy with name .+ already exists/i.test(error.message);
}

function getTrustedTypesPolicyFactory(): TrustedTypesPolicyFactory | null {
  const trustedTypes = Reflect.get(globalThis, 'trustedTypes');

  if (!trustedTypes || typeof trustedTypes !== 'object' || !('createPolicy' in trustedTypes)) {
    return null;
  }

  return trustedTypes as TrustedTypesPolicyFactory;
}
