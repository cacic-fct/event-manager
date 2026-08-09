import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { delay, HttpResponse, http } from 'msw';
import { applicationConfig, type Meta, type StoryObj } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import { SportsPageComponent } from './sports-page.component';
import {
  createAdminSportsApplications,
  createAdminSportsCategoryRead,
  createAdminSportsMatchReview,
  createAdminSportsPendingMatchActions,
  createAdminSportsRegistrationRead,
  createAdminSportsTeam,
  createAdminSportsTeamRead,
  createAdminSportsTournamentRead,
  sportsStoryMajorEvent,
} from './sports-story.fixtures';

type LoadMode = 'ready' | 'loading' | 'error';

interface SportsStoryArgs {
  categoryCount: number;
  teamCount: number;
  pendingCount: number;
  selfSubscriptionAllowNoTeam: boolean;
  selfSubscriptionAllowNoCategory: boolean;
  status: 'DRAFT' | 'REGISTRATION_OPEN' | 'REGISTRATION_CLOSED' | 'LIVE' | 'FINISHED' | 'CANCELED';
  loadMode: LoadMode;
}

const defaultArgs: SportsStoryArgs = {
  categoryCount: 8,
  teamCount: 8,
  pendingCount: 3,
  selfSubscriptionAllowNoTeam: false,
  selfSubscriptionAllowNoCategory: false,
  status: 'LIVE',
  loadMode: 'ready',
};

let activeArgs = defaultArgs;

function tournamentRead() {
  return createAdminSportsTournamentRead({
    categoryCount: activeArgs.categoryCount,
    teamCount: activeArgs.teamCount,
    status: activeArgs.status,
    selfSubscriptionAllowNoTeam: activeArgs.selfSubscriptionAllowNoTeam,
    selfSubscriptionAllowNoCategory: activeArgs.selfSubscriptionAllowNoCategory,
  });
}

const sportsGraphqlHandler = http.post('/api/graphql', async ({ request }) => {
  const body = (await request.json()) as {
    query?: string;
    variables?: Record<string, string>;
  };
  const query = body.query ?? '';
  const variables = body.variables ?? {};

  if (query.includes('AdminSportsTournamentList')) {
    if (activeArgs.loadMode === 'loading') {
      await delay('infinite');
    }
    if (activeArgs.loadMode === 'error') {
      return HttpResponse.json({
        errors: [{ message: 'A gestão esportiva está temporariamente indisponível.' }],
      });
    }
    return HttpResponse.json({
      data: {
        adminSportsTournamentList: [
          {
            tournament: tournamentRead().tournament,
            majorEvent: sportsStoryMajorEvent,
            categoryCount: activeArgs.categoryCount,
            teamCount: activeArgs.teamCount,
            pendingApplicationCount: activeArgs.pendingCount,
            pendingReviewCount: 1,
          },
        ],
      },
    });
  }
  if (query.includes('ListMajorEvents')) {
    return HttpResponse.json({
      data: {
        majorEvents: [
          sportsStoryMajorEvent,
          {
            ...sportsStoryMajorEvent,
            id: 'major-games-2027',
            name: 'Jogos Universitários 2027',
            startDate: '2027-09-11T11:00:00.000Z',
            endDate: '2027-09-19T22:00:00.000Z',
          },
        ],
      },
    });
  }
  if (query.includes('ListPlacePresets')) {
    return HttpResponse.json({
      data: {
        placePresets: [
          {
            id: 'place-1',
            name: 'Ginásio Universitário',
            latitude: -22.12,
            longitude: -51.4,
            locationDescription: 'Campus principal',
            createdAt: '2026-05-01T12:00:00.000Z',
            updatedAt: '2026-05-01T12:00:00.000Z',
          },
        ],
      },
    });
  }
  if (query.includes('AdminSportsTournament(')) {
    return HttpResponse.json({
      data: { adminSportsTournamentRead: tournamentRead() },
    });
  }
  if (query.includes('AdminSportsCategory(')) {
    const index = Math.max(0, Number(variables['categoryId']?.split('-').at(-1) ?? 1) - 1);
    const category = tournamentRead().categories[index] ?? tournamentRead().categories[0];
    return HttpResponse.json({
      data: {
        adminSportsCategoryRead: category ? createAdminSportsCategoryRead(category) : null,
      },
    });
  }
  if (query.includes('AdminSportsTeam(')) {
    const index = Math.max(0, Number(variables['teamId']?.split('-').at(-1) ?? 1) - 1);
    const team = tournamentRead().teams[index] ?? createAdminSportsTeam(index);
    return HttpResponse.json({
      data: { adminSportsTeamRead: createAdminSportsTeamRead(team) },
    });
  }
  if (query.includes('AdminSportsMatchReview(')) {
    return HttpResponse.json({
      data: { adminSportsMatchReviewRead: createAdminSportsMatchReview() },
    });
  }
  if (query.includes('AdminSportsMatchActionReviewQueue')) {
    return HttpResponse.json({
      data: { adminSportsMatchActionReviewQueue: createAdminSportsPendingMatchActions(1) },
    });
  }
  if (query.includes('AdminSportsRegistration(')) {
    const registrationId =
      variables['registrationId'] === 'registration-away' ? 'registration-away' : 'registration-home';
    return HttpResponse.json({
      data: {
        adminSportsRegistrationRead: createAdminSportsRegistrationRead(registrationId),
      },
    });
  }
  if (query.includes('AdminSportsApplications')) {
    return HttpResponse.json({
      data: {
        adminSportsPlayerApplicationQueue: createAdminSportsApplications(activeArgs.pendingCount),
      },
    });
  }
  if (query.includes('ListPeopleSummaries')) {
    return HttpResponse.json({
      data: {
        people: [
          {
            id: 'person-search-1',
            name: 'Mariana Clara Santos',
            email: 'mariana@example.com',
          },
        ],
      },
    });
  }

  return HttpResponse.json({ data: {} });
});

