import type { Page } from '@playwright/test';
import {
  createParticipationInformationFixture,
  participationInformationGraphqlData,
  type ParticipationInformationOptions,
} from '@cacic-fct/event-manager-public-testing';
import { authenticatedUserFixture } from './authenticated-user.fixture';
import { fulfillCurrentUserDefaultRedirect } from './current-user-default-redirect';

export async function mockInformation(
  page: Page,
  options: ParticipationInformationOptions & { weather?: boolean } = {},
  authenticated = true,
) {
  const fixture = createParticipationInformationFixture(options);
  const queries: string[] = [];
  await page.addInitScript(() => {
    sessionStorage.setItem('cacic-eventos:silent-sso-attempted', 'true');
    localStorage.setItem('cacic.cookieBanner.enabled', 'false');
  });
  await page.route('https://unleash.cacic.com.br/**', (route) => route.fulfill({ json: { toggles: [] } }));
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/app(?=\/api\/)/, '');
    if (path === '/api/auth/me') {
      await route.fulfill({ status: authenticated ? 200 : 401, json: authenticated ? authenticatedUserFixture() : {} });
    } else if (path === '/api/graphql') {
      const { query, variables = {} } = route.request().postDataJSON();
      queries.push(query);
      if (await fulfillCurrentUserDefaultRedirect(route, query)) return;
      const data = participationInformationGraphqlData(query, variables, fixture);
      if (options.weather && query.includes('query PublicEventPage') && fixture.events[0]) {
        data['publicEventWeather'] = {
          eventId: fixture.events[0].id,
          temperature: 24,
          weatherCode: 1,
          summary: 'Ensolarado',
          materialIcon: 'wb_sunny',
          forecastTime: fixture.events[0].startDate,
          fetchedAt: new Date().toISOString(),
          attribution: 'Open-Meteo',
        };
      }
      await route.fulfill({ json: { data } });
    } else if (path.includes('/realtime')) {
      await route.fulfill({ contentType: 'text/event-stream', body: ':\n\n' });
    } else if (path.includes('/materials')) {
      await route.fulfill({ json: { links: [], updatedAt: null } });
    } else {
      await route.fulfill({ status: 204, body: '' });
    }
  });
  return { ...fixture, queries };
}
