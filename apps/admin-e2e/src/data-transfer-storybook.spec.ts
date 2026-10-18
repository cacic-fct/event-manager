import type { BrowserContext, Page } from '@playwright/test';
import { createTransferTemplate, type TransferDocument } from '@cacic-fct/shared-data-transfer';
import { expect, test } from './support/e2e-test';
import axe from 'axe-core';

declare global {
  interface Window {
    axe: typeof axe;
  }
}

type StoryRequest = {
  method: string;
  path: string;
  body?: unknown;
};

declare global {
  interface Window {
    __dataTransferStoryRequests?: StoryRequest[];
  }
}

const storybookURL = process.env['STORYBOOK_ADMIN_URL'];
const storyId = 'admin-event-management-data-transfer-json';
let storyContext: BrowserContext | null = null;
let storyPage: Page | null = null;

test.describe('JSON transfer Storybook with real HttpClient and MSW', () => {
  test.skip(!storybookURL, 'Set STORYBOOK_ADMIN_URL to the already running admin Storybook.');
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async ({ browser }) => {
    if (!storybookURL) {
      return;
    }

    storyContext = await browser.newContext({ serviceWorkers: 'allow' });
    const workerResponse = await storyContext.request.get(new URL('/mockServiceWorker.js', storybookURL).toString());
    expect(workerResponse.ok()).toBe(true);
    expect(workerResponse.headers()['content-type']).toContain('javascript');
    expect((await workerResponse.body()).byteLength).toBeGreaterThan(1_000);
    storyPage = await storyContext.newPage();
    await storyPage.goto(new URL('/mockServiceWorker.js', storybookURL).toString());
    await storyPage.evaluate(async (workerUrl) => {
      const registration = await navigator.serviceWorker.register(workerUrl, { scope: '/' });
      await navigator.serviceWorker.ready;
      if (!registration.active) {
        throw new Error('The Storybook MSW worker did not become active.');
      }
    }, new URL('/mockServiceWorker.js', storybookURL).toString());
    await openTransferStory('connected-api');
  });

  test.afterAll(async () => {
    await storyContext?.close();
    storyContext = null;
    storyPage = null;
  });

  test('reviews changes, forwards allocation, and reuses generated IDs', async () => {
    const page = await openTransferStory('connected-api');
    const editor = await enterTemplate(page);

    await expect(page.getByRole('button', { name: 'Aplicar alterações', exact: true })).toHaveCount(0);
    expect(await requestLog(page, '/apply')).toHaveLength(0);

    await page.getByRole('button', { name: 'Revisar importação', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Revisão do plano', exact: true })).toBeVisible();
    const firstItem = page.locator('.review-item').first();
    await firstItem.locator('mat-expansion-panel-header').click();
    await expect(firstItem.getByRole('table', { name: 'Campos que serão alterados' })).toBeVisible();
    await expect(firstItem).toContainText('Valor atual');
    await expect(firstItem).toContainText('Valor proposto');

    await page.addScriptTag({ content: axe.source });
    const violations = await page.evaluate(async () => {
      const root = document.getElementById('storybook-root');
      if (!root) {
        throw new Error('Story content is unavailable');
      }
      return (
        await window.axe.run(root, {
          runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
        })
      ).violations.map((violation) => violation.id);
    });
    expect(violations).toEqual([]);

    await page.getByRole('button', { name: 'Aplicar alterações', exact: true }).click();
    await expect(page.getByText(/Importação concluída/)).toBeVisible();
    const appliedJson = JSON.parse(await editor.inputValue()) as TransferDocument;
    expect(appliedJson.resources[0].id).toBeTruthy();
    expect(appliedJson.resources[0].key).toBeUndefined();

    const applyRequest = (await requestLog(page, '/apply')).at(-1);
    expect(asRecord(applyRequest?.body)?.['allocationToken']).toBe('storybook-allocation-token');

    await page.getByRole('button', { name: 'Revisar importação', exact: true }).click();
    await expect(page.locator('.review-item').first()).toContainText('Atualizar');
    const previewRequest = (await requestLog(page, '/preview')).at(-1);
    const previewBody = asRecord(previewRequest?.body);
    const previewDocument = asRecord(previewBody?.['document']);
    const resources = previewDocument?.['resources'];
    const previewResource = asRecord(Array.isArray(resources) ? resources[0] : undefined);
    expect(previewResource?.['id']).toBe(appliedJson.resources[0].id);
    expect(previewResource?.['key']).toBeUndefined();
  });

  test('keeps blocked rows opt-in and requires a fresh partial review', async () => {
    const page = await openTransferStory('connected-api-blocked');
    await enterTemplate(page);

    await page.getByRole('button', { name: 'Revisar importação', exact: true }).click();
    const consent = page.getByRole('checkbox', { name: 'Ignorar registros bloqueados', exact: true });
    await expect(consent).not.toBeChecked();
    await expect(page.getByRole('button', { name: 'Aplicar alterações', exact: true })).toBeDisabled();
    await page.locator('.review-item').last().locator('mat-expansion-panel-header').click();
    await expect(page.locator('.review-item').last()).toContainText('pessoa correspondente única');

    await consent.click();
    await expect(page.locator('.review-section')).toHaveCount(0);
    expect(await requestLog(page, '/apply')).toHaveLength(0);
    await page.getByRole('button', { name: 'Revisar importação', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Aplicar alterações', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Aplicar alterações', exact: true }).click();
    await expect(page.getByText(/registros foram ignorados conforme sua confirmação/)).toBeVisible();

    const applyBody = asRecord((await requestLog(page, '/apply')).at(-1)?.body);
    expect(applyBody?.['allowPartial']).toBe(true);
  });

  test('invalidates the reviewed plan when the editor changes', async () => {
    const page = await openTransferStory('connected-api');
    const editor = await enterTemplate(page);
    await page.getByRole('button', { name: 'Revisar importação', exact: true }).click();
    await expect(page.locator('.review-section')).toBeVisible();

    await editor.fill(`${JSON.stringify(createTransferTemplate('event'), null, 2)}\n`);
    await expect(page.locator('.review-section')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Aplicar alterações', exact: true })).toHaveCount(0);
    expect(await requestLog(page, '/preview')).toHaveLength(1);
    expect(await requestLog(page, '/apply')).toHaveLength(0);
  });

  test('invalidates the reviewed plan when a replacement file is selected', async () => {
    const page = await openTransferStory('connected-api');
    const content = JSON.stringify(createTransferTemplate('event'), null, 2);
    const fileInput = page.locator('#transfer-file');
    await fileInput.setInputFiles({
      name: 'first.json',
      mimeType: 'application/json',
      buffer: Buffer.from(content),
    });
    await expect(page.getByText('Arquivo selecionado: first.json', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Revisar importação', exact: true }).click();
    await expect(page.locator('.review-section')).toBeVisible();

    const replacement = `${content}\n`;
    await fileInput.setInputFiles({
      name: 'replacement.json',
      mimeType: 'application/json',
      buffer: Buffer.from(replacement),
    });
    await expect(page.getByText('Arquivo selecionado: replacement.json', { exact: true })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Conteúdo JSON', exact: true })).toHaveValue(replacement);
    await expect(page.locator('.review-section')).toHaveCount(0);
    expect(await requestLog(page, '/preview')).toHaveLength(1);
    expect(await requestLog(page, '/apply')).toHaveLength(0);
  });

  test('invalidates and rebuilds the plan after selecting an import context', async () => {
    const page = await openTransferStory('connected-api');
    await enterTemplate(page);
    await page.getByRole('button', { name: 'Revisar importação', exact: true }).click();
    await expect(page.locator('.review-section')).toBeVisible();

    await page.getByRole('button', { name: 'Selecionar Semana da Computação', exact: true }).click();
    await expect(page.locator('.review-section')).toHaveCount(0);
    expect(await requestLog(page, '/apply')).toHaveLength(0);
    await page
      .getByRole('checkbox', { name: 'Aplicar aos registros existentes do contexto escolhido acima', exact: true })
      .click();
    await page.getByRole('button', { name: 'Revisar importação', exact: true }).click();
    await expect(page.locator('.review-section')).toBeVisible();

    const previewBody = asRecord((await requestLog(page, '/preview')).at(-1)?.body);
    expect(previewBody?.['scope']).toEqual({ kind: 'major-event', id: 'major-1' });
    expect(await requestLog(page, '/preview')).toHaveLength(2);
  });

  test('recovers a committed import after a lost response without allocating another plan', async () => {
    const page = await openTransferStory('connected-api-response-lost');
    const editor = await enterTemplate(page);
    await page.getByRole('button', { name: 'Revisar importação', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Aplicar alterações', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Aplicar alterações', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Verificar resultado / tentar novamente', exact: true }),
    ).toBeVisible();
    await expect(editor).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Revisar importação', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Verificar resultado / tentar novamente', exact: true }).click();
    await expect(page.getByText(/Importação concluída/)).toBeVisible();
    const requests = await requestLog(page, '/apply');
    expect(requests).toHaveLength(2);
    expect(requests[1].body).toEqual(requests[0].body);
    expect(await requestLog(page, '/preview')).toHaveLength(1);
    expect(JSON.parse(await editor.inputValue()).resources[0].id).toBeTruthy();
  });

  test('rejects invalid markup as text without sending it to the API', async () => {
    const page = await openTransferStory('connected-api');
    const editor = page.getByRole('textbox', { name: 'Conteúdo JSON', exact: true });
    await editor.fill('<img src=x onerror="window.__transferXss=true">');
    await page.getByRole('button', { name: 'Revisar importação', exact: true }).click();

    await expect(page.getByText('Revise o JSON antes de continuar.', { exact: true })).toBeVisible();
    expect(await requestLog(page, '/preview')).toHaveLength(0);
    await expect(page.locator('img[src="x"]')).toHaveCount(0);
    expect(await page.evaluate(() => (window as Window & { __transferXss?: boolean }).__transferXss)).toBeUndefined();
  });

  test('selects a JSON file through the localized keyboard-accessible picker', async () => {
    const page = await openTransferStory('connected-api');
    await expect(page.getByText('Nenhum arquivo selecionado', { exact: true })).toBeVisible();

    const pickerButton = page.getByRole('button', { name: 'Selecionar arquivo', exact: true });
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.bringToFront();
    await pickerButton.focus();
    await page.keyboard.press('Enter');
    const fileChooser = await fileChooserPromise;
    const content = JSON.stringify(createTransferTemplate('event'), null, 2);
    await fileChooser.setFiles({
      name: 'modelo.json',
      mimeType: 'application/json',
      buffer: Buffer.from(content),
    });

    await expect(page.getByText('Arquivo selecionado: modelo.json', { exact: true })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Conteúdo JSON', exact: true })).toHaveValue(content);
    const focusState = await pickerButton.evaluate((button) => ({
      buttonFocused: document.activeElement === button,
      activeTag: document.activeElement?.tagName ?? null,
      activeId: document.activeElement instanceof HTMLElement ? document.activeElement.id : null,
      documentHasFocus: document.hasFocus(),
    }));
    expect(focusState.buttonFocused, JSON.stringify(focusState)).toBe(true);
  });

  test('exports tickets and child participation independently from its hierarchy', async () => {
    const page = await openTransferStory('connected-api-scoped');
    await page.getByRole('checkbox', { name: 'Incluir eventos e grupos filhos', exact: true }).click();
    await page.getByRole('checkbox', { name: 'Incluir inscrições deste grande evento', exact: true }).click();
    await page.getByRole('checkbox', { name: 'Incluir inscrições dos eventos e grupos filhos', exact: true }).click();
    await page.getByRole('checkbox', { name: 'Incluir presenças dos eventos filhos', exact: true }).click();
    await page.getByRole('checkbox', { name: 'Incluir bilhetes', exact: true }).click();

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Exportar JSON', exact: true }).click();
    await downloadPromise;

    const body = asRecord((await requestLog(page, '/export')).at(-1)?.body);
    expect(body).toMatchObject({
      target: { kind: 'major-event', id: 'storybook-major' },
      includeDescendants: false,
      includeConfiguration: true,
      includeSubscriptions: true,
      includeAttendances: false,
      includeChildSubscriptions: true,
      includeChildAttendances: true,
      includeTickets: true,
    });
  });

  test('requires explicit undo confirmation and displays server conflicts', async () => {
    const page = await openTransferStory('connected-api-undo-conflict');
    await enterTemplate(page);
    await page.getByRole('button', { name: 'Revisar importação', exact: true }).click();
    await page.getByRole('button', { name: 'Aplicar alterações', exact: true }).click();
    await expect(page.getByText(/Importação concluída/)).toBeVisible();

    await page.getByRole('button', { name: 'Desfazer esta importação', exact: true }).click();
    await expect(page.getByRole('group', { name: /Reverter todas as alterações do lote/ })).toBeVisible();
    expect(await requestLog(page, '/undo')).toHaveLength(0);
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await expect(page.getByRole('group', { name: /Reverter todas as alterações do lote/ })).toHaveCount(0);
    expect(await requestLog(page, '/undo')).toHaveLength(0);
    await page.getByRole('button', { name: 'Desfazer esta importação', exact: true }).click();
    await expect(page.getByRole('group', { name: /Reverter todas as alterações do lote/ })).toBeVisible();
    await page.getByRole('button', { name: 'Confirmar reversão', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('um registro foi alterado depois da importação');
    expect(await requestLog(page, '/undo')).toHaveLength(1);
  });

  test('respects import-only and undo-only access with live API handlers', async () => {
    const page = await openTransferStory('connected-api-import-only');
    await expect(page.getByRole('heading', { name: 'Importar JSON', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Exportar JSON', exact: true })).toHaveCount(0);
    await expect(page.getByRole('textbox', { name: 'Conteúdo JSON', exact: true })).toBeVisible();

    await openTransferStory('connected-api-undo-only');
    await expect(page.getByRole('heading', { name: 'Importações recentes', exact: true })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Conteúdo JSON', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Desfazer este lote', exact: true }).click();
    await page.getByRole('button', { name: 'Confirmar reversão', exact: true }).click();
    await expect(page.getByText(/Importação revertida\./)).toBeVisible();
    expect(await requestLog(page, '/undo')).toHaveLength(1);
  });

  test('lets keyboard users scroll the before-and-after comparison on a narrow screen', async () => {
    const page = await openTransferStory('connected-api');
    await page.setViewportSize({ width: 390, height: 844 });
    await enterTemplate(page);
    await page.getByRole('button', { name: 'Revisar importação', exact: true }).click();
    await page.locator('.review-item').first().locator('mat-expansion-panel-header').click();
    const comparison = page.getByRole('region', { name: 'Comparação de alterações', exact: true }).first();
    await comparison.focus();
    await expect(comparison).toBeFocused();
    await comparison.press('ArrowRight');
    await expect.poll(() => comparison.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
  });
});

async function enterTemplate(page: Page) {
  const editor = page.getByRole('textbox', { name: 'Conteúdo JSON', exact: true });
  await editor.fill(JSON.stringify(createTransferTemplate('event'), null, 2));
  return editor;
}

function connectedStoryUrl(storyName: string): string {
  return `${storybookURL}/iframe.html?id=${storyId}--${storyName}&viewMode=story&embed=true`;
}

async function openTransferStory(storyName: string): Promise<Page> {
  if (!storyPage) {
    throw new Error('The shared Storybook browser page is not ready.');
  }

  await storyPage.goto(connectedStoryUrl(storyName));
  await storyPage.waitForFunction(
    () => window.__dataTransferStoryRequests?.some((entry) => entry.path.endsWith('/history')) === true,
    undefined,
    { timeout: 10_000 },
  );
  return storyPage;
}

async function requestLog(page: Page, pathSuffix: string): Promise<StoryRequest[]> {
  return page.evaluate(
    (suffix) => (window.__dataTransferStoryRequests ?? []).filter((entry) => entry.path.endsWith(suffix)),
    pathSuffix,
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
