import type { Page, Route } from '@playwright/test';
import { expect, test } from './support/e2e-test';

interface RecordedSportsAction {
  clientId: string;
  matchId: string;
  baseRevision: number;
  type: string;
  payloadJson: string;
  authoredAt: string;
  offline: boolean;
}

interface RecordedRosterCheckInInput {
  clientId: string;
  rosterEntryId: string;
  checkedInAt: string;
  offline: boolean;
  present?: boolean;
  collectorPersonId?: string;
  collectorCredential?: string;
}

interface RecordedRosterCheckIn {
  uploaderSub?: string;
  matchId: string;
  input: RecordedRosterCheckInInput;
}

interface SportsCollectorCredential {
  credential: string;
  collectorPersonId: string;
  issuedAt: string;
}

interface SportsMockOptions {
  authenticated?: boolean;
  authenticatedUser?: Record<string, unknown>;
  autoroute?: { matchId?: string; teamId?: string; mode: string } | null;
  collectorCredential?: SportsCollectorCredential;
  committedActionBatches?: RecordedSportsAction[][];
  includeOperationalRoster?: boolean;
  recordedRosterCheckIns?: RecordedRosterCheckIn[];
  tournamentError?: string;
}

interface QueuedSportsOperationRecord {
  id: string;
  userScope: string;
  kind: string;
  attempts: number;
  action?: RecordedSportsAction;
  checkIn?: RecordedRosterCheckInInput & { matchId: string };
}

test.beforeEach(async ({ page }) => {
  await prepareSportsPage(page);
  await mockSportsApi(page);
});

async function prepareSportsPage(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.sessionStorage.setItem('cacic-eventos:silent-sso-attempted', 'true');
    window.localStorage.setItem('cacic.cookieBanner.enabled', 'false');
  });
  await page.route('https://unleash.cacic.com.br/api/frontend/**', (route) => route.fulfill({ status: 304, body: '' }));
  await page.route('https://cdn.jsdelivr.net/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"/>',
    }),
  );
}

