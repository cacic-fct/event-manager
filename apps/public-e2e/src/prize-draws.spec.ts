import type { Page, Route } from '@playwright/test';
import { expect, test } from './support/e2e-test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.sessionStorage.setItem('cacic-eventos:silent-sso-attempted', 'true');
    window.localStorage.setItem('cacic.cookieBanner.enabled', 'false');
  });
  await mockPublicPrizeDrawApi(page);
});

test('shows released results with criteria, exact historical odds, and privacy-safe winner names', async ({ page }) => {
  await page.goto('/app/draws/event/event-1#draw-draw-1');

  await expect(page.getByRole('heading', { name: 'Resultados dos sorteios' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Kit CACiC' })).toBeVisible();
  await expect(page.getByText('Ada L.')).toBeVisible();
  await expect(page.getByText('ID do giro: spin-1')).toBeVisible();

  await page.getByRole('button', { name: 'Como este sorteio funciona' }).click();
  await expect(page.getByText('pessoas presentes, pessoas inscritas')).toBeVisible();
  await expect(page.getByText('Entradas ponderadas')).toBeVisible();
  await expect(page.getByText('25% · 1 em 4')).toBeVisible();
  await expect(page.getByText('Pesos: 1 pessoa com peso 1 · 1 pessoa com peso 3')).toBeVisible();
  await expect(page.getByText(/CSPRNG/)).toBeVisible();
});

test('renders access failures as a stable error state instead of stale or empty results', async ({ page }) => {
  await page.route('**/api/graphql', async (route) => {
    const body = route.request().postDataJSON() as { query?: string };
    if (body.query?.includes('PublicPrizeDraws')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ errors: [{ message: 'Você não participou deste sorteio.' }] }),
      });
      return;
    }
    await route.fallback();
  });

  await page.goto('/app/draws/event/event-1');

  await expect(page.getByRole('alert')).toContainText('Não foi possível abrir os sorteios');
  await expect(page.getByRole('alert')).toContainText('Você não participou deste sorteio.');
  await expect(page.getByText('Ada L.')).toHaveCount(0);
});

async function mockPublicPrizeDrawApi(page: Page): Promise<void> {
  await page.route('https://unleash.cacic.com.br/api/frontend/**', (route) => route.fulfill({ status: 304, body: '' }));
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/auth/me') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(authenticatedUserFixture()),
      });
      return;
    }
    if (url.pathname.startsWith('/api/prize-draws/public/')) {
      await route.fulfill({ status: 200, contentType: 'text/event-stream', body: '' });
      return;
    }
    if (url.pathname === '/api/graphql') {
      const body = route.request().postDataJSON() as { query?: string };
      if (body.query?.includes('PublicPrizeDraws')) {
        await fulfill(route, { publicPrizeDraws: [publicDrawFixture()] });
        return;
      }
    }
    await route.fulfill({ status: 204, body: '' });
  });
}

async function fulfill(route: Route, data: Record<string, unknown>): Promise<void> {
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data }) });
}

function publicDrawFixture() {
  const now = new Date().toISOString();
  return {
    id: 'draw-1',
    title: 'Kit CACiC',
    description: 'Sorteio de encerramento',
    target: { type: 'EVENT', id: 'event-1', name: 'Oficina de Angular' },
    includePresent: true,
    includeSubscribers: true,
    includeManualEntries: false,
    chanceMode: 'WEIGHTED',
    removeWinnerAfterDraw: true,
    frozenAt: now,
    revision: 2,
    spins: [
      {
        id: 'spin-1',
        sequence: 1,
        description: 'Primeiro prêmio',
        speed: 'INSTANT',
        countdownSeconds: null,
        chanceMode: 'WEIGHTED',
        removeWinnerAfterDraw: true,
        winnerDisplayName: 'Ada L.',
        winnerWeight: 1,
        entrantCount: 2,
        totalWeight: 4,
        duplicateEntryCount: 2,
        weightBreakdown: [
          { weight: 1, peopleCount: 1 },
          { weight: 3, peopleCount: 1 },
        ],
        eligibilityFrozenAt: now,
        drawnAt: now,
      },
    ],
    createdAt: now,
    updatedAt: now,
  };
}

function authenticatedUserFixture(): Record<string, unknown> {
  return {
    realm_access: {
      roles: [],
    },
    sub: 'user-1',
    preferredUsername: 'usuario.teste',
    email: 'usuario.teste@example.edu',
    roles: [],
    permissions: [],
    scopes: ['openid'],
    claims: {
      exp: Math.floor(Date.now() / 1000) + 3600,
      is_onboarded: true,
      name: 'Usuário Teste',
      picture: null,
    },
  };
}