const meta: Meta<SportsStoryArgs> = {
  component: SportsPageComponent,
  title: 'CACiC Eventos/Workspace/Tabs/Sports/Workspace Sports Tab',
  tags: ['autodocs'],
  args: defaultArgs,
  argTypes: {
    categoryCount: { control: { type: 'range', min: 0, max: 8, step: 1 } },
    teamCount: { control: { type: 'range', min: 0, max: 16, step: 1 } },
    pendingCount: { control: { type: 'range', min: 0, max: 12, step: 1 } },
    selfSubscriptionAllowNoTeam: { control: 'boolean' },
    selfSubscriptionAllowNoCategory: { control: 'boolean' },
    status: {
      control: 'select',
      options: ['DRAFT', 'REGISTRATION_OPEN', 'REGISTRATION_CLOSED', 'LIVE', 'FINISHED', 'CANCELED'],
    },
    loadMode: { control: 'inline-radio', options: ['ready', 'loading', 'error'] },
  },
  render: (args) => {
    activeArgs = args;
    return { props: {} };
  },
  decorators: [
    applicationConfig({
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: convertToParamMap({}),
            },
          },
        },
      ],
    }),
  ],
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
    msw: {
      handlers: [
        sportsGraphqlHandler,
        http.get('/api/sports/tournaments/:tournamentId/review-events', async () => {
          await delay('infinite');
          return new HttpResponse(null, {
            headers: { 'Content-Type': 'text/event-stream' },
          });
        }),
      ],
    },
  },
};

export default meta;
type Story = StoryObj<SportsStoryArgs>;

async function openTournament(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  const tournament = await canvas.findByText('Jogos Universitários 2026');
  await userEvent.click(tournament);
  await expect(await canvas.findByRole('heading', { name: 'Regras gerais' })).toBeVisible();
  return canvas;
}

export const Playground: Story = {
  play: async ({ canvasElement }) => {
    await openTournament(canvasElement);
  },
};

export const CategoriesAndBracketFormats: Story = {
  name: 'Modalidades e formatos de chave',
  play: async ({ canvasElement }) => {
    const canvas = await openTournament(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: /modalidades/i }));
    await userEvent.click(await canvas.findByText('Futebol feminino'));
    await expect(await canvas.findByText('Grupos + eliminatórias')).toBeVisible();
    await expect(canvas.getByLabelText('Exemplo ilustrativo: Grupos + eliminatórias')).toBeVisible();
    await expect(canvas.getByText('Xadrez rápido')).toBeVisible();
    await expect(canvas.getByText('Natação 50 m livre')).toBeVisible();
    expect(canvas.getAllByText('Ativa').length).toBeGreaterThan(0);
    expect(canvas.queryByText('Em andamento')).toBeNull();
    await expect(canvas.getByRole('button', { name: 'Liberar para competir' })).toBeVisible();
    await expect(canvas.getByText('Pronta para competir')).toBeVisible();
  },
};

async function openFormat(canvasElement: HTMLElement, categoryName: string, formatLabel: string) {
  const canvas = await openTournament(canvasElement);
  await userEvent.click(canvas.getByRole('button', { name: /modalidades/i }));
  await userEvent.click(await canvas.findByText(categoryName));
  await expect(canvas.getByLabelText(`Exemplo ilustrativo: ${formatLabel}`)).toBeVisible();
}

export const SingleEliminationExample: Story = {
  name: 'Exemplo: eliminação simples',
  play: ({ canvasElement }) => openFormat(canvasElement, 'Tênis individual', 'Eliminação simples'),
};

