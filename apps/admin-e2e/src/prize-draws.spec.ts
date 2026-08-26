import type { Page, Route } from '@playwright/test';
import { expect, test } from './support/e2e-test';
import {
  adminE2ECriticalFlowPermissions,
  authenticatedAdminUserFixture,
  mockAdminApi,
  preventSilentSso,
} from './support/admin-e2e-fixtures';

test.beforeEach(async ({ page }) => {
  await preventSilentSso(page);
  await mockAdminApi(page, {
    user: authenticatedAdminUserFixture(),
    permissions: [
      ...adminE2ECriticalFlowPermissions,
      'prize-draw#read',
      'prize-draw#create',
      'prize-draw#update',
      'prize-draw#operate',
      'prize-draw#undo',
      'prize-draw#contact-read',
      'related-person#read',
    ],
  });
  await mockPrizeDrawGraphql(page);
});

test('configures, freezes, and opens a prize draw with an auditable roster', async ({ page }) => {
  await page.goto('/admin/draws/draw-1');

  await expect(page.getByRole('heading', { name: 'Configurar sorteio' })).toBeVisible();
  await expect(page.getByLabel('Título')).toHaveValue('Kit CACiC');
  await expect(page.getByText('Ada Lovelace')).toBeVisible();
  await expect(page.getByText('2 pessoas incluídas.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Página pública' })).toHaveAttribute(
    'href',
    /\/app\/draws\/event\/event-1#draw-draw-1$/,
  );

  await page.getByRole('button', { name: 'Congelar lista' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Lista congelada' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Descongelar lista' })).toBeVisible();

  await page.getByRole('link', { name: 'Ir para o sorteio' }).click();
  await expect(page.getByRole('heading', { name: 'Kit CACiC' })).toBeVisible();
  await expect(page.getByText('Primeiro prêmio')).toBeVisible();
  await expect(page.getByText('2 pessoas elegíveis')).toBeVisible();
});

test('runs a side-effect-free demo and presents the winner in the result dialog', async ({ page }) => {
  await page.goto('/admin/draws/draw-1/draw?demo=true');

  await expect(page.getByText('Demonstração · nenhum resultado será registrado.')).toBeVisible();
  await page.getByRole('button', { name: 'Iniciar demonstração' }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Demonstração')).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Ada Lovelace' })).toBeVisible();
  await expect(dialog.getByRole('link', { name: 'Abrir página pública do sorteio' })).toHaveAttribute(
    'href',
    /\/app\/draws\/event\/event-1#draw-draw-1$/,
  );
  await dialog.getByRole('button', { name: 'Fechar resultado' }).click();
  await expect(dialog).toBeHidden();
});

async function mockPrizeDrawGraphql(page: Page): Promise<void> {
  let frozenAt: string | null = null;
  await page.route('**/api/graphql', async (route) => {
    const body = route.request().postDataJSON() as { query?: string; variables?: Record<string, unknown> };
    const query = body.query ?? '';
    if (!query.includes('PrizeDraw')) {
      await route.fallback();
      return;
    }
    if (query.includes('PrizeDrawEligibleEntries')) {
      await fulfill(route, { prizeDrawEligibleEntries: eligibleEntries() });
      return;
    }
    if (query.includes('SpinPrizeDraw')) {
      await fulfill(route, { spinPrizeDraw: spinResult(Boolean((body.variables?.['input'] as { demo?: boolean })?.demo)) });
      return;
    }
    if (query.includes('freezePrizeDrawEligibility')) {
      frozenAt = new Date().toISOString();
      await fulfill(route, { freezePrizeDrawEligibility: drawFixture({ frozenAt }) });
      return;
    }
    if (query.includes('unfreezePrizeDrawEligibility')) {
      frozenAt = null;
      await fulfill(route, { unfreezePrizeDrawEligibility: drawFixture({ frozenAt }) });
      return;
    }
    if (query.includes('query PrizeDraw(')) {
      await fulfill(route, { prizeDraw: drawFixture({ frozenAt }) });
      return;
    }
    if (query.includes('query PrizeDraws')) {
      await fulfill(route, { prizeDraws: [drawFixture({ frozenAt })] });
      return;
    }
    await route.fallback();
  });
}

async function fulfill(route: Route, data: Record<string, unknown>): Promise<void> {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ data }),
  });
}

function eligibleEntries() {
  return [
    { identityKey: 'person:person-1', personId: 'person-1', displayName: 'Ada Lovelace', weight: 1, sources: ['ATTENDANCE'] },
    { identityKey: 'person:person-2', personId: 'person-2', displayName: 'Grace Hopper', weight: 1, sources: ['SUBSCRIPTION'] },
  ];
}

function drawFixture(patch: Record<string, unknown> = {}) {
  const now = new Date().toISOString();
  return {
    id: 'draw-1',
    title: 'Kit CACiC',
    description: 'Sorteio de encerramento',
    target: { type: 'EVENT', id: 'event-1', name: 'Oficina de Angular' },
    includePresent: true,
    includeSubscribers: true,
    includeManualEntries: false,
    chanceMode: 'EQUAL',
    spinLimit: 1,
    removeWinnerAfterDraw: true,
    defaultSpeed: 'INSTANT',
    dramaticCountdownSeconds: 3,
    notifyWinner: false,
    frozenAt: null,
    unfrozenAt: null,
    revision: 1,
    plannedSpins: [{ id: 'planned-1', position: 1, description: 'Primeiro prêmio', speed: 'INSTANT', countdownSeconds: null }],
    manualEntries: [],
    weightOverrides: [],
    excludedPeople: [],
    spins: [],
    eligibleEntrantCount: 2,
    eligibleTotalWeight: 2,
    eligibleDuplicateEntryCount: 0,
    createdAt: now,
    updatedAt: now,
    ...patch,
  };
}

function spinResult(demo: boolean) {
  return {
    demo,
    drawId: 'draw-1',
    spinId: demo ? null : 'spin-1',
    sequence: demo ? null : 1,
    drawTitle: 'Kit CACiC',
    spinDescription: 'Primeiro prêmio',
    winnerFullName: 'Ada Lovelace',
    winnerReelName: 'Ada L.',
    winnerReelIndex: 0,
    reelNames: ['Ada L.', 'Grace H.'],
    speed: 'INSTANT',
    countdownMs: 0,
    reelDurationMs: 0,
    preRevealPauseMs: 0,
    hasMoreSpins: false,
  };
}
