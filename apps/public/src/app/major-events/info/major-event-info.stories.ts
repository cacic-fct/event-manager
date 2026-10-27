import type { Meta, StoryObj } from '@storybook/angular';
import {
  createPublicEvent,
  createPublicEventGroup,
  createPublicMajorEvent,
  publicFixtureDateFromNow,
} from '@cacic-fct/event-manager-public-testing';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { MajorEventInfo } from './major-event-info';

const majorEvent = createPublicMajorEvent({
  name: 'Encontro de ciência, cultura e comunidade',
  emoji: '🌎',
  startDate: publicFixtureDateFromNow(7, 12),
  endDate: publicFixtureDateFromNow(9, 21),
  description:
    'Três dias para compartilhar ideias, descobrir projetos e conhecer pessoas. A programação reúne conversas, oficinas e apresentações abertas à comunidade.\n\nEscolha uma atividade para consultar os horários, o local e as informações de participação.',
});

const events = [
  createPublicEvent({
    id: 'opening',
    name: 'Encontro de abertura: universidade e comunidade',
    emoji: '🤝',
    startDate: publicFixtureDateFromNow(7, 12),
    endDate: publicFixtureDateFromNow(7, 13),
    locationDescription: 'Auditório central',
    type: 'PALESTRA',
  }),
  createPublicEvent({
    id: 'workshop',
    name: 'Oficina de fotografia: outros olhares sobre o campus',
    emoji: '📷',
    startDate: publicFixtureDateFromNow(7, 17),
    endDate: publicFixtureDateFromNow(7, 19),
    locationDescription: 'Espaço de convivência',
    eventGroup: createPublicEventGroup({ name: 'Arte e expressão', emoji: '🎨' }),
  }),
  createPublicEvent({
    id: 'conversation',
    name: 'Pesquisa que transforma o cotidiano',
    emoji: '🔬',
    startDate: publicFixtureDateFromNow(8, 14),
    endDate: publicFixtureDateFromNow(8, 16),
    isVirtual: true,
    type: 'PALESTRA',
  }),
  createPublicEvent({
    id: 'closing',
    name: 'Mostra de projetos e encerramento',
    emoji: '💡',
    startDate: publicFixtureDateFromNow(9, 18),
    endDate: publicFixtureDateFromNow(9, 21),
    locationDescription: 'Salão de exposições',
    type: 'OTHER',
  }),
];

const meta: Meta<MajorEventInfo> = {
  component: MajorEventInfo,
  title: 'Public/Discovery/Major Event Information',
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'error' },
    docs: { description: { component: 'Dados ilustrativos. Informações gerais e programação de um grande evento.' } },
  },
  args: {
    majorEvent,
    events,
    registration: {
      title: 'Inscrições abertas',
      description: 'Escolha as atividades e confira as opções de participação.',
      action: { label: 'Inscrever-se', route: ['/major-event', majorEvent.id, 'subscription'] },
    },
    links: [
      { label: 'Site do evento', icon: 'language', href: 'https://example.com' },
      { label: 'Falar com a organização', icon: 'mail', href: 'mailto:eventos@example.com' },
    ],
    programLoading: false,
    programError: false,
    programHasMore: false,
    now: Date.now(),
    loginRequested: fn(),
    retryProgram: fn(),
    loadMoreProgram: fn(),
  },
  argTypes: {
    majorEvent: { control: 'object' },
    events: { control: 'object' },
    registration: { control: 'object' },
    links: { control: 'object' },
    programLoading: { control: 'boolean' },
    programError: { control: 'boolean' },
    programHasMore: { control: 'boolean' },
  },
  render: (args) => ({
    props: {
      ...args,
      onLoginRequested: () => args.loginRequested?.(),
      onRetryProgram: () => args.retryProgram?.(),
      onLoadMoreProgram: () => args.loadMoreProgram?.(),
    },
    template: `
      <app-major-event-info
        [majorEvent]="majorEvent"
        [events]="events"
        [registration]="registration"
        [links]="links"
        [programLoading]="programLoading"
        [programError]="programError"
        [programHasMore]="programHasMore"
        [now]="now"
        (loginRequested)="onLoginRequested()"
        (retryProgram)="onRetryProgram()"
        (loadMoreProgram)="onLoadMoreProgram()"
      />
    `,
  }),
};

export default meta;
type Story = StoryObj<MajorEventInfo>;

