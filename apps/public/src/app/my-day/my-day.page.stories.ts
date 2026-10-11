import { AuthService } from '@cacic-fct/shared-angular';
import { computed, signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { applicationConfig, type Meta, type StoryObj } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import {
  MyDayStoryControls,
  createMyDayStoryData,
  createMyDayStoryState,
  myDayStoryControlArgTypes,
  myDayStoryDefaultControls,
} from './my-day-story.fixtures';
import { MyDayPage } from './my-day.page';
import { MyDayStore } from './my-day.store';
import { myDayDateKey } from './my-day-date';

const activeArgs = signal<MyDayStoryControls>(myDayStoryDefaultControls);
const storyState = computed(() => createMyDayStoryState(activeArgs()));
const storyData = computed(() => storyState().data);

const meta: Meta<MyDayStoryControls> = {
  component: MyDayPage,
  title: 'Public/Discovery/My Day',
  tags: ['autodocs'],
  args: myDayStoryDefaultControls,
  argTypes: myDayStoryControlArgTypes,
  render: (args) => {
    activeArgs.set({ ...myDayStoryDefaultControls, ...args });
    return { props: {} };
  },
  decorators: [
    applicationConfig({
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            user: computed(() => ({ sub: 'storybook-user', claims: { name: activeArgs().userName } })),
          },
        },
        {
          provide: MyDayStore,
          useValue: {
            state: storyState,
            data: storyData,
            selectedDate: signal(myDayDateKey(new Date())),
            cooldownSeconds: computed(() => activeArgs().cooldownSeconds),
            start: () => undefined,
            load: () => Promise.resolve(),
            refresh: () => Promise.resolve(),
          },
        },
      ],
    }),
  ],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Daily companion with editable deterministic data, operational states, schedule, actions, weather, and alerts.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<MyDayStoryControls>;

export const Playground: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    if (args.currentEvent) {
      await expect(canvas.getByRole('heading', { name: 'Agora' })).toBeVisible();
    }
    if (args.nextEvent) {
      await expect(canvas.getByRole('heading', { name: 'Próximo compromisso' })).toBeVisible();
    }
    if (args.attentionCount > 0 || args.weatherCount > 0) {
      await expect(canvas.getByRole('heading', { name: 'Atenção' })).toBeVisible();
    }
    if (args.laterEventCount > 0) {
      await expect(canvas.getByRole('heading', { name: 'Depois' })).toBeVisible();
    }
  },
};

export const DenseAgenda: Story = {
  args: { laterEventCount: 12, attentionCount: 9, weatherCount: 8 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByRole('link').length).toBeGreaterThan(20);
    await expect(canvas.getAllByText(/Conflito de horário/)).toHaveLength(3);
  },
};

export const Offline: Story = {
  args: { state: 'offline', laterEventCount: 6, attentionCount: 6 },
  globals: { network: 'offline' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Dados salvos')).toBeVisible();
    await expect(canvas.queryByText('Envie seu comprovante')).not.toBeInTheDocument();
    await expect(canvas.getByRole('link', { name: /Coletar presenças/ })).toBeVisible();
    await expect(canvas.queryByRole('link', { name: /Operar partida/ })).not.toBeInTheDocument();
  },
};

export const EmptyDay: Story = {
  args: { state: 'empty' },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('Nada marcado para este dia')).toBeVisible();
  },
};

export const Loading: Story = {
  args: { state: 'loading' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByLabelText('Carregando seu dia')).toBeVisible();
    await expect(canvas.getByText('Organizando seus compromissos…')).toBeVisible();
  },
};

export const LoadError: Story = {
  args: { state: 'error' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: 'Não foi possível abrir este dia' })).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Tentar novamente' }));
  },
};

export const RateLimitNotice: Story = {
  args: { cooldownSeconds: 47 },
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText(/novas atualizações estarão disponíveis em 47 s/),
    ).toBeVisible();
  },
};

export const LongContent: Story = {
  args: {
    userName: 'Maria Eduarda de Almeida e Souza',
    eventNamePrefix: 'Encontro interdisciplinar universitário de inovação e acessibilidade —',
    locationDescription: 'Centro de Ciências, bloco de laboratórios, auditório principal do segundo pavimento',
    laterEventCount: 5,
  },
  globals: { network: 'online' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/Maria/)).toBeVisible();
    await expect(canvas.getAllByText(/Encontro interdisciplinar/).length).toBeGreaterThan(1);
  },
};

export const NoCurrentOrNext: Story = {
  args: { currentEvent: false, nextEvent: false, laterEventCount: 4, attentionCount: 0, weatherCount: 0 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole('heading', { name: 'Agora' })).not.toBeInTheDocument();
    await expect(canvas.queryByRole('heading', { name: 'Próximo compromisso' })).not.toBeInTheDocument();
    await expect(canvas.getByRole('heading', { name: 'Depois' })).toBeVisible();
  },
};

export const GeneratedDataReference: Story = {
  args: { laterEventCount: 2, attentionCount: 1, weatherCount: 1 },
  loaders: [async ({ args }) => ({ generatedDay: createMyDayStoryData(args) })],
  parameters: {
    docs: {
      description: {
        story: 'Uses a Storybook loader to expose the exact generated fixture in the story context for addons.',
      },
    },
  },
};
