import { provideHttpClient, withFetch } from '@angular/common/http';
import { inject, provideAppInitializer } from '@angular/core';
import { MatIconRegistry } from '@angular/material/icon';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { ActivatedRoute, convertToParamMap, provideRouter, withDisabledInitialNavigation } from '@angular/router';
import { SwUpdate } from '@angular/service-worker';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { AuthService } from '@cacic-fct/shared-angular';
import type { Preview } from '@storybook/angular';
import { applicationConfig } from '@storybook/angular';
import { NEVER, of } from 'rxjs';
import { initialize, mswLoader } from 'msw-storybook-addon';
import { publicHandlers } from './storybook-mocks';

initialize({ onUnhandledRequest: 'bypass' });

const originalNavigatorOnline = Object.getOwnPropertyDescriptor(Navigator.prototype, 'onLine');
const originalServiceWorker = Object.getOwnPropertyDescriptor(Navigator.prototype, 'serviceWorker');

function ensureStorybookGlobalStyles(): void {
  if (document.getElementById('storybook-app-global-styles')) {
    return;
  }

  const style = document.createElement('style');
  style.id = 'storybook-app-global-styles';
  style.textContent = `
    html, body, #storybook-root {
      min-height: 100%;
    }

    body {
      margin: 0;
      font-family: 'Inter Variable', system-ui, sans-serif;
    }

    @font-face {
      font-family: 'Material Icons Outlined';
      font-style: normal;
      font-display: swap;
      font-weight: 400;
      src:
        url('/material-icons-outlined-files/material-icons-outlined-latin-400-normal.woff2') format('woff2'),
        url('/material-icons-outlined-files/material-icons-outlined-latin-400-normal.woff') format('woff');
    }

    .material-icons-outlined {
      font-family: 'Material Icons Outlined';
      font-weight: normal;
      font-style: normal;
      font-size: 24px;
      line-height: 1;
      letter-spacing: normal;
      text-transform: none;
      display: inline-block;
      white-space: nowrap;
      word-wrap: normal;
      direction: ltr;
    }
  `;
  document.head.append(style);
}

class StorybookAuthService {
  readonly user = () => ({
    sub: 'storybook-user',
    preferredUsername: 'storybook',
    email: 'storybook@example.com',
    roles: ['participant'],
    scopes: ['profile', 'email'],
    permissions: ['events:read'],
    claims: {
      name: 'Storybook User',
      preferred_username: 'storybook',
      email: 'storybook@example.com',
      picture: 'https://lh3.googleusercontent.com/a/storybook-user',
      is_onboarded: true,
    },
  });
  readonly roles = () => ['participant'];
  readonly scopes = () => ['profile', 'email'];
  readonly isAuthenticated = () => true;
  initialize = async () => undefined;
  login = async () => undefined;
  logout = async () => undefined;
}

const swUpdateMock = {
  isEnabled: true,
  versionUpdates: NEVER,
  unrecoverable: NEVER,
  checkForUpdate: async () => false,
  activateUpdate: async () => true,
};

const dialogRefMock = {
  close: () => undefined,
};

const storybookRouteParams = {
  certificateId: 'certificate-demo',
  eventId: 'event-1',
  eventType: 'event',
  majorEventId: 'major-1',
};

const storybookQueryParams = {
  certificateId: 'certificate-demo',
  returnUrl: '/menu',
};

const activatedRouteMock = {
  paramMap: of(convertToParamMap(storybookRouteParams)),
  queryParamMap: of(convertToParamMap(storybookQueryParams)),
  snapshot: {
    paramMap: convertToParamMap(storybookRouteParams),
    queryParamMap: convertToParamMap(storybookQueryParams),
    data: {
      id: 'events',
      label: 'Eventos',
      icon: 'event',
      path: 'events',
      requiredScopes: ['events:read'],
    },
  },
};

