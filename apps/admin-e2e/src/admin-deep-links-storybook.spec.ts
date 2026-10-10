import { test, expect } from './support/e2e-test';
import axe from 'axe-core';

const storybookURL = process.env['STORYBOOK_URL'];
const story = 'iframe.html?id=cacic-eventos-workspace-event-workspace--integrated-shell-hub-and-editor&viewMode=story&embed=true';

test.describe('admin deep links', () => {
  test.skip(!storybookURL, 'Requires the existing admin Storybook server.');

  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    test(`restores a copied context and native child links at ${viewport.width}px`, async ({ page, context }) => {
      await page.setViewportSize(viewport);
      await page.goto(`${storybookURL}/${story}#/event-workspace/major-event/workspace-major`);
      await expect(page.getByRole('heading', { name: 'Programação', exact: true })).toBeVisible();
      const group = page.getByRole('link', { name: 'Trilha de desenvolvimento web', exact: true });
      await expect(group).toHaveAttribute('href', '#/event-workspace/group/workspace-group');
      const event = page.getByRole('link', { name: 'Oficina de acessibilidade 1', exact: true });
      const bookmark = await event.evaluate((element: HTMLAnchorElement) => element.href);
      const otherTab = await context.newPage();
      await otherTab.goto(bookmark);
      await expect(otherTab.getByRole('heading', { name: 'Editar evento', exact: true })).toBeVisible();
      await expect(otherTab.locator('input[formcontrolname="name"]')).toHaveValue('Oficina de acessibilidade 1');
      await otherTab.reload();
      await expect(otherTab.locator('input[formcontrolname="name"]')).toHaveValue('Oficina de acessibilidade 1');
      await otherTab.close();
      await group.click();
      await expect(page.getByRole('link', { name: 'Laboratório do grupo 1', exact: true })).toBeVisible();
      await page.goBack();
      await expect(page).toHaveURL(/#\/event-workspace\/major-event\/workspace-major$/);
      await expect(group).toBeVisible();
      await page.goForward();
      await expect(page.getByRole('link', { name: 'Laboratório do grupo 1', exact: true })).toBeVisible();
      await page.addScriptTag({ content: axe.source });
      const violations = await page.evaluate(async () => {
        const root = document.getElementById('storybook-root');
        if (!root) throw new Error('Story content is unavailable');
        return (await window.axe.run(root, {
          runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
        })).violations.map((violation) => violation.id);
      });
      expect(violations).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      await page.screenshot({ path: test.info().outputPath(`deep-link-${viewport.width}.png`), fullPage: true });
    });
  }

  test('restores the form selection, scope and empty collection through reload and history', async ({ page }) => {
    await page.goto(`${storybookURL}/${story}#/forms/major-event/workspace-major`);
    const form = page.getByRole('link', { name: /^Abrir formulário/ }).first();
    await expect(form).toHaveAttribute('href', '#/forms/workspace-form?majorEventId=workspace-major');
    await form.click();
    await expect(form).toHaveAttribute('aria-current', 'page');
    const bookmark = page.url();
    await page.goBack();
    await expect(page).toHaveURL(/#\/forms\/major-event\/workspace-major$/);
    await expect(form).not.toHaveAttribute('aria-current', 'page');
    await page.goForward();
    await expect(page).toHaveURL(bookmark);
    await expect(form).toHaveAttribute('aria-current', 'page');
    await page.reload();
    await expect(page.getByRole('button', { name: 'Trocar contexto: Semana da Computação', exact: true })).toBeVisible();
    await expect(form).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('textarea[formcontrolname="description"]')).toBeVisible();
  });

  test('loads a bookmarked attendance participant directly and clears it on Back', async ({ page }) => {
    await page.goto(`${storybookURL}/${story}#/attendances/major-event/workspace-major`);
    const person = page.getByRole('link', { name: /^Consultar presenças de/ }).first();
    await expect(person).toBeVisible();
    await person.click();
    await expect(page).toHaveURL(/\/person\/[^/]+$/);
    await expect(page.locator('.attendance-detail h3')).toBeVisible();
    const bookmark = page.url();
    const name = await page.locator('.attendance-detail h3').textContent();
    if (!name) throw new Error('The bookmarked participant has no displayed name');
    await page.goBack();
    await expect(page.locator('.attendance-detail h3')).toHaveCount(0);
    await page.goto(bookmark);
    await expect(page.locator('.attendance-detail h3')).toHaveText(name);
    await page.reload();
    await expect(page.locator('.attendance-detail h3')).toHaveText(name);
  });
});
