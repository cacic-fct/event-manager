import { expect, test } from './support/e2e-test';
import { mockInformation } from './support/unified-information.fixture';

test('the unified event page keeps participation tools and its return destination', async ({ page }) => {
  const data = await mockInformation(page);
  await page.goto(`/app/event/${data.targetId}?returnUrl=%2Fprofile%2Fattendances`);
  await expect(page).toHaveURL(new RegExp(`/app/event/${data.targetId}\\?returnUrl=`));
  await expect(page.getByRole('heading', { name: data.events[0].name, exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Meu certificado' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  await expect(page.getByRole('tab', { name: 'Minha inscrição', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.getByRole('button', { name: 'Orientações', exact: true }).click();
  await expect(page.getByText('Leve seu notebook', { exact: false })).toBeVisible();
  const cancellation = page.getByRole('button', { name: 'Cancelar inscrição' });
  await expect(cancellation).toBeVisible();
  await expect(
    page.locator('.participation-workspace').getByRole('button', { name: 'Cancelar inscrição' }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Informações', exact: true })).toBeHidden();
  await page.getByRole('tab', { name: 'Sobre o evento', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Informações', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Meu certificado' })).toBeHidden();
  await page.getByRole('tab', { name: 'Minha inscrição', exact: true }).click();
  await expect(cancellation).toBeVisible();
});

test('the unified major-event page keeps payment tools and a working day filter', async ({ page }) => {
  const data = await mockInformation(page, { targetType: 'major-event', subscriptionStatus: 'WAITING_RECEIPT_UPLOAD' });
  await page.goto(`/app/major-event/${data.targetId}?returnUrl=%2Fprofile%2Fattendances`);
  await expect(page).toHaveURL(new RegExp(`/app/major-event/${data.targetId}\\?returnUrl=`));
  await expect(page.getByRole('heading', { name: 'Meu certificado' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Materiais', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Orientações', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Enviar comprovante', exact: true }).first()).toHaveAttribute(
    'href',
    `/app/major-event/${data.targetId}/payment`,
  );
  await expect(page.getByRole('heading', { name: 'Programação', exact: true })).toBeHidden();
  await page.getByRole('tab', { name: 'Sobre o evento', exact: true }).click();
  const program = page.locator('section.program');
  await expect(program.getByRole('link', { name: new RegExp(data.events[2].name) })).toBeVisible();
  await page.getByRole('radio').nth(1).click();
  await expect(program.getByRole('link', { name: new RegExp(data.events[0].name) })).toBeVisible();
  await expect(program.getByRole('link', { name: new RegExp(data.events[2].name) })).toBeHidden();
});

test('event groups show aggregate participation and let people open an activity', async ({ page }) => {
  const data = await mockInformation(page, { targetType: 'event-group', eventCount: 3 });
  await page.goto(`/app/event-group/${data.targetId}`);
  await expect(page.getByRole('heading', { name: data.eventGroup.name })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Eventos do grupo' })).toBeVisible();
  await expect(page.locator('section.program').getByRole('link')).toHaveCount(3);
  await expect(page.locator('app-sticky-date-header')).toHaveCount(3);
  await page
    .locator('section.program')
    .getByRole('link', { name: new RegExp(data.events[0].name) })
    .click();
  await expect(page).toHaveURL(new RegExp(`/app/event/${data.events[0].id}`));
  await expect(page.getByRole('heading', { name: data.events[0].name, exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: `Ver grupo: ${data.eventGroup.name}` })).toHaveAttribute(
    'href',
    `/app/event-group/${data.targetId}?returnUrl=%2Fevent%2F${data.events[0].id}`,
  );
});

test('a non-subscribed visitor can read the page without requesting private workspace data', async ({ page }) => {
  const data = await mockInformation(page, { subscribed: false }, false);
  await page.goto(`/app/event/${data.targetId}`);
  await expect(page.getByRole('heading', { name: data.events[0].name, exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Entrar para inscrever-se' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Meu certificado' })).toBeHidden();
  await expect(page.getByRole('tablist')).toHaveCount(0);
  expect(data.queries.some((query) => query.includes('query CurrentUserEventDetails'))).toBe(false);
});

test('certificate-only participation remains accessible without a subscription', async ({ page }) => {
  const data = await mockInformation(page, { subscribed: false, issuedCertificate: true });
  await page.goto(`/app/event/${data.targetId}`);
  await expect(page.getByRole('button', { name: 'Baixar certificado' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cancelar inscrição' })).toBeHidden();
});

test('mobile details keep primary tools and long activity names within the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const data = await mockInformation(page, { targetType: 'event-group', eventCount: 4 });
  await page.goto(`/app/event-group/${data.targetId}`);
  await expect(page.getByRole('heading', { name: 'Meu certificado' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('non-subscribed people can discover a group without a participation record', async ({ page }) => {
  const data = await mockInformation(page, { targetType: 'event-group', subscribed: false }, false);
  await page.goto(`/app/event-group/${data.targetId}`);
  await expect(page.getByRole('heading', { name: data.eventGroup.name })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Ver opções de inscrição' })).toBeVisible();
  await expect(page.locator('section.program').getByRole('link')).toHaveCount(3);
  await expect(page.getByRole('heading', { name: 'Meu certificado' })).toBeHidden();
});

test('closing registration does not hide a previously issued certificate', async ({ page }) => {
  const data = await mockInformation(page, { subscribed: false, issuedCertificate: true, allowSubscription: false });
  await page.goto(`/app/event/${data.targetId}`);
  await expect(page.getByRole('button', { name: 'Baixar certificado' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Inscrever-se', exact: true })).toBeHidden();
});

test('a private participation failure leaves the public event readable and offers retry', async ({ page }) => {
  const data = await mockInformation(page);
  await page.route('**/api/graphql', async (route) => {
    if (route.request().postDataJSON().query.includes('query CurrentUserEventDetails')) {
      await route.fulfill({ json: { errors: [{ message: 'Serviço indisponível.' }] } });
    } else {
      await route.fallback();
    }
  });
  await page.goto(`/app/event/${data.targetId}`);
  await expect(page.getByRole('heading', { name: data.events[0].name, exact: true })).toBeVisible();
  await expect(page.getByText('Não foi possível consultar sua participação agora.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tentar novamente' })).toBeVisible();
});

test('an updated-instructions notification opens the participant guidance automatically', async ({ page }) => {
  const data = await mockInformation(page);
  await page.goto(`/app/event/${data.targetId}?informationRevision=latest`);
  await expect(page.getByText('Leve seu notebook', { exact: false })).toBeVisible();
});

test('narrow subscriber subtabs use short labels, keyboard navigation and one line', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  const data = await mockInformation(page);
  await page.goto(`/app/event/${data.targetId}`);
  const subscription = page.getByRole('tab', { name: 'Inscrição', exact: true });
  const about = page.getByRole('tab', { name: 'Sobre', exact: true });
  await expect(subscription).toHaveAttribute('aria-selected', 'true');
  await expect(about).toBeVisible();
  const subscriptionBounds = await subscription.boundingBox();
  const aboutBounds = await about.boundingBox();
  expect(subscriptionBounds?.y).toBe(aboutBounds?.y);
  const headerBounds = await page.locator('mat-tab-header').boundingBox();
  if (!headerBounds || !subscriptionBounds || !aboutBounds) throw new Error('Both tab labels must be visible.');
  expect(subscriptionBounds.x).toBeGreaterThanOrEqual(headerBounds.x);
  expect(aboutBounds.x + aboutBounds.width).toBeLessThanOrEqual(headerBounds.x + headerBounds.width + 1);
  await expect(page.locator('.mat-mdc-tab-header-pagination-controls-enabled')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await subscription.focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await expect(about).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('heading', { name: 'Informações', exact: true })).toBeVisible();
});

test('signed-in non-subscribers have only event information, including existing certificate access', async ({
  page,
}) => {
  const data = await mockInformation(page, { targetType: 'major-event', subscribed: false, issuedCertificate: true });
  await page.goto(`/app/major-event/${data.targetId}`);
  await expect(page.getByRole('button', { name: 'Baixar certificado' })).toBeVisible();
  await expect(page.getByRole('tablist')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Programação', exact: true })).toBeVisible();
});

test('event context uses icon rows and links to the parent major event', async ({ page }) => {
  const data = await mockInformation(page, { targetType: 'major-event', subscribed: false });
  await page.goto(`/app/event/${data.events[0].id}`);
  await expect(page.getByRole('link', { name: new RegExp(data.majorEvent.name) })).toHaveAttribute(
    'href',
    `/app/major-event/${data.majorEvent.id}?returnUrl=%2Fevent%2F${data.events[0].id}`,
  );
  await expect(page.locator('mat-chip, mat-chip-set')).toHaveCount(0);
  const label = await page.getByText('Faz parte de', { exact: true }).boundingBox();
  const parentLink = await page.getByRole('link', { name: new RegExp(data.majorEvent.name) }).boundingBox();
  const icon = await page.locator('.parent-event-context > mat-icon').boundingBox();
  if (!label || !parentLink || !icon) throw new Error('The parent-event relationship must remain visible.');
  expect(Math.abs(label.x - parentLink.x)).toBeLessThan(1);
  expect(Math.abs(label.y - icon.y)).toBeLessThanOrEqual(3);
  expect(parentLink.height).toBeGreaterThanOrEqual(44);
});

test('general event information places weather beside location on desktop and facts last', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const data = await mockInformation(page, { subscribed: false, weather: true });
  await page.goto(`/app/event/${data.targetId}`);
  const location = page.getByRole('heading', { name: 'Localização', exact: true });
  const weather = page.getByRole('heading', { name: 'Clima', exact: true });
  await expect(location).toBeVisible();
  await expect(weather).toBeVisible();
  const locationBounds = await location.boundingBox();
  const weatherBounds = await weather.boundingBox();
  if (!locationBounds || !weatherBounds) throw new Error('Location and weather must render.');
  expect(Math.abs(locationBounds.y - weatherBounds.y)).toBeLessThan(2);
  expect(weatherBounds.x).toBeGreaterThan(locationBounds.x);
  await page.setViewportSize({ width: 390, height: 844 });
  const mobileLocation = await location.boundingBox();
  const mobileWeather = await weather.boundingBox();
  if (!mobileLocation || !mobileWeather) throw new Error('Location and weather must remain readable on mobile.');
  expect(mobileWeather.y).toBeGreaterThan(mobileLocation.y);
  const sections = page.locator('.reference-information');
  await expect(sections.getByRole('heading', { name: 'Informações', exact: true })).toBeVisible();
});