const publicDialogData = {
  eventName: 'Arquitetura Angular com Signals',
  title: 'Certificados disponíveis',
  targets: [{ scope: 'EVENT', targetId: 'event-1' }],
  majorEvent: {
    id: 'major-dialog',
    name: 'CACiC Storybook',
    emoji: '💻',
    startDate: '2026-05-20T12:00:00.000Z',
    endDate: '2026-05-23T21:00:00.000Z',
    description: 'Evento de demonstração para Storybook.',
    subscriptionStartDate: '2026-05-01T12:00:00.000Z',
    subscriptionEndDate: '2026-05-19T21:00:00.000Z',
    maxCoursesPerAttendee: 2,
    maxLecturesPerAttendee: 8,
    contactType: 'EMAIL',
    contactInfo: 'eventos@example.com',
    shouldIssueCertificate: true,
  },
  events: [
    {
      id: 'event-dialog-1',
      name: 'Arquitetura Angular com Signals',
      creditMinutes: 120,
      startDate: '2026-05-21T17:00:00.000Z',
      endDate: '2026-05-21T19:00:00.000Z',
      emoji: '🧠',
      type: 'MINICURSO',
      shortDescription: 'Signals na prática',
      queueCount: 0,
      locationDescription: 'Laboratório 01',
    },
    {
      id: 'event-dialog-2',
      name: 'Acessibilidade em produtos digitais',
      creditMinutes: 90,
      startDate: '2026-05-22T13:00:00.000Z',
      endDate: '2026-05-22T14:30:00.000Z',
      emoji: '♿',
      type: 'PALESTRA',
      shortDescription: 'Interfaces inclusivas',
      queueCount: 2,
      locationDescription: 'Auditório',
    },
  ],
};

function applyBrowserGlobals(network: string, serviceWorker: string): void {
  Object.defineProperty(Navigator.prototype, 'onLine', {
    configurable: true,
    get: () => network !== 'offline',
  });

  if (serviceWorker === 'disabled') {
    Object.defineProperty(Navigator.prototype, 'serviceWorker', {
      configurable: true,
      get: () => undefined,
    });
    return;
  }

  if (originalServiceWorker) {
    Object.defineProperty(Navigator.prototype, 'serviceWorker', originalServiceWorker);
  }
}

if (originalNavigatorOnline) {
  Object.defineProperty(Navigator.prototype, 'onLine', originalNavigatorOnline);
}

const preview: Preview = {
  decorators: [
    applicationConfig({
      providers: [
        provideHttpClient(withFetch()),
        provideNoopAnimations(),
        provideRouter([], withDisabledInitialNavigation()),
        provideAppInitializer(() => {
          inject(MatIconRegistry).setDefaultFontSetClass('material-icons-outlined');
        }),
        { provide: ActivatedRoute, useValue: activatedRouteMock },
        { provide: MAT_DIALOG_DATA, useValue: publicDialogData },
        { provide: MatDialogRef, useValue: dialogRefMock },
        { provide: AuthService, useClass: StorybookAuthService },
        { provide: SwUpdate, useValue: swUpdateMock },
      ],
    }),
    (story, context) => {
      const theme = context.globals['theme'] === 'dark' ? 'dark' : 'light';
      const network = context.globals['network'] === 'offline' ? 'offline' : 'online';
      const serviceWorker = context.globals['serviceWorker'] === 'enabled' ? 'enabled' : 'disabled';
      ensureStorybookGlobalStyles();
      applyBrowserGlobals(network, serviceWorker);
      document.documentElement.classList.toggle('dark', theme === 'dark');
      document.documentElement.dataset['storybookTheme'] = theme;
      document.documentElement.dataset['storybookNetwork'] = network;
      document.documentElement.dataset['storybookServiceWorker'] = serviceWorker;
      return story();
    },
  ],
  loaders: [mswLoader],
  parameters: {
    msw: { handlers: publicHandlers },
    backgrounds: {
      default: 'app',
      values: [
        { name: 'app', value: '#f7f8fa' },
        { name: 'dark', value: '#111827' },
      ],
    },
    viewport: {
      viewports: {
        mobile: { name: 'Mobile', styles: { width: '390px', height: '844px' } },
        tablet: { name: 'Tablet', styles: { width: '834px', height: '1112px' } },
        desktop: { name: 'Desktop', styles: { width: '1280px', height: '900px' } },
      },
    },
    controls: { expanded: true },
    a11y: { test: 'todo' },
  },
  globalTypes: {
    theme: {
      description: 'Color scheme',
      defaultValue: 'light',
      toolbar: {
        icon: 'contrast',
        items: [
          { value: 'light', title: 'Light' },
          { value: 'dark', title: 'Dark' },
        ],
      },
    },
    network: {
      description: 'Network status',
      defaultValue: 'online',
      toolbar: {
        icon: 'globe',
        items: [
          { value: 'online', title: 'Online' },
          { value: 'offline', title: 'Offline' },
        ],
      },
    },
    serviceWorker: {
      description: 'Service worker availability',
      defaultValue: 'enabled',
      toolbar: {
        icon: 'browser',
        items: [
          { value: 'enabled', title: 'Service worker' },
          { value: 'disabled', title: 'No service worker' },
        ],
      },
    },
  },
};

export default preview;