export const Overview: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { level: 1, name: majorEvent.name })).toBeVisible();
    await expect(canvas.getByRole('link', { name: 'Inscrever-se' })).toHaveAttribute(
      'href',
      expect.stringMatching(new RegExp(`/major-event/${majorEvent.id}/subscription$`)),
    );
    await expect(canvas.getByRole('radiogroup', { name: 'Dia da programação' })).toBeVisible();
    await expect(canvas.getByRole('radio', { name: 'Todos os dias' })).toBeChecked();
    await expect(canvas.getByRole('link', { name: /Pesquisa que transforma/ })).toBeVisible();
  },
};

export const DayFilter: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const options = canvas.getAllByRole('radio');
    await userEvent.click(options[1]);
    await waitFor(async () => {
      await expect(canvas.getByRole('link', { name: /Encontro de abertura/ })).toBeVisible();
      await expect(canvas.getByRole('link', { name: /Oficina de fotografia/ })).toBeVisible();
      await expect(canvas.queryByRole('link', { name: /Pesquisa que transforma/ })).not.toBeInTheDocument();
      await expect(canvas.queryByRole('link', { name: /Mostra de projetos/ })).not.toBeInTheDocument();
    });
    await userEvent.click(canvas.getByRole('radio', { name: 'Todos os dias' }));
    await expect(await canvas.findByRole('link', { name: /Pesquisa que transforma/ })).toBeVisible();
    await expect(canvas.getByRole('link', { name: /Mostra de projetos/ })).toBeVisible();
  },
};

export const Visitor: Story = {
  args: {
    registration: {
      title: 'Participe do evento',
      description: 'Entre na sua conta para continuar a inscrição.',
      action: { label: 'Entrar para inscrever-se', login: true },
    },
  },
  play: async ({ canvasElement }) => {
    const action = within(canvasElement).getByRole('button', { name: 'Entrar para inscrever-se' });
    await expect(action).toBeEnabled();
    await userEvent.click(action);
  },
};

export const Confirmed: Story = {
  args: {
    registration: {
      title: 'Inscrição confirmada',
      description: 'Acompanhe suas inscrições e presenças na página de participações.',
      action: { label: 'Ver minhas participações', route: ['/profile', 'attendances'] },
    },
  },
};

export const RegistrationClosed: Story = {
  args: {
    registration: {
      title: 'Inscrições encerradas',
      description: 'Você pode continuar consultando as informações e a programação.',
    },
  },
};

export const TournamentOnly: Story = {
  args: {
    majorEvent: createPublicMajorEvent({
      name: 'Encontro esportivo da comunidade',
      emoji: '🏆',
      description: 'Acompanhe as equipes e a programação de jogos do torneio.',
      hasEvents: false,
      sportsTournament: { id: 'tournament-1', selfSubscriptionEnabled: true, registrationOpen: true },
    }),
    events: [],
    registration: {
      title: 'Inscrições no torneio',
      action: { label: 'Solicitar inscrição', route: ['/tournament', 'tournament-1', 'subscribe'] },
    },
    links: [{ label: 'Ver torneio', icon: 'emoji_events', route: ['/tournament', 'tournament-1'] }],
  },
};

export const MinimalInformation: Story = {
  args: {
    majorEvent: createPublicMajorEvent({ description: null, isPaymentRequired: null }),
    events: [],
    links: [],
    registration: { title: 'Informações de participação em breve' },
  },
};

export const LoadingProgram: Story = {
  args: { events: [], programLoading: true },
};

export const PartialProgramError: Story = {
  args: { events: events.slice(0, 2), programError: true, programHasMore: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('link', { name: /Encontro de abertura/ })).toBeVisible();
    const retry = canvas.getByRole('button', { name: 'Tentar novamente' });
    await expect(retry).toBeEnabled();
    await userEvent.click(retry);
  },
};

export const PaginatedProgram: Story = {
  args: { programHasMore: true },
  play: async ({ canvasElement }) => {
    const loadMore = within(canvasElement).getByRole('button', { name: 'Carregar mais atividades' });
    await expect(loadMore).toBeEnabled();
    await userEvent.click(loadMore);
  },
};

export const LongContent: Story = {
  args: {
    majorEvent: {
      ...majorEvent,
      name: 'Congresso interdisciplinar de ciência, tecnologia, cultura, extensão universitária e desenvolvimento sustentável',
    },
    events: events.map((event) => ({
      ...event,
      name: `${event.name}: experiências compartilhadas por estudantes, pesquisadores e comunidade`,
      locationDescription:
        'Centro de estudos e atividades interdisciplinares, sala de apresentações do bloco principal',
    })),
  },
};
