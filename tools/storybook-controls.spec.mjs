import { expect, test } from '@playwright/test';

const publicUrl = process.env.STORYBOOK_PUBLIC_URL;
const adminUrl = process.env.STORYBOOK_ADMIN_URL;

async function openStory(page, url, id) {
  await page.goto(`${url}/?path=/story/${id}`);
  const iframe = await page.locator('#storybook-preview-iframe').elementHandle();
  const frame = await iframe.contentFrame();
  await frame.waitForFunction((storyId) =>
    window.__STORYBOOK_PREVIEW__?.storyRenders.some((render) => render.story?.id === storyId && render.phase === 'finished'),
  id);
  await page.getByRole('tab', { name: /^Controls/ }).click();
  return frame;
}

function controlRow(page, name) {
  return page.getByRole('row').filter({ has: page.getByText(name, { exact: true }) });
}

async function setText(page, name, value) {
  const input = controlRow(page, name).getByRole('textbox');
  await input.fill(value);
  await input.press('Tab');
}

test('signal-backed page controls update the greeting and empty state', async ({ page }) => {
  test.skip(!publicUrl, 'Set STORYBOOK_PUBLIC_URL to the public Storybook.');
  const frame = await openStory(page, publicUrl, 'public-discovery-my-day--playground');
  await setText(page, 'Participant Name', 'Renata Controle');
  await expect(frame.getByRole('heading', { level: 1 })).toContainText('Renata');
  await controlRow(page, 'View State').getByRole('combobox').selectOption('empty');
  await expect(frame.getByText('Nada marcado para este dia')).toBeVisible();
});

test('injected dialog data follows text and action controls', async ({ page }) => {
  test.skip(!publicUrl, 'Set STORYBOOK_PUBLIC_URL to the public Storybook.');
  const frame = await openStory(page, publicUrl, 'public-ticketing-transfers-confirmation--playground');
  await setText(page, 'ticketName', 'Bilhete de controle');
  await expect(frame.getByText(/Bilhete de controle/)).toBeVisible();
  await controlRow(page, 'action').getByRole('combobox').selectOption('ignore');
  await expect(frame.getByRole('button', { name: 'Ignorar pedido' })).toBeVisible();
  await expect(frame.getByRole('button', { name: 'Receber bilhete' })).toHaveCount(0);
});

test('oral attendance preserves decisions when presentation controls change', async ({ page }) => {
  test.skip(!publicUrl, 'Set STORYBOOK_PUBLIC_URL to the public Storybook.');
  const frame = await openStory(page, publicUrl, 'shared-attendance-oral-attendance--playground');
  const attendeeName = await frame.getByRole('heading', { level: 2 }).textContent();
  await setText(page, 'title', 'Chamada de controle');
  await expect(frame.getByText('Chamada de controle', { exact: true })).toBeVisible();
  await expect(frame.getByRole('heading', { level: 2 })).toHaveText(attendeeName);
  await controlRow(page, 'peopleCount').getByRole('slider').press('Home');
  await expect(frame.getByRole('button', { name: 'Marcar como faltou' })).toHaveCount(0);
});

test('theme toolbar updates browser media queries used by components', async ({ page }) => {
  test.skip(!publicUrl, 'Set STORYBOOK_PUBLIC_URL to the public Storybook.');
  const frame = await openStory(page, publicUrl, 'public-discovery-my-day--playground');
  await page.getByRole('button', { name: /Color scheme/ }).click();
  await page.getByText('Dark', { exact: true }).click();
  await expect.poll(() => frame.evaluate(() => window.matchMedia('(prefers-color-scheme: dark)').matches)).toBe(true);
});

test('admin data scenarios refresh constructor-loaded state', async ({ page }) => {
  test.skip(!adminUrl, 'Set STORYBOOK_ADMIN_URL to the admin Storybook.');
  const frame = await openStory(page, adminUrl, 'admin-dashboard-home--playground');
  await setText(page, 'organizerName', 'Renata Controle');
  await expect(frame.getByRole('heading', { level: 1 })).toContainText('Renata');
  await controlRow(page, 'state').getByRole('combobox').selectOption('loading');
  await expect(frame.locator('section.loading-state')).toBeVisible();
});

test('scenario controls cannot replace component signals with primitive values', async ({ page }) => {
  test.skip(!publicUrl, 'Set STORYBOOK_PUBLIC_URL to the public Storybook.');
  const frame = await openStory(page, publicUrl, 'public-profile-attendance-history-list--playground');
  await expect.poll(() => frame.getByRole('link').count()).toBeGreaterThan(10);
  await controlRow(page, 'certificateArchiveCooldownSeconds').getByRole('slider').press('End');
  await expect(frame.getByRole('button', { name: /Baixar certificados em/ })).toBeDisabled();
  await expect.poll(() => frame.getByRole('link').count()).toBeGreaterThan(10);
});

test('shared admin page-provider controls replace the selected event data', async ({ page }) => {
  test.skip(!adminUrl, 'Set STORYBOOK_ADMIN_URL to the admin Storybook.');
  const frame = await openStory(page, adminUrl, 'admin-event-management-major-events--playground');
  await expect(frame.getByRole('heading', { name: 'Editar grande evento', exact: true })).toBeVisible();
  await controlRow(page, 'mode').getByRole('combobox').selectOption('empty');
  await expect(frame.getByRole('heading', { name: 'Novo grande evento', exact: true })).toBeVisible();
});

test('wallet provider controls reload the displayed identity', async ({ page }) => {
  test.skip(!publicUrl, 'Set STORYBOOK_PUBLIC_URL to the public Storybook.');
  const frame = await openStory(page, publicUrl, 'public-profile-wallet--playground');
  await setText(page, 'fullName', 'Renata Carteira');
  await expect.poll(() => frame.getByText('Renata Carteira', { exact: true }).count()).toBeGreaterThan(0);
});
