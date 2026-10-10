import type { Page } from '@playwright/test';
import { expect, test } from './support/e2e-test';
import { authenticatedUserFixture } from './support/authenticated-user.fixture';
import { fulfillCurrentUserDefaultRedirect } from './support/current-user-default-redirect';
import {
  createPublicEvent,
  createPublicEventForm,
  createPublicEventFormLink,
  createPublicEventInterest,
  createPublicMajorEvent,
  publicFixtureDateFromNow,
} from '@cacic-fct/event-manager-public-testing';

test('keeps interest independent before registration, then hides it without erasing analytics history', async ({ page }) => {
  const api = await mockInterestFlow(page);
  await page.goto('/app/event/event-1');
  const interest = page.getByRole('button', { name: 'Quero ir: Palestra aberta' });
  await expect(interest).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Inscrever-se', exact: true })).toBeDisabled();
  await interest.click();
  await expect(interest).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('Seu interesse foi registrado! A inscrição, quando necessária, é feita separadamente.')).toBeVisible();
  await page.getByRole('button', { name: 'Fechar', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Prepare sua visita' })).toBeVisible();
  expect(api.state.subscriptionWrites).toBe(0);
  expect(api.state.interestWrites).toBe(1);

  api.event.subscriptionStartDate = publicFixtureDateFromNow(-1);
  await page.reload();
  await page.getByRole('button', { name: 'Inscrever-se', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Cancelar inscrição' })).toBeVisible();
  await expect(interest).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Prepare sua visita' })).toHaveCount(0);
  expect(api.state.interested).toBe(true);
  expect(api.state.subscriptionWrites).toBe(1);
  expect(api.state.interestWrites).toBe(1);
});

test('prevents changes to interest after the event ends', async ({ page }) => {
  const api = await mockInterestFlow(page);
  api.event.startDate = publicFixtureDateFromNow(-2);
  api.event.endDate = publicFixtureDateFromNow(-1);
  api.state.interested = true;
  await page.goto('/app/event/event-1');
  const interest = page.getByRole('button', { name: 'Quero ir: Palestra aberta' });
  await expect(interest).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Inscrever-se', exact: true })).toHaveCount(0);
  expect(api.state.interestWrites).toBe(0);
});

test('signals previous interest on major registration without selecting a place', async ({ page }) => {
  const api = await mockInterestFlow(page);
  api.state.interested = true;
  api.event.majorEventId = api.majorEvent.id;
  api.event.majorEvent = api.majorEvent;
  api.event.subscriptionStartDate = publicFixtureDateFromNow(-1);
  await page.goto('/app/major-event/major-1/subscription');
  await expect(page.getByText('Você marcou Quero ir')).toBeVisible();
  const checkbox = page.getByRole('checkbox', { name: 'Selecionar Palestra aberta' });
  await expect(checkbox).not.toBeChecked();
  expect(api.state.subscriptionWrites).toBe(0);
});

test('lets an unregistered walk-in open the online code page without creating interest or subscription', async ({ page }) => {
  const api = await mockInterestFlow(page);
  api.event.startDate = publicFixtureDateFromNow(-1);
  api.event.endDate = publicFixtureDateFromNow(1);
  api.event.shouldCollectAttendance = true;
  api.event.isOnlineAttendanceAllowed = true;
  api.event.onlineAttendanceStartDate = publicFixtureDateFromNow(-1);
  api.event.onlineAttendanceEndDate = publicFixtureDateFromNow(1);
  await page.goto('/app/event/event-1');
  await page.getByRole('button', { name: 'Confirmar presença', exact: true }).click();
  await page.getByRole('textbox', { name: 'Código de presença' }).fill('A1B2');
  await page.getByRole('button', { name: 'Confirmar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Palestra aberta' })).toBeVisible();
  expect(api.state.attended).toBe(true);
  expect(api.state.interestWrites).toBe(0);
  expect(api.state.subscriptionWrites).toBe(0);
});

async function mockInterestFlow(page: Page) {
  await page.addInitScript(() => {
    window.sessionStorage.setItem('cacic-eventos:silent-sso-attempted', 'true');
    window.localStorage.setItem('cacic.cookieBanner.enabled', 'false');
  });
  await page.route('https://unleash.cacic.com.br/api/frontend/**', (route) => route.fulfill({ status: 304, body: '' }));
  await page.route('https://cdn.jsdelivr.net/**', (route) => route.fulfill({ status: 204, body: '' }));
  const event = createPublicEvent({
    id: 'event-1', name: 'Palestra aberta', interestEnabled: true, attendanceEligibility: 'ANYONE',
    startDate: publicFixtureDateFromNow(3), endDate: publicFixtureDateFromNow(3, 14),
    subscriptionStartDate: publicFixtureDateFromNow(1), subscriptionEndDate: publicFixtureDateFromNow(2),
    majorEventId: null, majorEvent: null, eventGroupId: null, eventGroup: null,
    allowSubscription: true, requiresImageLicenseAgreement: false, autoSubscribe: false,
    shouldCollectAttendance: false, isOnlineAttendanceAllowed: false,
    latitude: null, longitude: null, buttonLink: null,
  });
  const majorEvent = createPublicMajorEvent({
    id: 'major-1', interestEnabled: true, name: 'Encontro da comunidade',
    startDate: publicFixtureDateFromNow(3), endDate: publicFixtureDateFromNow(4),
    subscriptionStartDate: publicFixtureDateFromNow(-1), subscriptionEndDate: publicFixtureDateFromNow(2),
    isPaymentRequired: false, requiresImageLicenseAgreement: false,
    majorEventPrices: [], maxCoursesPerAttendee: null, maxLecturesPerAttendee: null,
    maxUncategorizedPerAttendee: null, rankedSubscriptionEnabled: false,
  });
  const state = { interested: false, subscribed: false, attended: false, interestWrites: 0, subscriptionWrites: 0 };
  const interestRecord = () => state.interested ? createPublicEventInterest({ eventId: event.id }) : null;
  const form = createPublicEventForm({ id: 'interest-form', name: 'Prepare sua visita', links: [
    createPublicEventFormLink({ id: 'interest-link', formId: 'interest-form', targetType: 'EVENT', eventId: event.id,
      majorEventId: null, audiences: ['INTERESTED'], insertInSubscriptionFlow: false, requiredInSubscriptionFlow: false,
      availableFrom: publicFixtureDateFromNow(-1), availableUntil: publicFixtureDateFromNow(3),
    }),
  ] });

  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/auth/me')) {
      await route.fulfill({ json: authenticatedUserFixture() });
      return;
    }
    if (path.includes('realtime')) {
      await route.fulfill({ status: 200, contentType: 'text/event-stream', body: ':\n\n' });
      return;
    }
    if (!path.endsWith('/graphql')) {
      await route.fulfill({ status: 204, body: '' });
      return;
    }
    const { query, variables = {} } = route.request().postDataJSON() as {
      query: string; variables?: Record<string, unknown>;
    };
    if (await fulfillCurrentUserDefaultRedirect(route, query)) return;
    let data: Record<string, unknown> = {};
    if (query.includes('query PublicEventPage')) {
      data = {
        publicEvent: event,
        publicEventSubscriptionSummary: { eventId: event.id, hasAvailableSlots: true, availableSlots: 20, projectedQueuePosition: 1 },
        publicEventWeather: null, currentUserEventAttendance: state.attended ? { eventId: event.id, attendedAt: new Date().toISOString() } : null,
        currentUserEventSubscription: state.subscribed ? { eventId: event.id, createdAt: publicFixtureDateFromNow(), event: { id: event.id } } : null,
      };
    } else if (query.includes('CurrentUserWalkInAttendanceEvent')) {
      data = { publicEvent: event, currentUserEventAttendance: null };
    } else if (query.includes('mutation ConfirmCurrentUserOnlineAttendance')) {
      state.attended = true;
      data = { confirmCurrentUserOnlineAttendance: { eventId: event.id, attendedAt: new Date().toISOString(), createdAt: new Date().toISOString() } };
    } else if (query.includes('query PublicMajorEventSubscriptionPage')) {
      data = { publicMajorEventSubscriptionPage: { majorEvent, events: [event], subscriptionSummaries: [
        { eventId: event.id, hasAvailableSlots: true, availableSlots: 20, projectedQueuePosition: 1 },
      ] }, currentUserInterests: state.interested ? [interestRecord()] : [] };
    } else if (query.includes('CurrentUserInterestState')) {
      data = { currentUserInterestState: { interest: interestRecord(), subscribed: state.subscribed, endsAt: event.endDate, enabled: true } };
    } else if (query.includes('SetCurrentUserInterest')) {
      state.interested = variables['interested'] === true;
      state.interestWrites++;
      data = { setCurrentUserInterest: interestRecord() };
    } else if (query.includes('mutation SubscribeCurrentUserStandaloneEvent')) {
      state.subscribed = true;
      state.subscriptionWrites++;
      data = { subscribeCurrentUserStandaloneEvent: { id: event.id } };
    } else if (query.includes('CurrentUserEventForms')) {
      data = { currentUserEventForms: variables['subscriptionFlowOnly'] !== true && state.interested && !state.subscribed ? [form] : [] };
    } else if (query.includes('CurrentUserMajorEventSubscription')) {
      data = { currentUserMajorEventSubscription: null, currentUserMajorEventSubscriptions: [] };
    } else if (query.includes('CurrentUserPendingOnlineAttendanceEvents')) {
      data = { currentUserPendingOnlineAttendanceEvents: [] };
    } else if (query.includes('PublicPrizeDrawAvailability')) {
      data = { publicPrizeDrawAvailability: [] };
    }
    await route.fulfill({ json: { data } });
  });
  return { state, event, majorEvent };
}
