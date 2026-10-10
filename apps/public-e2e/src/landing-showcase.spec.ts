import { readFileSync } from 'node:fs';
import type * as axe from 'axe-core';
import type { Locator, Page } from '@playwright/test';
import { expect, test } from './support/e2e-test';

const axeSource = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const participantFeatures = [
  ['Meu dia', '.day-demo'],
  ['Eventos e inscrições', 'app-landing-major-event-subscription-demo'],
  ['Carteira', 'app-landing-wallet-demo'],
  ['Autorregistro', '.attendance-demo'],
  ['Notificações', 'app-landing-notifications-demo'],
  ['Participações', 'app-landing-participation-history-demo'],
] as const;
const organizerFeatures = [
  ['Painel inteligente', 'app-landing-dashboard-demo'],
  ['Eventos e inscrições', 'app-landing-registration-demo'],
  ['Presenças', 'lib-oral-attendance'],
  ['Certificados', 'app-landing-certificate-demo'],
  ['Sorteios', 'lib-prize-draw-reel'],
  ['Equipe e permissões', 'app-landing-role-demo'],
  ['Histórico de alterações', 'app-landing-audit-log-demo'],
] as const;

for (const scenario of [
  { name: 'desktop light', viewport: { width: 1440, height: 900 }, colorScheme: 'light', reducedMotion: 'no-preference' },
  { name: 'mobile dark reduced motion', viewport: { width: 390, height: 844 }, colorScheme: 'dark', reducedMotion: 'reduce' },
] as const) {
  test.describe(`landing showcase: ${scenario.name}`, () => {
    test.use({
      viewport: scenario.viewport, colorScheme: scenario.colorScheme, reducedMotion: scenario.reducedMotion,
      serviceWorkers: process.env['LANDING_STORYBOOK_URL'] ? 'allow' : 'block',
    });

    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ colorScheme: scenario.colorScheme, reducedMotion: scenario.reducedMotion });
      await page.addInitScript(() => {
        sessionStorage.setItem('cacic-eventos:silent-sso-attempted', 'true');
        localStorage.setItem('cacic.cookieBanner.enabled', 'false');
      });
      await page.route('https://unleash.cacic.com.br/**', (route) => route.fulfill({ status: 304, body: '' }));
      await page.route('https://cdn.jsdelivr.net/**', (route) => route.fulfill({
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"></svg>',
      }));
      await page.route('**/api/**', async (route) => {
        if (route.request().url().includes('/auth/me')) {
          await route.fulfill({ status: 403, json: { message: 'User is not authenticated.' } });
        } else if (route.request().url().includes('/graphql')) {
          await route.fulfill({ json: { data: { publicPlatformStats: {
            peopleCount: 1200, eventsCount: 120, majorEventsCount: 12, certificatesCount: 800,
          } } } });
        } else {
          await route.fulfill({ status: 204, body: '' });
        }
      });
      // Allows the same browser contracts to run against the existing Storybook
      // when the public app server is unavailable locally. CI uses /app/.
      const storybookUrl = process.env['LANDING_STORYBOOK_URL'];
      const storyId = scenario.colorScheme === 'dark' ? 'dark-system-preference' : 'playground';
      await page.goto(storybookUrl
        ? `${storybookUrl}/iframe.html?id=cacic-eventos-landing-page--${storyId}&viewMode=story`
        : '/app/');
      await expect(page.getByRole('heading', { name: 'CACiC Eventos', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Ir para a próxima seção' }).click();
      await expect(page.locator('app-landing-participant-showcase')).toBeVisible();
    });

    test('renders every feature with real shared controls, accessible selection and responsive layout', async ({ page }) => {
      test.setTimeout(120_000);
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await assertAccessible(page, 'app-login-page');
      for (const [selector, features] of [
        ['app-landing-participant-showcase', participantFeatures],
        ['app-landing-organizer-showcase', organizerFeatures],
      ] as const) {
        const showcase = page.locator(selector);
        if (selector === 'app-landing-organizer-showcase') {
          await page.locator('.organizer-section').scrollIntoViewIfNeeded();
        }
        await expect(showcase).toBeVisible();
        await showcase.scrollIntoViewIfNeeded();
        for (const [label, contentSelector] of features) {
          await test.step(`${selector}: ${label}`, async () => {
            const button = showcase.locator('.feature-picker').getByRole('button', { name: label, exact: true });
            await button.focus();
            await button.press('Enter');
            await expect(button).toHaveAttribute('aria-pressed', 'true');
            await expect(showcase.locator('.feature-picker button[aria-pressed="true"]')).toHaveCount(1);
            await expect(showcase.locator(contentSelector)).toBeVisible();
            await expect(showcase.locator('.stage-copy h3')).not.toBeEmpty();
            await assertAccessible(page, selector);
            expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
          });
        }
      }
      const extrasPlaceholder = page.locator('.showcase-placeholder').filter({ hasText: 'Conheça os recursos para torneios' });
      if (await extrasPlaceholder.count()) await extrasPlaceholder.scrollIntoViewIfNeeded();
      const extras = page.locator('app-landing-event-extras');
      await expect(extras).toBeVisible();
      await extras.scrollIntoViewIfNeeded();
      await expect(extras.locator('app-landing-sports-demo')).toBeVisible();
      await extras.locator('.feedback-showcase').scrollIntoViewIfNeeded();
      await expect(extras.locator('app-landing-feedback-demo')).toBeVisible();
      await assertAccessible(page, 'app-landing-event-extras');
      expect(errors).toEqual([]);
    });

    test('completes receipt, attendance and wallet transfer through rendered controls', async ({ page }) => {
      const participant = page.locator('app-landing-participant-showcase');
      await participant.getByRole('button', { name: /Envie seu comprovante/ }).click();
      const receipt = participant.locator('app-landing-receipt-demo');
      await expect(receipt.getByRole('button', { name: 'Enviar comprovante' })).toBeDisabled();
      await receipt.getByLabel('Arquivo do comprovante').setInputFiles({
        name: 'comprovante.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.7\nDemo'),
      });
      await receipt.getByRole('button', { name: 'Enviar comprovante' }).click();
      await expect(receipt.getByRole('status')).toContainText('Comprovante enviado.');
      await receipt.getByRole('button', { name: 'Voltar ao Meu dia' }).click();
      await expect(participant.getByRole('button', { name: /Envie seu comprovante/ })).toHaveCount(0);

      await selectFeature(participant, 'Autorregistro');
      const code = participant.getByRole('textbox', { name: 'Código de presença' });
      await code.fill('ZZZZ');
      await participant.getByRole('button', { name: 'Confirmar presença', exact: true }).click();
      await expect(participant.getByRole('alert')).toContainText('Código não encontrado');
      await code.fill('kc1c');
      await participant.getByRole('button', { name: 'Confirmar presença', exact: true }).click();
      await expect(participant.getByRole('heading', { name: 'Presença confirmada.', exact: true })).toBeVisible();
      await participant.getByRole('button', { name: 'Experimentar novamente' }).click();
      await expect(code).toBeVisible();
      await expect(participant.getByRole('alert')).toHaveCount(0);

      await selectFeature(participant, 'Carteira');
      const wallet = participant.locator('app-landing-wallet-demo');
      const ticket = wallet.getByRole('button', { name: 'Bilhete para Kit de boas-vindas', exact: true });
      await ticket.click();
      await expect(ticket).toHaveAttribute('aria-pressed', 'true');
      await wallet.getByRole('button', { name: 'Transferir bilhete', exact: true }).click();
      await wallet.getByRole('button', { name: 'Enviar bilhete' }).click();
      await expect(wallet.getByRole('heading', { name: 'Pedido enviado' })).toBeFocused();
      await wallet.getByRole('button', { name: 'Ver recebimento' }).click();
      await wallet.getByRole('button', { name: 'Receber bilhete' }).click();
      await expect(wallet.getByRole('heading', { name: 'Bilhete recebido' })).toBeFocused();
      await wallet.getByRole('button', { name: 'Voltar à carteira' }).click();
      await expect(wallet.getByText('Transferência concluída', { exact: true })).toBeVisible();
      await assertAccessible(page, 'app-landing-participant-showcase');
    });
  });
}

async function selectFeature(showcase: Locator, label: string): Promise<void> {
  await showcase.locator('.feature-picker').getByRole('button', { name: label, exact: true }).click();
}

async function assertAccessible(page: Page, selector: string): Promise<void> {
  await page.evaluate(axeSource);
  const violations = await page.evaluate(async (context) => {
    const results = await (window as typeof window & { axe: typeof axe }).axe.run(context, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } });
    return results.violations.map(({ id, nodes }) => ({ id, targets: nodes.map((node) => node.target) }));
  }, selector);
  expect(violations).toEqual([]);
}
