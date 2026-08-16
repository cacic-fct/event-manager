import '@angular/compiler';
import { EnvironmentInjector, PLATFORM_ID, createEnvironmentInjector, runInInjectionContext } from '@angular/core';
import { AuthOnlineStatusService } from './auth-online-status.service';

describe('AuthOnlineStatusService', () => {
  const rootEnvironmentInjector = null as unknown as EnvironmentInjector;

  it('treats server rendering as online without reading browser connectivity', () => {
    const injector = createEnvironmentInjector([{ provide: PLATFORM_ID, useValue: 'server' }], rootEnvironmentInjector);

    try {
      const service = runInInjectionContext(injector, () => new AuthOnlineStatusService());

      expect(service.isOnline()).toBe(true);
    } finally {
      injector.destroy();
    }
  });

  it.each([true, false])('reports navigator connectivity in the browser when onLine is %s', (online) => {
    const injector = createEnvironmentInjector([{ provide: PLATFORM_ID, useValue: 'browser' }], rootEnvironmentInjector);
    const descriptor = Object.getOwnPropertyDescriptor(Navigator.prototype, 'onLine');
    Object.defineProperty(Navigator.prototype, 'onLine', { configurable: true, get: () => online });

    try {
      const service = runInInjectionContext(injector, () => new AuthOnlineStatusService());

      expect(service.isOnline()).toBe(online);
    } finally {
      if (descriptor) {
        Object.defineProperty(Navigator.prototype, 'onLine', descriptor);
      } else {
        Reflect.deleteProperty(Navigator.prototype, 'onLine');
      }
      injector.destroy();
    }
  });
});