test('shows a live tournament and opens the privacy-safe match detail', async ({ page }) => {
  await page.goto('/app/tournament/tournament-1');

  await expect(page.getByRole('heading', { name: 'Jogos Universitários' })).toBeVisible();
  await expect(page.getByText('Ao vivo', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Classificação' })).toBeVisible();
  await expect(page.getByText('Equipe Azul').first()).toBeVisible();
  await expect(page.getByRole('link', { name: /Equipe Azul/ }).first()).toHaveAttribute(
    'href',
    /sports\/match\/match-1/,
  );

  await page
    .getByRole('link', { name: /Equipe Azul/ })
    .first()
    .click();

  await expect(page).toHaveURL(/\/app\/sports\/match\/match-1/);
  await expect(page.getByRole('heading', { name: 'Equipe Azul', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Equipe Verde', exact: true })).toBeVisible();
  await expect(page.getByText('2', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('As escalações são disponibilizadas após o encerramento da partida.')).toBeVisible();
});

test('uses the authenticated personalized tournament projection and exposes self-subscription', async ({ page }) => {
  await mockSportsApi(page, { authenticated: true });

  await page.goto('/app/tournament/tournament-1');

  await expect(page.getByRole('heading', { name: 'Jogos Universitários' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Solicitar inscrição' })).toHaveAttribute(
    'href',
    /tournament\/tournament-1\/subscribe/,
  );
  await expect(page.getByText('Equipe Verde').first()).toBeVisible();
});

test('routes an authenticated official to the next operable match', async ({ page }) => {
  await mockSportsApi(page, {
    authenticated: true,
    authenticatedUser: officialUserFixture(),
    autoroute: { matchId: 'match-1', mode: 'OPERATE' },
  });

  await page.goto('/app/sports');

  await expect(page).toHaveURL(/\/app\/sports\/operate\/match-1\?mode=OPERATE/);
  await expect(page.getByText('Operação da partida')).toBeVisible();
});

test('submits a match occurrence through the form without navigating away', async ({ page }) => {
  const committedActionBatches: RecordedSportsAction[][] = [];
  await mockSportsApi(page, {
    authenticated: true,
    authenticatedUser: officialUserFixture(),
    committedActionBatches,
  });

  await page.goto('/app/sports/operate/match-1');
  await expect(page.getByText('Operação da partida')).toBeVisible();

  const note = page.getByRole('textbox', { name: 'O que aconteceu?' });
  await note.fill('Atendimento registrado aos 18 minutos.');
  const commitResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === '/api/graphql' &&
      (response.request().postData() ?? '').includes('mutation CommitSportsMatchActions')
    );
  });
  await page.getByRole('button', { name: 'Salvar anotação' }).click();
  await commitResponse;

  await expect(page).toHaveURL(/\/app\/sports\/operate\/match-1/);
  await expect(note).toHaveValue('');
  expect(committedActionBatches).toHaveLength(1);
  expect(committedActionBatches[0]?.[0]).toMatchObject({
    matchId: 'match-1',
    type: 'OCCURRENCE',
    offline: false,
  });
  expect(JSON.parse(committedActionBatches[0]?.[0]?.payloadJson ?? '{}')).toMatchObject({
    kind: 'GENERAL',
    note: 'Atendimento registrado aos 18 minutos.',
  });
});

test('shows a stable empty state when the authenticated user has no sports assignment', async ({ page }) => {
  await mockSportsApi(page, { authenticated: true, autoroute: null });

  await page.goto('/app/sports');

  await expect(page.getByRole('heading', { name: 'Nenhuma partida para operar agora' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tentar novamente' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Ver calendário' })).toHaveAttribute('href', '/app/calendar');
});

test('queues an authenticated official score operation offline and flushes it exactly once after reconnect', async ({
  context,
  page,
}) => {
  const committedActionBatches: RecordedSportsAction[][] = [];
  await mockSportsApi(page, {
    authenticated: true,
    authenticatedUser: officialUserFixture(),
    committedActionBatches,
  });

  await page.goto('/app/sports/operate/match-1');

  const scoreboard = page.getByRole('region', { name: 'Placar da partida' });
  const homeTeam = scoreboard.locator('.team').filter({
    has: page.getByRole('heading', { name: 'Equipe Azul', exact: true }),
  });
  const homeScore = homeTeam.locator('.score-controls > strong');
  const pendingButton = page.getByRole('button', { name: /1 para enviar/ });

  await expect(page.getByText('Operação da partida')).toBeVisible();
  await expect(homeScore).toHaveText('2');

  await context.setOffline(true);
  expect(await page.evaluate(() => navigator.onLine)).toBe(false);
  await expect(page.getByText('Você está off-line.')).toBeVisible();

  await page.getByRole('button', { name: 'Aumentar placar de Equipe Azul' }).click();

  await expect(homeScore).toHaveText('3');
  await expect(pendingButton).toBeVisible();
  await expect(page.getByText('Ação salva neste dispositivo. Ela será enviada quando a conexão voltar.')).toBeVisible();

  const queuedRecords = await readSportsOperationQueue(page, 'official-1');
  expect(queuedRecords).toHaveLength(1);
  const queuedClientId = queuedRecords[0]?.action?.clientId;
  expect(queuedClientId).toEqual(expect.any(String));
  expect(queuedRecords[0]).toMatchObject({
    id: queuedClientId,
    userScope: 'official-1',
    kind: 'ACTION',
    attempts: 0,
    action: {
      matchId: 'match-1',
      baseRevision: 7,
      type: 'SCORE_DELTA',
      offline: true,
    },
  });
  expect(JSON.parse(queuedRecords[0]?.action?.payloadJson ?? '{}')).toEqual({
    side: 'HOME',
    amount: 1,
    periodNumber: 2,
  });
  expect(committedActionBatches).toHaveLength(0);

  const commitResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === '/api/graphql' &&
      (response.request().postData() ?? '').includes('mutation CommitSportsMatchActions')
    );
  });
  await context.setOffline(false);
  await commitResponse;

  await expect(pendingButton).toHaveCount(0);
  await expect(page.getByText('Conexão restaurada.')).toBeVisible();
  expect(await readSportsOperationQueue(page, 'official-1')).toEqual([]);

  expect(committedActionBatches).toHaveLength(1);
  expect(committedActionBatches[0]).toHaveLength(1);
  expect(committedActionBatches[0]?.[0]).toMatchObject({
    clientId: queuedClientId,
    matchId: 'match-1',
    baseRevision: 7,
    type: 'SCORE_DELTA',
    payloadJson: JSON.stringify({ side: 'HOME', amount: 1, periodNumber: 2 }),
    offline: true,
  });
});

test('uploads proven attendance across users while retaining the original user action', async ({ context, page }) => {
  const collectorCredential: SportsCollectorCredential = {
    credential: 'signed-collector-official-1-match-1',
    collectorPersonId: 'person-official-1',
    issuedAt: '2026-08-11T12:00:00.000Z',
  };
  const committedActionBatches: RecordedSportsAction[][] = [];
  const recordedRosterCheckIns: RecordedRosterCheckIn[] = [];
  await mockSportsApi(page, {
    authenticated: true,
    authenticatedUser: officialUserFixture('official-1'),
    collectorCredential,
    committedActionBatches,
    includeOperationalRoster: true,
    recordedRosterCheckIns,
  });

  const credentialResponse = page.waitForResponse((response) =>
    (response.request().postData() ?? '').includes('mutation CreateSportsOfflineCollectorCredential'),
  );
  await page.goto('/app/sports/operate/match-1');
  await credentialResponse;
  await expect(page.getByText('Operação da partida')).toBeVisible();

  await context.setOffline(true);
  await expect(page.getByText('Você está off-line.')).toBeVisible();
  await page.getByRole('button', { name: 'Aumentar placar de Equipe Azul' }).click();
  await expect(page.getByRole('button', { name: /1 para enviar/ })).toBeVisible();

  await page.getByRole('button', { name: 'Editar check-in' }).click();
  await expect(page.getByRole('heading', { name: 'Editar check-in após o início?' })).toBeVisible();
  await page.getByRole('button', { name: 'Sim, editar' }).click();
  const athleteCheckIn = page.getByRole('button', { name: 'Confirmar presença de Ana Beatriz de Souza' });
  await expect(athleteCheckIn).toBeEnabled();
  await athleteCheckIn.click();

  await expect(page.getByRole('button', { name: 'Remover presença de Ana Beatriz de Souza' })).toBeVisible();
  await expect(page.getByRole('button', { name: /2 para enviar/ })).toBeVisible();
  const collectorRecords = await readSportsOperationQueue(page, 'official-1');
  expect(collectorRecords).toHaveLength(2);
  expect(collectorRecords.find((item) => item.kind === 'CHECK_IN')).toMatchObject({
    userScope: 'official-1',
    attempts: 0,
    checkIn: {
      matchId: 'match-1',
      rosterEntryId: 'home-athlete-1',
      offline: true,
      present: true,
      collectorPersonId: 'person-official-1',
      collectorCredential: collectorCredential.credential,
    },
  });
  expect(recordedRosterCheckIns).toHaveLength(0);
  expect(committedActionBatches).toHaveLength(0);

  await page.close();
  await context.setOffline(false);
  const uploaderPage = await context.newPage();
  await prepareSportsPage(uploaderPage);
  await mockSportsApi(uploaderPage, {
    authenticated: true,
    authenticatedUser: officialUserFixture('official-2'),
    committedActionBatches,
    includeOperationalRoster: true,
    recordedRosterCheckIns,
  });
  const uploadResponse = uploaderPage.waitForResponse((response) =>
    (response.request().postData() ?? '').includes('mutation CheckInSportsRosterEntry'),
  );
  await uploaderPage.goto('/app/sports/operate/match-1');
  await uploadResponse;

  await expect(uploaderPage.getByText('ações de outra pessoa mantidas neste dispositivo')).toBeVisible();
  await expect(uploaderPage.getByRole('button', { name: /\d+ para enviar/ })).toHaveCount(0);
  const retainedRecords = await readSportsOperationQueue(uploaderPage, 'official-1');
  expect(retainedRecords).toHaveLength(1);
  expect(retainedRecords[0]).toMatchObject({ userScope: 'official-1', kind: 'ACTION' });
  expect(await readSportsOperationQueue(uploaderPage, 'official-2')).toEqual([]);

  expect(recordedRosterCheckIns).toHaveLength(1);
  expect(recordedRosterCheckIns[0]).toMatchObject({
    uploaderSub: 'official-2',
    matchId: 'match-1',
    input: {
      rosterEntryId: 'home-athlete-1',
      offline: true,
      present: true,
      collectorPersonId: 'person-official-1',
      collectorCredential: collectorCredential.credential,
    },
  });
  expect(recordedRosterCheckIns[0]?.input).not.toHaveProperty('uploaderSub');
  expect(recordedRosterCheckIns[0]?.input).not.toHaveProperty('uploaderPersonId');
  expect(committedActionBatches).toHaveLength(0);
});

test('shows the GraphQL error without leaking a stale tournament', async ({ page }) => {
  await mockSportsApi(page, { tournamentError: 'Este torneio não está disponível.' });

  await page.goto('/app/tournament/tournament-1');

  await expect(page.getByText('Este torneio não está disponível.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Jogos Universitários' })).toHaveCount(0);
});

async function mockSportsApi(page: Page, options: SportsMockOptions = {}): Promise<void> {
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/auth/me') {
      await route.fulfill({
        status: options.authenticated ? 200 : 403,
        contentType: 'application/json',
        body: JSON.stringify(
          options.authenticated
            ? (options.authenticatedUser ?? authenticatedUserFixture())
            : { message: 'User is not authenticated.' },
        ),
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
      await fulfillSportsGraphql(route, options);
      return;
    }
    await route.fulfill({ status: 204, body: '' });
  });
}