export const RoundRobinExample: Story = {
  name: 'Exemplo: todos contra todos',
  play: ({ canvasElement }) => openFormat(canvasElement, 'Basquete masculino', 'Todos contra todos'),
};

export const DoubleEliminationExample: Story = {
  name: 'Exemplo: eliminação dupla',
  play: ({ canvasElement }) => openFormat(canvasElement, 'League of Legends', 'Eliminação dupla'),
};

export const SwissExample: Story = {
  name: 'Exemplo: sistema suíço',
  play: ({ canvasElement }) => openFormat(canvasElement, 'Xadrez rápido', 'Sistema suíço'),
};

export const CustomFormatExample: Story = {
  name: 'Exemplo: formato personalizado',
  play: ({ canvasElement }) => openFormat(canvasElement, 'Natação 50 m livre', 'Personalizado'),
};

export const TeamManagement: Story = {
  name: 'Equipe, integrantes e representante',
  play: async ({ canvasElement }) => {
    const canvas = await openTournament(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: /equipes/i }));
    await userEvent.click(await canvas.findByText('Atlética FCT'));
    await expect(await canvas.findByText('Escudo da equipe')).toBeVisible();
    await expect(canvas.getByText('Ana Beatriz de Souza')).toBeVisible();
    await expect(canvas.getByText('Mariana Clara Santos')).toBeVisible();
    await expect(canvas.getByText('Vôlei misto')).toBeVisible();
    await expect(
      canvas.getByRole('button', { name: 'Inscrição automática em modalidades com atletas suficientes' }),
    ).toBeVisible();
    await expect(canvas.getByLabelText('Posição inicial na chave')).toBeVisible();
    expect(canvas.queryByText('Função por modalidade')).toBeNull();
  },
};

export const ReviewQueues: Story = {
  name: 'Filas de revisão e conflito',
  play: async ({ canvasElement }) => {
    const canvas = await openTournament(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: /equipes/i }));
    await userEvent.click(await canvas.findByText('Atlética FCT'));
    await userEvent.click(canvas.getByRole('button', { name: /revisões/i }));
    await expect(await canvas.findByText('Camila Rodrigues Pereira')).toBeVisible();
    await expect(canvas.getByText('Conflito')).toBeVisible();
  },
};

export const MatchBracketAndLineup: Story = {
  name: 'Chave, partida e escalação',
  play: async ({ canvasElement }) => {
    const canvas = await openTournament(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: /modalidades/i }));
    await userEvent.click(await canvas.findByText('Futebol feminino'));
    await userEvent.click(canvas.getByRole('button', { name: /partidas e chaves/i }));
    await userEvent.click(
      await canvas.findByRole('button', {
        name: /Atlética FCT contra .*Ao vivo/i,
      }),
    );
    await expect(await canvas.findByText('Escalação desta partida')).toBeVisible();
    await expect(canvas.getByText('Marque quem poderá jogar e defina função e número para esta partida. Isso não altera o cadastro da modalidade.')).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: /Editar escalação/i }));
    await userEvent.click(canvas.getByRole('button', { name: /Transmissão e notas/i }));
    await expect(canvas.getByText('Ana Souza')).toBeVisible();
    await expect(canvas.getByText('Fernanda Luz')).toBeVisible();
    await expect(canvas.getByLabelText('Transmissão')).toBeVisible();
    await expect(canvas.getByLabelText('Notas administrativas da partida')).toBeVisible();
    await expect(canvas.getAllByLabelText('Número').length).toBeGreaterThan(0);
  },
};

export const FinishedTournament: Story = {
  name: 'Torneio finalizado',
  args: { status: 'FINISHED', pendingCount: 0 },
};

export const RegistrationOpen: Story = {
  name: 'Inscrições abertas',
  args: { status: 'REGISTRATION_OPEN' },
};

export const RegistrationClosed: Story = {
  name: 'Inscrições encerradas',
  args: { status: 'REGISTRATION_CLOSED' },
};

export const CanceledTournament: Story = {
  name: 'Torneio cancelado',
  args: { status: 'CANCELED', pendingCount: 0 },
};

export const EmptyTournament: Story = {
  name: 'Torneio sem modalidades nem equipes',
  args: {
    categoryCount: 0,
    teamCount: 0,
    pendingCount: 0,
    status: 'DRAFT',
  },
};

export const Loading: Story = {
  args: { loadMode: 'loading' },
};

export const LoadError: Story = {
  name: 'Erro de carregamento',
  args: { loadMode: 'error' },
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText('A gestão esportiva está temporariamente indisponível.'),
    ).toBeVisible();
  },
};
