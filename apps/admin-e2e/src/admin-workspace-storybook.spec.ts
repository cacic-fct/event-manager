import { test, expect } from './support/e2e-test';
import axe from 'axe-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Exercises the real Angular components with the repository's deterministic story providers.
// Opt in against the existing Storybook server; this suite never starts a server.
declare global { interface Window { axe: typeof axe; adminAuditAxe: typeof axe } }

const storybookURL = process.env['STORYBOOK_URL'];
const captureDirectory = process.env['ADMIN_UX_CAPTURE_DIR'];
const pages = [
  ['event-workspace', 'admin-event-management-event-workspace-overview--playground'],
  ['major-event-overview', 'admin-event-management-event-workspace-overview--selected-major-event'],
  ['event-with-counts', 'admin-event-management-event-workspace-overview--selected-event'],
  ['dashboard', 'admin-dashboard-home--playground'],
  ['shell', 'admin-layout-shell--playground'],
  ['notifications', 'admin-notifications-inbox--playground'],
  ['global-operations', 'admin-settings-global-operations--playground'],
  ['publication', 'admin-event-management-publication--playground'],
  ['standalone-certificates', 'admin-settings-certificates--standalone-certificate-folder'],
  ['events', 'admin-event-management-events--playground'],
  ['groups', 'admin-event-management-event-groups--playground'],
  ['major-events', 'admin-event-management-major-events--playground'],
  ['forms', 'admin-forms-events--playground'],
  ['draws', 'admin-prize-draws-management--playground'],
  ['draw-targets', 'admin-prize-draws-management--searchable-historical-targets'],
  ['certificates', 'admin-settings-certificates--playground'],
  ['people', 'admin-people-people--playground'],
  ['subscriptions', 'admin-registration-subscriptions-events--playground'],
  ['major-subscriptions', 'admin-registration-subscriptions-major-events--playground'],
  ['interests', 'admin-registration-interests--playground'],
  ['attendance', 'admin-attendance-events--playground'],
  ['major-attendance', 'admin-attendance-major-events--playground'],
  ['merge', 'admin-people-merge-candidates-queue--playground'],
  ['places', 'admin-event-management-places--playground'],
  ['permissions', 'admin-access-permissions-management--playground'],
  ['audit', 'admin-audit-logs--playground'],
  ['preferences', 'admin-settings-preferences--playground'],
] as const;

