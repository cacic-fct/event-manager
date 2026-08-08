import type { Page, Route } from '@playwright/test';
import { expect, test } from './support/e2e-test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.sessionStorage.setItem('cacic-eventos:silent-sso-attempted', 'true');
    window.localStorage.setItem('cacic.cookieBanner.enabled', 'false');
  });
  await page.route('https://unleash.cacic.com.br/api/frontend/**', (route) =>
    route.fulfill({ status: 304, body: '' }),
  );
  await page.route('https://cdn.jsdelivr.net/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"/>',
    }),
  );
  await mockSportsApi(page);
});

test('shows a live tournament and opens the privacy-safe match detail', async ({ page }) => {
  await page.goto('/app/tournament/tournament-1');

  await expect(page.getByRole('heading', { name: 'Jogos Universitários' })).toBeVisible();
  await expect(page.getByText('Ao vivo')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Classificação' })).toBeVisible();
  await expect(page.getByText('Equipe Azul').first()).toBeVisible();
  await expect(page.getByRole('link', { name: /Equipe Azul/ }).first()).toHaveAttribute(
    'href',
    /sports\/match\/match-1/,
  );

  await page.getByRole('link', { name: /Equipe Azul/ }).first().click();

  await expect(page).toHaveURL(/\/app\/sports\/match\/match-1/);
  await expect(page.getByRole('heading', { name: /Equipe Azul.*Equipe Verde/ })).toBeVisible();
  await expect(page.getByText('2', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Escalações')).toBeHidden();
});

async function mockSportsApi(page: Page): Promise<void> {
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/auth/me') {
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'User is not authenticated.' }),
      });
      return;
    }
    if (url.pathname.includes('/api/sports/') && url.pathname.endsWith('/events')) {
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: ':\n\n',
      });
      return;
    }
    if (url.pathname === '/api/graphql') {
      await fulfillSportsGraphql(route);
      return;
    }
    await route.fulfill({ status: 204, body: '' });
  });
}

async function fulfillSportsGraphql(route: Route): Promise<void> {
  const body = route.request().postDataJSON() as { query?: string };
  const query = body.query ?? '';
  if (query.includes('query PublicSportsTournamentDetail')) {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { publicSportsTournamentDetail: tournamentFixture() } }),
    });
    return;
  }
  if (query.includes('query PublicSportsMatchDetail')) {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { publicSportsMatchDetail: matchFixture() } }),
    });
    return;
  }
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ data: {} }),
  });
}

function matchFixture() {
  return {
    id: 'match-1',
    eventId: 'event-1',
    categoryId: 'category-1',
    stageId: 'stage-1',
    homeTeam: { id: 'blue', name: 'Equipe Azul', institution: 'FCT', logoUrl: null },
    awayTeam: { id: 'green', name: 'Equipe Verde', institution: 'FEIS', logoUrl: null },
    state: 'LIVE',
    scoreboard: {
      homeScore: 2,
      awayScore: 1,
      activePeriod: 2,
      periods: [
        { number: 1, label: '1º tempo', homeScore: 1, awayScore: 0, completed: true },
        { number: 2, label: '2º tempo', homeScore: 1, awayScore: 1, completed: false },
      ],
    },
    winner: null,
    loser: null,
    lossReason: null,
    lossReasonDetail: null,
    drawWillReschedule: null,
    timerStartedAt: new Date().toISOString(),
    timerPausedAt: null,
    elapsedBeforePauseMs: 0,
    roundNumber: 1,
    bracketPosition: 1,
    groupKey: null,
    schedule: {
      startDate: new Date().toISOString(),
      endDate: new Date(Date.now() + 60 * 60_000).toISOString(),
      locationDescription: 'Ginásio principal',
      latitude: null,
      longitude: null,
      venueName: 'Ginásio',
      courtLabel: 'Quadra 1',
    },
    rosters: [],
    officials: [{ name: 'Marina S.', role: 'REFEREE' }],
  };
}

function tournamentFixture() {
  const match = matchFixture();
  return {
    id: 'tournament-1',
    majorEventId: 'major-1',
    name: 'Jogos Universitários',
    emoji: '🏆',
    description: 'Acompanhe resultados e chaves ao vivo.',
    startDate: new Date(Date.now() - 24 * 60 * 60_000).toISOString(),
    endDate: new Date(Date.now() + 4 * 24 * 60 * 60_000).toISOString(),
    selfSubscriptionEnabled: true,
    isPaymentRequired: false,
    paymentTiers: [],
    teams: [match.homeTeam, match.awayTeam],
    matches: [match],
    overallScores: [
      { team: match.homeTeam, points: 5 },
      { team: match.awayTeam, points: 3 },
    ],
    categories: [
      {
        id: 'category-1',
        name: 'Futsal',
        sport: 'FUTSAL',
        customSportName: null,
        division: 'Aberto',
        format: 'ROUND_ROBIN',
        rulesText: null,
        standings: [
          {
            team: match.homeTeam,
            played: 2,
            wins: 2,
            draws: 0,
            losses: 0,
            scoreFor: 6,
            scoreAgainst: 2,
            points: 6,
            rank: 1,
          },
        ],
        placements: [],
        brackets: [],
        matches: [match],
      },
    ],
  };
}
