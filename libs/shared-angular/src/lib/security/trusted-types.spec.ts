import '@angular/compiler';
import { EnvironmentInjector, PLATFORM_ID, createEnvironmentInjector, runInInjectionContext } from '@angular/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  assertTrustedExternalScriptUrl,
  assertTrustedServiceWorkerUrl,
  CacicTrustedTypesService,
  trustedServiceWorkerUrl,
} from './trusted-types';

describe('assertTrustedExternalScriptUrl', () => {
  it('accepts only the external scripts declared in the Trusted Types policy', () => {
    expect(assertTrustedExternalScriptUrl('https://a.cacic.com.br/b.js')).toBe('https://a.cacic.com.br/b.js');
    expect(assertTrustedExternalScriptUrl('https://challenges.cloudflare.com/turnstile/v0/api.js')).toBe(
      'https://challenges.cloudflare.com/turnstile/v0/api.js',
    );
  });

  it('rejects a different path, origin, or protocol', () => {
    expect(() => assertTrustedExternalScriptUrl('https://a.cacic.com.br/other.js')).toThrow(
      'External script URL is not approved',
    );
    expect(() => assertTrustedExternalScriptUrl('https://example.com/b.js')).toThrow(
      'External script URL is not approved',
    );
    expect(() => assertTrustedExternalScriptUrl('http://a.cacic.com.br/b.js')).toThrow(
      'External script URL is not approved',
    );
  });
});

describe('assertTrustedServiceWorkerUrl', () => {
  const serviceWorkerUrl = new URL('/app/cacic-public-worker.js', location.origin).href;

  it('accepts only the same-origin public service worker', () => {
    expect(assertTrustedServiceWorkerUrl(serviceWorkerUrl)).toBe(serviceWorkerUrl);
  });

  it('rejects a different origin, path, query, or fragment', () => {
    expect(() => assertTrustedServiceWorkerUrl('https://example.com/app/cacic-public-worker.js')).toThrow(
      'Service worker URL is not approved',
    );
    expect(() => assertTrustedServiceWorkerUrl(new URL('/app/other-worker.js', location.origin).href)).toThrow(
      'Service worker URL is not approved',
    );
    expect(() => assertTrustedServiceWorkerUrl(`${serviceWorkerUrl}?version=1`)).toThrow(
      'Service worker URL is not approved',
    );
    expect(() => assertTrustedServiceWorkerUrl(`${serviceWorkerUrl}#fragment`)).toThrow(
      'Service worker URL is not approved',
    );
  });
});

describe('trustedServiceWorkerUrl', () => {
  const serviceWorkerUrl = new URL('/app/cacic-public-worker.js', location.origin).href;

  it('returns the approved same-origin service worker URL', () => {
    expect(trustedServiceWorkerUrl(serviceWorkerUrl)).toBe(serviceWorkerUrl);
  });

  it('rejects a different origin, path, query, or fragment', () => {
    expect(() => trustedServiceWorkerUrl('https://example.com/app/cacic-public-worker.js')).toThrow(
      'Service worker URL is not approved',
    );
    expect(() => trustedServiceWorkerUrl(new URL('/app/other-worker.js', location.origin).href)).toThrow(
      'Service worker URL is not approved',
    );
    expect(() => trustedServiceWorkerUrl(`${serviceWorkerUrl}?version=1`)).toThrow(
      'Service worker URL is not approved',
    );
    expect(() => trustedServiceWorkerUrl(`${serviceWorkerUrl}#fragment`)).toThrow(
      'Service worker URL is not approved',
    );
  });
});

describe('CacicTrustedTypesService', () => {
  const rootEnvironmentInjector = null as unknown as EnvironmentInjector;

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not create policies outside the browser', () => {
    const createPolicy = vi.fn();
    vi.stubGlobal('trustedTypes', { createPolicy });

    const service = createService('server');
    service.initialize();

    expect(createPolicy).not.toHaveBeenCalled();
  });

  it('continues when HMR encounters policies created by an earlier module instance', () => {
    const createPolicy = vi.fn(() => {
      throw new TypeError('Policy with name "cacic#external-script" already exists.');
    });
    vi.stubGlobal('trustedTypes', { createPolicy });

    const service = createService('browser');

    expect(() => service.initialize()).not.toThrow();
    service.initialize();
    expect(createPolicy).toHaveBeenCalledTimes(1);
  });

  it('keeps contextual errors for failures other than duplicate policies', () => {
    const createPolicy = vi.fn(() => {
      throw new Error('mock failure');
    });
    vi.stubGlobal('trustedTypes', { createPolicy });

    const service = createService('browser');

    expect(() => service.initialize()).toThrow('Could not initialize the CACiC Trusted Types policies. mock failure');
  });

  function createService(platformId: string): CacicTrustedTypesService {
    const injector = createEnvironmentInjector([{ provide: PLATFORM_ID, useValue: platformId }], rootEnvironmentInjector);

    try {
      return runInInjectionContext(injector, () => new CacicTrustedTypesService());
    } finally {
      injector.destroy();
    }
  }
});
