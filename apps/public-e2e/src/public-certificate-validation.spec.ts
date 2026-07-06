import type { Page, Route } from '@playwright/test';
import { expect, test } from './support/e2e-test';

test.beforeEach(async ({ page }) => {
  await preventSilentSso(page);
  await mockTurnstile(page);
  await mockStaticExternalAssets(page);
  await mockPublicCertificateApi(page);
});

test('validates a standalone certificate without rendering an activities section', async ({ page }) => {
  await page.goto('/app/validate/certificate-standalone');

  await expect(page.getByRole('heading', { name: 'Validar certificado' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Atividades complementares' })).toBeVisible();
  await expect(page.getByText('Atividade complementar')).toBeVisible();
  await expect(page.getByText('Certificamos a participação em atividade complementar.')).toBeVisible();
  await expect(page.getByText('Atividade validada sem vínculo com programação pública.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Atividades', exact: true })).toHaveCount(0);
});

test('shows the generic not-found error for certificates from disabled configs', async ({ page }) => {
  await page.goto('/app/validate/certificate-disabled');

  await expect(page.getByText('Certificado não encontrado.')).toBeVisible();
  await expect(page.getByText('disabled')).toHaveCount(0);
});

async function preventSilentSso(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.sessionStorage.setItem('cacic-eventos:silent-sso-attempted', 'true');
    window.localStorage.setItem('cacic.cookieBanner.enabled', 'false');
  });
}

async function mockTurnstile(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const targetWindow = window as typeof window & {
      turnstile?: {
        render: (
          element: HTMLElement,
          options: {
            callback?: (token: string) => void;
          },
        ) => string;
        reset: (widgetId: string) => void;
        remove: (widgetId: string) => void;
      };
    };

    targetWindow.turnstile = {
      render: (_element, options) => {
        window.setTimeout(() => options.callback?.('e2e-turnstile-token'), 0);
        return 'e2e-turnstile-widget';
      },
      reset: () => undefined,
      remove: () => undefined,
    };
  });
}

async function mockStaticExternalAssets(page: Page): Promise<void> {
  await page.route('https://unleash.cacic.dev.br/api/frontend/**', (route) =>
    route.fulfill({
      status: 304,
      body: '',
    }),
  );
  await page.route('https://cdn.jsdelivr.net/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><rect width="1" height="1"/></svg>',
    }),
  );
}

async function mockPublicCertificateApi(page: Page): Promise<void> {
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());

    if (url.pathname === '/api/auth/me') {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Unauthorized' }),
      });
      return;
    }

    if (url.pathname === '/api/graphql') {
      await fulfillGraphql(route);
      return;
    }

    await route.fulfill({
      status: 204,
      body: '',
    });
  });
}

async function fulfillGraphql(route: Route): Promise<void> {
  const body = route.request().postDataJSON() as { query?: string; variables?: Record<string, unknown> };
  const query = body.query ?? '';
  const certificateId = String(body.variables?.['certificateId'] ?? '');

  if (query.includes('publicCertificateValidation')) {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          publicCertificateValidation:
            certificateId === 'certificate-disabled' ? null : standaloneCertificateFixture(certificateId),
        },
      }),
    });
    return;
  }

  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ data: {} }),
  });
}

function standaloneCertificateFixture(certificateId: string): Record<string, unknown> {
  return {
    id: certificateId,
    issuedAt: '2026-07-01T12:00:00.000Z',
    personName: 'Maria Teste',
    maskedIdentityDocument: '•••.123.456-••',
    scope: 'OTHER',
    certificateName: 'Certificado avulso',
    issuedTo: 'OTHER',
    certificateTypeLabel: 'Atividade complementar',
    certificateText: 'Certificamos a participação em atividade complementar.',
    shouldAutofillSecondPage: false,
    secondPageText: 'Atividade validada sem vínculo com programação pública.',
    targetName: 'Atividades complementares',
    targetEmoji: '🏅',
    totalCreditMinutes: 0,
    sections: [],
  };
}
