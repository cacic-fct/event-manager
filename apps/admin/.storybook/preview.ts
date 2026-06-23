import { provideHttpClient } from '@angular/common/http';
import { inject, provideAppInitializer } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatIconRegistry } from '@angular/material/icon';
import { provideRouter, withDisabledInitialNavigation } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { AuthService } from '@cacic-fct/shared-angular';
import { EVENT_MANAGER_PERMISSION_CATALOG } from '@cacic-fct/shared-permissions';
import type { Preview } from '@storybook/angular';
import { applicationConfig } from '@storybook/angular';
import { initialize, mswLoader } from 'msw-storybook-addon';
import { cacicEventosHandlers } from './storybook-mocks';

initialize({
  onUnhandledRequest: 'bypass',
  serviceWorker: {
    url: './mockServiceWorker.js',
    options: {
      scope: './',
    },
  },
});

const originalNavigatorOnline = Object.getOwnPropertyDescriptor(Navigator.prototype, 'onLine');

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
      font-family: 'Material Symbols Outlined';
      font-style: normal;
      font-display: swap;
      font-weight: 400;
      src:
        url('./material-symbols-outlined-files/material-symbols-outlined-latin-400-normal.woff2') format('woff2'),
        url('./material-symbols-outlined-files/material-symbols-outlined-latin-400-normal.woff') format('woff');
    }

    .material-symbols-outlined {
      font-family: 'Material Symbols Outlined';
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

const dialogRefMock = {
  close: () => undefined,
};

const personA = {
  id: 'person-a',
  name: 'Ana Clara Silva',
  email: 'ana@example.com',
  identityDocument: '12345678901',
  academicId: '2026001',
  userId: 'user-a',
  externalRef: 'ext-a',
};

const personB = {
  id: 'person-b',
  name: 'Ana C. Silva',
  email: 'ana.silva@example.com',
  identityDocument: '12345678901',
  academicId: '2026001',
  userId: null,
  externalRef: 'legacy-42',
};

const adminDialogData = {
  title: 'Excluir evento',
  message: 'Esta ação remove o evento e não pode ser desfeita.',
  confirmLabel: 'Excluir',
  cancelLabel: 'Cancelar',
  fileName: 'inscricoes.csv',
  headers: ['Nome', 'E-mail', 'RA', 'Eventos'],
  previewRows: [
    { Nome: 'Ana Clara Silva', 'E-mail': 'ana@example.com', RA: '2026001', Eventos: 'event-1,event-2' },
    { Nome: 'Bruno Santos', 'E-mail': 'bruno@example.com', RA: '2026002', Eventos: 'event-2' },
  ],
  failedValues: ['sem-email@example.com'],
  createdCount: 12,
  duplicateCount: 2,
  failedCount: 1,
  inferredMatchType: 'EMAIL',
  createdSubscriptionCount: 10,
  updatedSubscriptionCount: 4,
  createdPeopleCount: 2,
  createdPeople: [personA, personB],
  failedRows: ['Linha 12: evento inexistente'],
  candidate: {
    id: 'merge-candidate-1',
    status: 'PENDING',
    confidence: 0.92,
    reason: 'Documento igual e e-mails semelhantes',
    personA,
    personB,
    createdAt: '2026-05-16T12:00:00.000Z',
    updatedAt: '2026-05-16T12:00:00.000Z',
  },
};

class StorybookAuthService {
  readonly user = () => ({
    sub: 'storybook-admin',
    preferredUsername: 'storybook-admin',
    email: 'admin@example.com',
    roles: ['admin'],
    scopes: ['profile', 'email'],
    permissions: [...EVENT_MANAGER_PERMISSION_CATALOG],
    claims: {
      name: 'Storybook Admin',
      preferred_username: 'storybook-admin',
      email: 'admin@example.com',
      is_onboarded: true,
    },
  });
  readonly roles = () => ['admin'];
  readonly scopes = () => ['profile', 'email'];
  readonly isAuthenticated = () => true;
  initialize = async () => undefined;
  login = async () => undefined;
  logout = async () => undefined;
}

function applyBrowserGlobals(network: string): void {
  Object.defineProperty(Navigator.prototype, 'onLine', {
    configurable: true,
    get: () => network !== 'offline',
  });
}

function applyColorScheme(theme: string): void {
  const colorScheme = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.style.colorScheme = colorScheme;
  document.body.style.colorScheme = colorScheme;
}

if (originalNavigatorOnline) {
  Object.defineProperty(Navigator.prototype, 'onLine', originalNavigatorOnline);
}

const preview: Preview = {
  decorators: [
    applicationConfig({
      providers: [
        provideHttpClient(),
        provideNoopAnimations(),
        provideRouter([], withDisabledInitialNavigation()),
        provideAppInitializer(() => {
          inject(MatIconRegistry).setDefaultFontSetClass('material-symbols-outlined');
        }),
        { provide: MAT_DIALOG_DATA, useValue: adminDialogData },
        { provide: MatDialogRef, useValue: dialogRefMock },
        { provide: AuthService, useClass: StorybookAuthService },
      ],
    }),
    (story, context) => {
      const theme = context.globals['theme'] === 'dark' ? 'dark' : 'light';
      const network = context.globals['network'] === 'offline' ? 'offline' : 'online';
      ensureStorybookGlobalStyles();
      applyBrowserGlobals(network);
      applyColorScheme(theme);
      document.documentElement.dataset['storybookTheme'] = theme;
      document.documentElement.dataset['storybookNetwork'] = network;
      return story();
    },
  ],
  loaders: [mswLoader],
  parameters: {
    msw: { handlers: cacicEventosHandlers },
    backgrounds: {
      default: 'workspace',
      values: [
        { name: 'workspace', value: '#f7f8fa' },
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
  },
};

export default preview;