async function fulfillSportsGraphql(route: Route, options: SportsMockOptions): Promise<void> {
  const body = route.request().postDataJSON() as {
    query?: string;
    variables?: {
      matchId?: string;
      input?: RecordedRosterCheckInInput & { actions?: RecordedSportsAction[] };
    };
  };
  const query = body.query ?? '';
  if (query.includes('mutation CommitSportsMatchActions')) {
    const actions = body.variables?.input?.actions ?? [];
    options.committedActionBatches?.push(actions);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { commitSportsMatchActions: actions.map((action) => action.clientId) } }),
    });
    return;
  }
  if (query.includes('mutation CreateSportsOfflineCollectorCredential')) {
    const collectorSub = authenticatedUserSub(options.authenticatedUser) ?? 'official-1';
    const credential = options.collectorCredential ?? {
      credential: `signed-collector-${collectorSub}-${body.variables?.matchId ?? 'match'}`,
      collectorPersonId: `person-${collectorSub}`,
      issuedAt: '2026-08-11T12:00:00.000Z',
    };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { createSportsOfflineCollectorCredential: credential } }),
    });
    return;
  }
  if (query.includes('mutation CheckInSportsRosterEntry')) {
    const input = body.variables?.input;
    if (!input) {
      await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ errors: [] }) });
      return;
    }
    options.recordedRosterCheckIns?.push({
      uploaderSub: authenticatedUserSub(options.authenticatedUser),
      matchId: body.variables?.matchId ?? '',
      input,
    });
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { checkInSportsRosterEntry: true } }),
    });
    return;
  }
  if (query.includes('query SportsOperationalMatch')) {
    const match = matchFixture({ includeRoster: options.includeOperationalRoster });
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          publicSportsMatchDetail: match,
          currentUserSportsMatchOperations: match,
        },
      }),
    });
    return;
  }
  if (query.includes('query CurrentUserSportsAutoroute')) {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { currentUserSportsAutoroute: options.autoroute ?? null } }),
    });
    return;
  }
  if (query.includes('query PublicSportsTournamentDetail')) {
    if (options.tournamentError) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ errors: [{ message: options.tournamentError }] }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { publicSportsTournamentDetail: tournamentFixture() } }),
    });
    return;
  }
  if (query.includes('query CurrentUserSportsTournamentDetail')) {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          currentUserSportsTournamentDetail: {
            tournament: tournamentFixture(),
            orderedMatches: [matchFixture()],
          },
        },
      }),
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

