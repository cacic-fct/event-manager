import '@angular/compiler';
import { EnvironmentInjector, PLATFORM_ID, createEnvironmentInjector, runInInjectionContext } from '@angular/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  assertTrustedExternalScriptUrl,
  assertTrustedServiceWorkerUrl,
  assertTrustedWorkerBlobUrl,
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

describe('assertTrustedWorkerBlobUrl', () => {
  it('accepts same-origin blob URLs generated for bundled workers', () => {
    const url = `blob:${location.origin}/openlayers-worker`;

    expect(assertTrustedWorkerBlobUrl(url)).toBe(url);
  });

  it('rejects non-blob and cross-origin worker URLs', () => {
    expect(() => assertTrustedWorkerBlobUrl('https://example.com/worker.js')).toThrow(
      'Worker blob URL is not approved',
    );
    expect(() => assertTrustedWorkerBlobUrl('blob:https://example.com/worker')).toThrow(
      'Worker blob URL is not approved',
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
    expect(() => trustedServiceWorkerUrl(`${serviceWorkerUrl}#fragment`)).toThrow('Service worker URL is not approved');
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
    const createPolicy = vi.fn((name: string) => {
      if (name === 'cacic#external-script') {
        throw new TypeError('Policy with name "cacic#external-script" already exists.');
      }

      return { createScriptURL: (value: string) => value, createScript: (value: string) => value };
    });
    vi.stubGlobal('trustedTypes', { createPolicy });

    const service = createService('browser');

    expect(() => service.initialize()).not.toThrow();
    service.initialize();
    expect(createPolicy).toHaveBeenCalledTimes(2);
  });

  it('continues when another integration already registered the default policy', () => {
    const createPolicy = vi.fn((name: string) => {
      if (name === 'default') {
        throw new TypeError('TrustedTypePolicyFactory.createPolicy: Tried to create a second default policy');
      }

      return { createScriptURL: (value: string) => value };
    });
    vi.stubGlobal('trustedTypes', { createPolicy });

    const service = createService('browser');

    expect(() => service.initialize()).not.toThrow();
    expect(createPolicy).toHaveBeenCalledTimes(2);
  });

  it('does not register a permissive script-content handler', () => {
    const createPolicy = vi.fn(() => ({
      createScriptURL: (value: string) => value,
    }));
    vi.stubGlobal('trustedTypes', { createPolicy });

    const service = createService('browser');

    service.initialize();

    expect(createPolicy.mock.calls[1][1]).not.toHaveProperty('createScript');
  });

  it('allows libraries to clear a DOM host without accepting HTML', () => {
    const createPolicy = vi.fn(
      (
        _name: string,
        rules: {
          createHTML: (value: string) => string;
          createScriptURL: (value: string) => string;
        },
      ) => rules,
    );
    vi.stubGlobal('trustedTypes', { createPolicy });

    const service = createService('browser');
    service.initialize();
    const rules = createPolicy.mock.calls[1]?.[1] as { createHTML: (value: string) => string };

    expect(rules.createHTML('')).toBe('');
    expect(() => rules.createHTML('<img src=x onerror=alert(1)>')).toThrow('Only empty HTML is approved');
  });

  it('allows only approved script URLs and same-origin worker blobs', () => {
    const createPolicy = vi.fn((_name: string, rules: { createScriptURL: (value: string) => string }) => rules);
    vi.stubGlobal('trustedTypes', { createPolicy });

    const service = createService('browser');
    service.initialize();
    const rules = createPolicy.mock.calls[1]?.[1] as { createScriptURL: (value: string) => string };

    expect(rules.createScriptURL(`blob:${location.origin}/openlayers-worker`)).toBe(
      `blob:${location.origin}/openlayers-worker`,
    );
    expect(() => rules.createScriptURL('https://example.com/worker.js')).toThrow('Worker blob URL is not approved');
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
    const injector = createEnvironmentInjector(
      [{ provide: PLATFORM_ID, useValue: platformId }],
      rootEnvironmentInjector,
    );

    try {
      return runInInjectionContext(injector, () => new CacicTrustedTypesService());
    } finally {
      injector.destroy();
    }
  }
});