test.describe('admin workspace Storybook regression', () => {
  test.skip(!storybookURL, 'Set STORYBOOK_URL to an already running admin Storybook.');

  test('confirms before Novo, Limpar, or another form discards editor changes', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`${storybookURL}/iframe.html?id=admin-event-management-event-workspace-overview--integrated-shell-hub-and-editor&viewMode=story&embed=true`);
    await page.getByRole('button', { name: 'Selecionar Oficina independente', exact: true }).click();
    await page.getByRole('navigation', { name: 'Operações do evento', exact: true }).getByRole('link', { name: 'Formulários', exact: true }).click();
    await expect(page.getByRole('searchbox', { name: 'Buscar formulário', exact: true })).toBeVisible();
    const name = page.getByRole('textbox', { name: 'Nome', exact: true });
    const description = page.getByRole('textbox', { name: 'Descrição', exact: true });
    await name.fill('Novo formulário ainda não salvo');
    await description.fill('Descrição preservada');
    await expect(page.getByRole('button', { name: /Trocar contexto:/ })).toBeDisabled();
    await page.getByRole('button', { name: 'Novo', exact: true }).click();
    const confirmation = page.getByRole('dialog', { name: 'Descartar alterações do formulário?', exact: true });
    await confirmation.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await expect(name).toHaveValue('Novo formulário ainda não salvo');
    await page.getByRole('link', { name: /^Abrir formulário/ }).first().click();
    await confirmation.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await expect(description).toHaveValue('Descrição preservada');
    await page.getByRole('button', { name: 'Limpar', exact: true }).click();
    await confirmation.getByRole('button', { name: 'Descartar alterações', exact: true }).click();
    await expect(name).toHaveValue('');
    await expect(description).toHaveValue('');
    await expect(page.getByRole('button', { name: /Trocar contexto:/ })).toBeEnabled();
  });

  test('searches and pages historical draw targets independently of the current scope', async ({ page }) => {
    await page.goto(`${storybookURL}/iframe.html?id=admin-prize-draws-management--searchable-historical-targets&viewMode=story&embed=true`);
    const picker = page.locator('app-event-target-picker');
    await expect(picker).toContainText('Evento 49');
    await picker.getByRole('button', { name: 'Trocar', exact: true }).click();
    await picker.getByRole('button', { name: 'Próxima página', exact: true }).click();
    await expect(picker.getByRole('button', { name: 'Selecionar Evento 26', exact: true })).toBeVisible();
    await picker.getByRole('searchbox').fill('Evento 44');
    await picker.getByRole('button', { name: 'Selecionar Evento 44', exact: true }).click();
    await expect(picker).toContainText('Evento 44');
    await expect(picker.getByRole('button', { name: 'Trocar', exact: true })).toBeFocused();
  });

  test('keeps event date and membership filters available in the shared context picker', async ({ page }) => {
    await page.goto(`${storybookURL}/iframe.html?id=admin-event-management-event-workspace-context-picker--filter-controls&viewMode=story&embed=true`);
    const filters = page.getByRole('button', { name: /Filtros/ });
    await expect(filters).toBeVisible();
    if (await filters.getAttribute('aria-expanded') !== 'true') await filters.click();
    await page.getByRole('combobox', { name: 'Vínculo com grupo', exact: true }).click();
    await page.getByRole('option', { name: 'Com grupo', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Selecionar Encontro da trilha', exact: true })).toBeVisible();
    const today = new Intl.DateTimeFormat('pt-BR').format(new Date());
    await page.getByRole('textbox', { name: 'Início a partir de', exact: true }).fill(today);
    await page.getByRole('textbox', { name: 'Início a partir de', exact: true }).press('Tab');
    await page.getByRole('button', { name: 'Buscar contextos', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Selecionar Encontro da trilha', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Selecionar Oficina de acessibilidade', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Selecionar Encontro da edição anterior', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Limpar', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Expandir Semana da Computação', exact: true })).toBeVisible();
  });

  test('preserves form edits when navigation is cancelled and enables leaving after discard', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`${storybookURL}/iframe.html?id=admin-event-management-event-workspace-overview--integrated-shell-hub-and-editor&viewMode=story&embed=true`);
    await page.getByRole('button', { name: 'Escolher evento', exact: true }).click();
    await page.getByRole('dialog', { name: 'Escolher contexto' }).getByRole('button', { name: 'Selecionar Semana da Computação', exact: true }).click();
    await page.getByRole('navigation', { name: 'Operações do evento', exact: true }).getByRole('link', { name: 'Formulários', exact: true }).click();
    await page.getByRole('link', { name: /^Abrir formulário/ }).first().click();
    await expect(page).toHaveURL(/#\/forms\/workspace-form\?majorEventId=workspace-major$/);
    await expect(page.getByRole('button', { name: 'Rascunho', exact: true })).toBeEnabled();
    const description = page.locator('textarea[formcontrolname="description"]');
    await description.fill('Descrição ainda não salva');
    await expect(page.getByRole('button', { name: /Trocar contexto:/ })).toBeDisabled();
    const formUrl = page.url();
    await page.getByRole('button', { name: 'Menu global', exact: true }).click();
    await page.getByRole('navigation', { name: 'Navegação interna', exact: true }).getByRole('link', { name: 'Pessoas', exact: true }).click();
    const confirmation = page.getByRole('dialog', { name: 'Descartar alterações do formulário?', exact: true });
    await confirmation.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await expect(page).toHaveURL(formUrl);
    await expect(description).toHaveValue('Descrição ainda não salva');
    await page.getByRole('button', { name: 'Descartar alterações', exact: true }).click();
    await expect(page.getByRole('button', { name: /Trocar contexto:/ })).toBeEnabled();
    await page.getByRole('navigation', { name: 'Navegação interna', exact: true }).getByRole('link', { name: 'Pessoas', exact: true }).click();
    await expect(page).toHaveURL(/#\/people$/);
  });

  test('searches form owners beyond the first page inside a scoped editor', async ({ page }) => {
    await page.goto(`${storybookURL}/iframe.html?id=admin-forms-events--dense-target-controls&viewMode=story&embed=true`);
    await expect(page.getByRole('searchbox', { name: 'Buscar evento ou grande evento', exact: true })).toHaveCount(0);
    const owner = page.locator('app-event-target-picker').first();
    await owner.getByRole('button', { name: 'Trocar', exact: true }).click();
    await owner.getByRole('button', { name: 'Próxima página', exact: true }).click();
    await expect(owner.getByRole('button', { name: 'Selecionar Evento 26', exact: true })).toBeVisible();
    await owner.getByRole('searchbox').fill('Evento 49');
    await expect(owner.getByRole('button', { name: 'Selecionar Evento 49', exact: true })).toBeVisible();
    await page.addScriptTag({ content: `${axe.source}\nwindow.adminAuditAxe = window.axe;` });
    const audit = await page.evaluate(() => {
      const root = document.getElementById('storybook-root');
      if (!root) throw new Error('Story content is unavailable');
      return window.adminAuditAxe.run(root, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
      });
    });
    expect(audit.violations.map((violation) => violation.id)).toEqual([]);
    await owner.getByRole('button', { name: 'Selecionar Evento 49', exact: true }).click();
    await expect(owner).toContainText('Evento 49');
    await expect(owner.getByRole('button', { name: 'Trocar', exact: true })).toBeFocused();
  });

  for (const viewport of [{ name: 'desktop', width: 1440, height: 1000, theme: 'light' }, { name: 'mobile', width: 390, height: 844, theme: 'dark' }] as const) {
    test(`${viewport.name}: page content fits and passes WCAG AA`, async ({ page }) => {
      test.setTimeout(300_000);
      page.setDefaultTimeout(15_000);
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: viewport.theme, reducedMotion: 'reduce' });
      const runtimeErrors: string[] = [];
      page.on('pageerror', (error) => runtimeErrors.push(error.message));
      const results: unknown[] = [];
      const failures: string[] = [];
      if (captureDirectory) await mkdir(resolve(captureDirectory), { recursive: true });
      for (const [name, id] of pages) {
        await test.step(name, async () => {
          runtimeErrors.length = 0;
          await page.goto(`${storybookURL}/iframe.html?id=${encodeURIComponent(id)}&viewMode=story&embed=true&globals=theme:${viewport.theme};motion:reduced`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
          const root = page.locator('#storybook-root');
          try {
            await expect(root.locator('button:visible, input:visible, h1:visible, h2:visible, h3:visible, [role=button]:visible').first()).toBeVisible({ timeout: 20_000 });
            await expect.poll(() => page.evaluate(() => document.fonts.status), { timeout: 10_000 }).toBe('loaded');
            await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--mat-sys-surface').trim())).not.toBe('');
            await expect.poll(() => page.evaluate(() => [...document.fonts].some((font) => font.family.replace(/["']/g, '') === 'Material Symbols Outlined' && font.status === 'loaded'))).toBe(true);
            await expect.poll(() => page.locator('mat-icon').evaluateAll((icons) => icons.every((icon) => getComputedStyle(icon).fontFamily.includes('Material Symbols Outlined')))).toBe(true);
            await expect.poll(() => page.evaluate(() => getComputedStyle(document.body).colorScheme)).toBe(viewport.theme);
            // Capture after Angular/MSW settles; there is no fixed timer or app-state injection.
            await expect(page.locator('.sb-errordisplay')).toBeHidden();
            await expect(page.locator('#webpack-hot-middleware-clientOverlay')).toHaveCount(0);
            await page.addScriptTag({ content: `${axe.source}\nwindow.adminAuditAxe = window.axe;` });
            const accessibility = await page.evaluate(async () => {
              const root = document.getElementById('storybook-root');
              if (!root) throw new Error('Story content is unavailable');
              return window.adminAuditAxe.run(root, {
                runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
              });
            });
            await page.evaluate(() => window.scrollTo(0, 0));
            const overflow = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
            const violations = accessibility.violations.map((violation) => ({
              id: violation.id, impact: violation.impact,
              nodes: violation.nodes.map((node) => ({ target: node.target, summary: node.failureSummary })),
            }));
            results.push({ name, viewport: viewport.name, overflow, violations, runtimeErrors: [...runtimeErrors] });
            if (runtimeErrors.length) failures.push(`${name}: ${runtimeErrors.join("; ")}`);
            if (overflow.scroll > overflow.width + 1) failures.push(`${name}: horizontal overflow ${overflow.scroll}/${overflow.width}`);
            if (violations.length) failures.push(`${name}: ${violations.map((violation) => violation.id).join(', ')}`);
            if (captureDirectory) {
              await page.screenshot({ path: resolve(captureDirectory, `${name}-${viewport.name}.png`), fullPage: true });
              await page.screenshot({ path: resolve(captureDirectory, `${name}-${viewport.name}-viewport.png`) });
            }
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            results.push({ name, viewport: viewport.name, error: message });
            failures.push(`${name}: ${message}`);
            console.error(`${viewport.name}/${name}: ${message}`);
            console.error(await page.locator("body").innerText().catch(() => "Page unavailable"));
          }
        });
        if (captureDirectory) await writeFile(resolve(captureDirectory, `${viewport.name}-checks.json`), JSON.stringify(results, null, 2));
      }
      if (captureDirectory) await writeFile(resolve(captureDirectory, `${viewport.name}-checks.json`), JSON.stringify(results, null, 2));
      expect(failures).toEqual([]);
    });
  }

  test('captures the integrated context dialog and scope home in both responsive themes', async ({ page }) => {
    test.setTimeout(240_000);
    const results: unknown[] = [];
    for (const viewport of [{ name: 'desktop', width: 1440, height: 1000, theme: 'light' }, { name: 'mobile', width: 390, height: 844, theme: 'dark' }] as const) {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: viewport.theme, reducedMotion: 'reduce' });
      const runtimeErrors: string[] = [];
      const collectRuntimeError = (error: Error) => runtimeErrors.push(error.message);
      page.on('pageerror', collectRuntimeError);
      await page.goto(`${storybookURL}/iframe.html?id=admin-event-management-event-workspace-overview--integrated-shell-hub-and-editor&viewMode=story&embed=true&globals=theme:${viewport.theme};motion:reduced`);
      await expect(page.locator('#webpack-hot-middleware-clientOverlay')).toHaveCount(0);
      const menu = page.getByRole('button', { name: 'Abrir menu', exact: true });
      if (viewport.name === 'mobile') {
        await expect(menu).toBeVisible({ timeout: 20_000 });
        await menu.click();
      }
      await page.getByRole('button', { name: 'Escolher evento', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Escolher contexto' });
      await expect(dialog.getByRole('searchbox')).toBeFocused();
      const majorEvent = dialog.getByRole('button', { name: 'Selecionar Semana da Computação', exact: true });
      await expect(majorEvent).toBeVisible();
      await page.addScriptTag({ content: `${axe.source}\nwindow.adminAuditAxe = window.axe;` });
      const dialogAccessibility = await page.evaluate(async () => window.adminAuditAxe.run(document, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
      }));
      expect(dialogAccessibility.violations.map((violation) => violation.id)).toEqual([]);
      if (captureDirectory) {
        await mkdir(resolve(captureDirectory), { recursive: true });
        await page.screenshot({ path: resolve(captureDirectory, `event-workspace-dialog-${viewport.name}.png`) });
      }
      await majorEvent.click();
      await expect(page.getByRole('heading', { name: 'Programação', exact: true })).toBeVisible();
      if (captureDirectory) await page.screenshot({ path: resolve(captureDirectory, `event-workspace-${viewport.name}.png`), fullPage: true });
      if (viewport.name === 'mobile') await menu.click();
      await page.getByRole('link', { name: 'Configurações', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Editar grande evento', exact: true })).toBeVisible();
      const accessibility = await page.evaluate(async () => window.adminAuditAxe.run(document, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
      }));
      const overflow = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
      const violations = accessibility.violations.map((violation) => violation.id);
      results.push({ name: 'event-workspace', viewport: viewport.name, overflow, violations, runtimeErrors: [...runtimeErrors] });
      if (captureDirectory) await page.screenshot({ path: resolve(captureDirectory, `event-workspace-editor-${viewport.name}.png`), fullPage: true });
      expect(runtimeErrors).toEqual([]);
      expect(overflow.scroll).toBeLessThanOrEqual(overflow.width + 1);
      expect(violations).toEqual([]);
      page.off('pageerror', collectRuntimeError);
    }
    if (captureDirectory) await writeFile(resolve(captureDirectory, 'event-workspace-checks.json'), JSON.stringify(results, null, 2));
  });

  test('moves through the scoped hierarchy and returns by immediate parent', async ({ page }) => {
    test.setTimeout(120_000);
    for (const viewport of [{ name: 'desktop', width: 1440, height: 1000, theme: 'light' }, { name: 'mobile', width: 390, height: 844, theme: 'dark' }] as const) {
      const childQueries: { operationName?: string; variables?: Record<string, unknown> }[] = [];
      const collectChildQuery = (request: import('@playwright/test').Request) => {
        if (request.method() !== 'POST') return;
        try {
          const payload = request.postDataJSON() as { operationName?: string; query?: string; variables?: Record<string, unknown> };
          if (payload.operationName === 'AdminEventContextPage' || payload.query?.includes('AdminEventContextPage')) {
            childQueries.push({ ...payload, operationName: 'AdminEventContextPage' });
          }
        } catch {
          // Ignore non-GraphQL POST bodies from the Storybook runtime.
        }
      };
      page.on('request', collectChildQuery);
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: viewport.theme, reducedMotion: 'reduce' });
      await page.goto(`${storybookURL}/iframe.html?id=admin-event-management-event-workspace-overview--integrated-shell-hub-and-editor&viewMode=story&embed=true&globals=theme:${viewport.theme};motion:reduced`);
      const menu = page.getByRole('button', { name: 'Abrir menu', exact: true });
      const openContextNavigation = async () => {
        const navigation = page.getByRole('navigation', { name: 'Operações do evento', exact: true });
        if (!(await navigation.isVisible())) await menu.click();
        await expect(navigation).toBeVisible();
        return navigation;
      };
      if (viewport.name === 'mobile') await menu.click();
      await page.getByRole('button', { name: 'Escolher evento', exact: true }).click();
      let dialog = page.getByRole('dialog', { name: 'Escolher contexto' });
      await expect(dialog.getByRole('button', { name: 'Selecionar Semana da Computação', exact: true })).toBeVisible();
      await expect(dialog.getByRole('button', { name: 'Selecionar Grupo sem vínculo', exact: true })).toBeVisible();
      await expect(dialog.getByRole('button', { name: 'Selecionar Oficina independente', exact: true })).toBeVisible();
      await expect(dialog.getByRole('button', { name: 'Selecionar Semana Acadêmica 2025', exact: true })).toHaveCount(0);
      await dialog.getByRole('button', { name: 'Expandir Semana da Computação', exact: true }).click();
      await expect(dialog.getByRole('button', { name: 'Selecionar Trilha de desenvolvimento web', exact: true })).toBeVisible();
      await expect(dialog.getByRole('button', { name: 'Selecionar Oficina de acessibilidade 1', exact: true })).toBeVisible();
      if (captureDirectory) await page.screenshot({ path: resolve(captureDirectory, `event-workspace-hierarchy-expanded-${viewport.name}.png`), fullPage: true });
      await expect(dialog.getByRole('button', { name: 'Próxima página de Semana da Computação', exact: true })).toHaveCount(0);
      await expect(dialog.getByRole('button', { name: 'Selecionar Oficina de acessibilidade 1', exact: true })).toBeVisible();
      await dialog.getByRole('button', { name: 'Próxima página de contextos', exact: true }).click();
      await expect(dialog.getByRole('button', { name: 'Selecionar Semana Acadêmica 2025', exact: true })).toBeVisible();
      await dialog.getByRole('button', { name: 'Página anterior de contextos', exact: true }).click();
      const search = dialog.getByRole('searchbox', { name: 'Buscar contexto', exact: true });
      await search.fill('Oficina');
      await expect(dialog.getByRole('button', { name: 'Selecionar Oficina de acessibilidade 1', exact: true })).toBeVisible();
      const rankedResults = dialog.getByRole('button', { name: /^Selecionar / });
      await expect(rankedResults.nth(0)).toHaveAccessibleName('Selecionar Oficina de acessibilidade 1');
      await expect(rankedResults.nth(1)).toHaveAccessibleName('Selecionar Oficina independente');
      await expect(dialog.getByText(/Evento, tipo: Palestra .* publicação: Publicado/)).toBeVisible();
      await expect(dialog.getByText('Sala 1', { exact: true })).toBeVisible();
      await expect(dialog.getByText(/Em:.*Semana da Computação/)).toBeVisible();
      if (captureDirectory) await page.screenshot({ path: resolve(captureDirectory, `event-workspace-ranked-search-${viewport.name}.png`), fullPage: true });
      await search.fill('');
      await expect(dialog.getByRole('button', { name: 'Selecionar Semana da Computação', exact: true })).toBeVisible();
      await dialog.getByRole('button', { name: 'Selecionar Semana da Computação', exact: true }).click();

      let navigation = await openContextNavigation();
      await navigation.getByRole('button', { name: 'Abrir evento neste contexto', exact: true }).click();
      dialog = page.getByRole('dialog', { name: 'Eventos deste contexto' });
      await expect(dialog.getByRole('button', { name: 'Selecionar Oficina de acessibilidade 1', exact: true })).toBeVisible();
      await expect(dialog.getByRole('button', { name: 'Selecionar Laboratório do grupo 1', exact: true })).toHaveCount(0);
      await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();

      navigation = await openContextNavigation();
      await navigation.getByRole('button', { name: 'Abrir grupo neste contexto', exact: true }).click();
      dialog = page.getByRole('dialog', { name: 'Grupos deste contexto' });
      await expect(dialog.getByRole('button', { name: 'Selecionar Trilha de desenvolvimento web', exact: true })).toBeVisible();
      await expect(dialog.getByRole('button', { name: 'Selecionar Grupo sem vínculo', exact: true })).toHaveCount(0);
      await dialog.getByRole('button', { name: 'Selecionar Trilha de desenvolvimento web', exact: true }).click();

      navigation = await openContextNavigation();
      await expect(navigation.getByRole('button', { name: 'Voltar para Semana da Computação', exact: true })).toBeVisible();
      await navigation.getByRole('button', { name: 'Abrir evento neste contexto', exact: true }).click();
      dialog = page.getByRole('dialog', { name: 'Eventos deste contexto' });
      await expect(dialog.getByRole('button', { name: 'Selecionar Laboratório do grupo 1', exact: true })).toBeVisible();
      await expect(dialog.getByRole('button', { name: 'Selecionar Oficina de acessibilidade 1', exact: true })).toHaveCount(0);
      if (captureDirectory) await page.screenshot({ path: resolve(captureDirectory, `event-workspace-group-events-${viewport.name}.png`), fullPage: true });
      await dialog.getByRole('button', { name: 'Selecionar Laboratório do grupo 1', exact: true }).click();

      navigation = await openContextNavigation();
      await navigation.getByRole('button', { name: 'Voltar para Trilha de desenvolvimento web', exact: true }).click();
      await expect(page).toHaveURL(/#\/event-workspace\/group\/workspace-group$/);
      navigation = await openContextNavigation();
      await navigation.getByRole('button', { name: 'Voltar para Semana da Computação', exact: true }).click();
      await expect(page).toHaveURL(/#\/event-workspace\/major-event\/workspace-major$/);
      expect(childQueries).toEqual(expect.arrayContaining([
        expect.objectContaining({ operationName: 'AdminEventContextPage', variables: expect.objectContaining({ parentKind: 'MAJOR_EVENT', parentId: 'workspace-major', childKind: 'EVENT' }) }),
        expect.objectContaining({ operationName: 'AdminEventContextPage', variables: expect.objectContaining({ parentKind: 'MAJOR_EVENT', parentId: 'workspace-major', childKind: 'EVENT_GROUP' }) }),
        expect.objectContaining({ operationName: 'AdminEventContextPage', variables: expect.objectContaining({ parentKind: 'EVENT_GROUP', parentId: 'workspace-group', childKind: 'EVENT' }) }),
      ]));
      if (captureDirectory) await page.screenshot({ path: resolve(captureDirectory, `event-workspace-hierarchy-${viewport.name}.png`) });
      page.off('request', collectChildQuery);
    }
  });

  test('creates and edits standalone certificate folders without a generic scope selector', async ({ page }) => {
    test.setTimeout(90_000);
    for (const viewport of [{ name: 'desktop', width: 1440, height: 1000, theme: 'light' }, { name: 'mobile', width: 390, height: 844, theme: 'dark' }] as const) {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: viewport.theme, reducedMotion: 'reduce' });
      await page.goto(`${storybookURL}/iframe.html?id=admin-settings-certificates--standalone-certificate-folder&viewMode=story&embed=true&globals=theme:${viewport.theme};motion:reduced`);
      await expect(page.locator('#webpack-hot-middleware-clientOverlay')).toHaveCount(0);
      await expect(page.getByRole('heading', { name: 'Certificados avulsos', level: 1 })).toBeVisible();
      await expect(page.getByRole('combobox', { name: 'Escopo' })).toHaveCount(0);
      await expect(page.getByRole('searchbox', { name: 'Buscar pasta' })).toBeVisible();
      if (captureDirectory) await page.screenshot({ path: resolve(captureDirectory, `standalone-certificates-browser-${viewport.name}.png`), fullPage: true });

      await page.getByRole('button', { name: 'Nova pasta' }).click();
      await page.getByRole('textbox', { name: 'Nome da pasta' }).fill('Extensão universitária');
      await expect(page.getByRole('button', { name: 'Criar pasta' })).toBeVisible();
      if (captureDirectory) await page.screenshot({ path: resolve(captureDirectory, `standalone-certificates-new-folder-${viewport.name}.png`), fullPage: true });
      await page.getByRole('button', { name: 'Cancelar' }).click();
      await expect(page.getByRole('heading', { name: 'Nova pasta', level: 3 })).toHaveCount(0);

      await page.getByRole('link', { name: 'Abrir pasta Atividades complementares' }).click();
      await page.getByRole('button', { name: 'Editar pasta' }).click();
      await expect(page.getByRole('textbox', { name: 'Nome da pasta' })).toHaveValue('Atividades complementares');
      await expect(page.getByRole('button', { name: 'Salvar alterações' })).toBeVisible();

      await page.addScriptTag({ content: `${axe.source}\nwindow.adminAuditAxe = window.axe;` });
      const audit = await page.evaluate(async () => {
        const root = document.getElementById('storybook-root');
        if (!root) throw new Error('Story content is unavailable');
        return window.adminAuditAxe.run(root, {
          runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
        });
      });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(audit.violations.map((violation) => violation.id)).toEqual([]);
      expect(overflow).toBeLessThanOrEqual(1);
      if (captureDirectory) await page.screenshot({ path: resolve(captureDirectory, `standalone-certificates-flow-${viewport.name}.png`), fullPage: true });
    }
  });

  test('keeps operations in the contextual sidebar and exposes global tools without discarding work', async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`${storybookURL}/iframe.html?id=admin-event-management-event-workspace-overview--integrated-shell-hub-and-editor&viewMode=story&embed=true`);
    await expect(page.locator('#webpack-hot-middleware-clientOverlay')).toHaveCount(0);
    await page.getByRole('button', { name: 'Escolher evento', exact: true }).click();
    await page.getByRole('dialog', { name: 'Escolher contexto' }).getByRole('button', { name: 'Selecionar Semana da Computação', exact: true }).click();
    await expect(page.getByRole('button', { name: /Trocar contexto: Semana da Computação/ })).toBeVisible();
    const majorNavigation = page.getByRole('navigation', { name: 'Operações do evento', exact: true });
    await expect(page.getByRole('heading', { name: 'Programação', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Grupos de eventos', exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Configurações', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Editar grande evento', exact: true })).toBeVisible();
    await expect(majorNavigation.getByRole('link', { name: 'Configurações', exact: true })).toHaveCount(1);
    await majorNavigation.getByRole('link', { name: 'Visão geral', exact: true }).click();
    await page.getByRole('link', { name: 'Oficina de acessibilidade 1', exact: true }).click();
    const contextNavigation = page.getByRole('navigation', { name: 'Operações do evento', exact: true });
    await expect(contextNavigation.getByRole('link', { name: 'Visão geral', exact: true })).toHaveCount(0);
    await expect(contextNavigation.getByRole('link', { name: 'Configurações', exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(contextNavigation.getByRole('link', { name: 'Configurações', exact: true })).toHaveCount(1);
    await expect(page.getByRole('heading', { name: 'Editar evento', exact: true })).toBeVisible();
    await expect(page.getByLabel('Emoji', { exact: true })).toHaveValue('♿');
    await expect(page.getByRole('button', { name: /Trocar contexto: Oficina de acessibilidade 1/ }).locator('lib-twemoji img')).toHaveCount(1);
    await expect(page.getByRole('tablist', { name: 'Operações do evento', exact: true })).toHaveCount(0);
    await expect(page.getByRole('searchbox', { name: 'Buscar eventos', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Mais ações', exact: true }).click();
    await expect(page.getByRole('menuitem', { name: 'Duplicar', exact: true })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Excluir', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await contextNavigation.getByRole('link', { name: 'Formulários', exact: true }).click();
    await expect(page.getByRole('searchbox', { name: 'Buscar formulário', exact: true })).toBeVisible();
    await page.getByRole('link', { name: /Abrir formulário/ }).first().click();
    await expect(page).toHaveURL(/eventId=activity-1/);
    await expect(contextNavigation.getByRole('link', { name: 'Formulários', exact: true })).toHaveAttribute('aria-current', 'page');
    await contextNavigation.getByRole('link', { name: 'Sorteios', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Novo sorteio', exact: true })).toBeVisible();
    await expect(contextNavigation.getByRole('link', { name: 'Sorteios', exact: true })).toHaveAttribute('aria-current', 'page');
    await page.getByRole('textbox', { name: 'Título', exact: true }).fill('Configuração ainda não salva');
    await expect(page.getByRole('button', { name: /Trocar contexto: Oficina de acessibilidade 1/ })).toBeDisabled();
    await page.getByRole('button', { name: 'Menu global', exact: true }).click();
    const globalNavigation = page.getByRole('navigation', { name: 'Navegação interna', exact: true });
    await expect(globalNavigation.getByRole('link', { name: 'Pessoas', exact: true })).toBeVisible();
    await expect(globalNavigation.getByRole('link', { name: 'Pessoas duplicadas', exact: true })).toBeVisible();
    await expect(globalNavigation.getByRole('link', { name: 'Certificados avulsos', exact: true })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Título', exact: true })).toHaveValue('Configuração ainda não salva');
    await page.getByRole('button', { name: 'Menu do contexto', exact: true }).click();
    await page.getByRole('button', { name: 'Descartar alterações', exact: true }).click();
    await expect(page.getByRole('button', { name: /Trocar contexto: Oficina de acessibilidade 1/ })).toBeEnabled();
  });

  test('uses canonical creation routes and carries the selected parent into child editors', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const storyUrl = `${storybookURL}/iframe.html?id=admin-event-management-event-workspace-overview--integrated-shell-hub-and-editor&viewMode=story&embed=true`;

    await page.goto(storyUrl);
    await page.getByRole('button', { name: 'Escolher evento', exact: true }).click();
    await page.getByRole('dialog', { name: 'Escolher contexto' }).getByRole('button', { name: 'Selecionar Semana da Computação', exact: true }).click();
    const contextNavigation = page.getByRole('navigation', { name: 'Operações do evento', exact: true });
    await contextNavigation.getByRole('button', { name: 'Novo evento neste contexto', exact: true }).click();
    await expect(page).toHaveURL(/#\/event-workspace\/new\/event\?majorEventId=workspace-major$/);
    await expect(page.getByRole('heading', { name: 'Novo evento', exact: true, level: 3 })).toBeVisible();
    await expect(page.getByRole('button', { name: /Semana da Computação.*Alterar vínculo/ })).toBeVisible();

    await page.goto(storyUrl);
    await page.getByRole('button', { name: 'Escolher evento', exact: true }).click();
    await page.getByRole('dialog', { name: 'Escolher contexto' }).getByRole('button', { name: 'Selecionar Semana da Computação', exact: true }).click();
    await page.getByRole('navigation', { name: 'Operações do evento', exact: true }).getByRole('button', { name: 'Novo grupo neste grande evento', exact: true }).click();
    await expect(page).toHaveURL(/#\/event-workspace\/new\/group\?majorEventId=workspace-major$/);
    await expect(page.getByRole('heading', { name: 'Novo grupo', exact: true, level: 3 })).toBeVisible();
    await expect(page.getByText(/Restrições herdadas: Grande evento “Semana da Computação”/)).toBeVisible();

    await page.goto(storyUrl);
    await page.getByRole('button', { name: 'Escolher evento', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Escolher contexto' });
    await dialog.getByRole('button', { name: 'Novo grande evento', exact: true }).click();
    await expect(page).toHaveURL(/#\/event-workspace\/new\/major-event$/);
    await expect(page.getByRole('heading', { name: 'Novo grande evento', exact: true, level: 3 })).toBeVisible();
  });

  test('opens context search as a keyboard-focused dialog and switches the sidebar', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`${storybookURL}/iframe.html?id=admin-event-management-event-workspace-overview--integrated-shell-hub-and-editor&viewMode=story&embed=true`);
    await page.getByRole('button', { name: 'Escolher evento', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const search = dialog.getByRole('searchbox');
    await expect(search).toBeFocused();
    await search.fill('independente');
    const result = dialog.getByRole('button', { name: 'Selecionar Oficina independente', exact: true });
    await result.focus();
    await page.keyboard.press('Enter');
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('button', { name: /Trocar contexto: Oficina independente/ })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Operações do evento', exact: true }).getByRole('link', { name: 'Formulários', exact: true })).toHaveAttribute('href', /forms\/event\/workspace-event$/);
  });

  test('scope selection remains keyboard accessible and preserves a collapsed context', async ({ page }) => {
    await page.goto(`${storybookURL}/iframe.html?id=admin-event-management-event-workspace-scope--playground&viewMode=story&embed=true`);
    const header = page.getByRole('button', { name: /Oficina de acessibilidade/ });
    await expect(header).toHaveAttribute('aria-expanded', 'false');
    await header.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByText('Seletor de eventos')).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(header).toHaveAttribute('aria-expanded', 'false');
  });

  test('event filters preserve membership choices across disclosure', async ({ page }) => {
    await page.goto(`${storybookURL}/iframe.html?id=admin-event-management-filters--empty-filters&viewMode=story&embed=true`);
    const filters = page.getByRole('button', { name: /Filtros/ });
    await filters.click();
    await page.getByRole('combobox', { name: 'Vínculo com grupo', exact: true }).click();
    await page.getByRole('option', { name: 'Com grupo', exact: true }).click();
    await expect(filters).toContainText('1 ativo');
    await filters.click();
    await expect(filters).toHaveAttribute('aria-expanded', 'false');
    await filters.click();
    await expect(page.getByRole('combobox', { name: 'Vínculo com grupo', exact: true })).toContainText('Com grupo');
  });
});