function authenticatedUserFixture(): Record<string, unknown> {
  return {
    realm_access: { roles: [] },
    sub: 'athlete-1',
    preferredUsername: 'atleta.teste',
    email: 'atleta@example.edu',
    roles: [],
    permissions: [],
    scopes: ['openid'],
    claims: {
      exp: Math.floor(Date.now() / 1000) + 3600,
      is_onboarded: true,
      name: 'Atleta Teste',
      picture: null,
    },
  };
}

function officialUserFixture(sub = 'official-1'): Record<string, unknown> {
  return {
    realm_access: { roles: ['sports-official'] },
    sub,
    preferredUsername: `oficial.${sub}`,
    email: `${sub}@example.edu`,
    roles: ['sports-official'],
    permissions: [],
    scopes: ['openid'],
    claims: {
      exp: Math.floor(Date.now() / 1000) + 3600,
      is_onboarded: true,
      name: 'Oficial Teste',
      picture: null,
    },
  };
}

function authenticatedUserSub(user: Record<string, unknown> | undefined): string | undefined {
  const sub = user?.['sub'];
  return typeof sub === 'string' ? sub : undefined;
}

function matchFixture(options: { includeRoster?: boolean } = {}) {
  const timerStartedAtUnixMs = Date.now() - 5 * 60_000;
  return {
    id: 'match-1',
    eventId: 'event-1',
    categoryId: 'category-1',
    stageId: 'stage-1',
    revision: 7,
    homeRegistrationId: 'registration-blue',
    awayRegistrationId: 'registration-green',
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
    timerStartedAt: new Date(timerStartedAtUnixMs).toISOString(),
    timerStartedAtUnixMs,
    timerPausedAt: null,
    timerPausedAtUnixMs: null,
    elapsedBeforePauseMs: 0,
    periodTimers: [],
    overallTimerEnabled: true,
    periodTimerEnabled: true,
    timerPeriodDurationMs: 20 * 60_000,
    timerPeriodStartOffsetsMs: [0, 20 * 60_000],
    timerAllowOvertime: true,
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
    rosters: options.includeRoster
      ? [
          {
            id: 'roster-blue',
            registrationId: 'registration-blue',
            revision: 2,
            status: 'SUBMITTED',
            team: { id: 'blue', name: 'Equipe Azul', institution: 'FCT', logoUrl: null },
            entries: [
              {
                id: 'home-athlete-1',
                name: 'Ana Beatriz de Souza',
                role: 'PLAYER',
                status: 'APPROVED',
                checkedInAt: null,
                shirtNumber: '7',
              },
            ],
          },
        ]
      : [],
    notes: null,
    occurrencesJson: null,
    officials: [{ name: 'Marina S.', role: 'REFEREE' }],
  };
}

async function readSportsOperationQueue(page: Page, userScope: string): Promise<QueuedSportsOperationRecord[]> {
  return page.evaluate(async (scope) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('cacic-public-offline-data');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    try {
      return await new Promise<QueuedSportsOperationRecord[]>((resolve, reject) => {
        const transaction = database.transaction('sportsOperationQueue', 'readonly');
        const request = transaction.objectStore('sportsOperationQueue').index('userScope').getAll(scope);
        request.onsuccess = () => resolve(request.result as QueuedSportsOperationRecord[]);
        request.onerror = () => reject(request.error);
      });
    } finally {
      database.close();
    }
  }, userScope);
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
