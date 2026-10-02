import type { Meta, StoryObj } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import { MajorEventsPageComponent } from './major-events-page.component';
import {
  defaultPageStoryArgs,
  exercisePageStory,
  pageStoryArgTypes,
  withPageStoryProviders,
  type PageStoryArgs,
} from '../stories/page-story-support';

const meta: Meta<PageStoryArgs> = {
  component: MajorEventsPageComponent,
  title: 'CACiC Eventos/Workspace/Tabs/Major Events/Workspace Major Events Tab',
  tags: ['autodocs'],
  args: defaultPageStoryArgs,
  argTypes: pageStoryArgTypes,
  decorators: [withPageStoryProviders],
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
  },
};

export default meta;

type Story = StoryObj<PageStoryArgs>;

export const Playground: Story = {
  play: async ({ canvasElement }) => exercisePageStory(canvasElement),
};

export const ScheduledPaymentEvent: Story = {
  args: {
    mode: 'populated',
    selectedIndex: 1,
    publicationState: 'SCHEDULED',
  },
  play: async ({ canvasElement }) => exercisePageStory(canvasElement),
};

export const DenseMixedCatalog: Story = {
  args: { itemCount: 30, requiresPayment: true, sportsEvery: 2 },
  play: async ({ canvasElement }) => exercisePageStory(canvasElement),
};

export const FreeCatalog: Story = {
  args: { itemCount: 12, requiresPayment: false, sportsEvery: 0 },
  play: async ({ canvasElement }) => exercisePageStory(canvasElement),
};

export const Loading: Story = {
  args: { mode: 'loading' },
  play: async ({ canvasElement }) => exercisePageStory(canvasElement),
};

export const FrozenSportsTournament: Story = {
  args: { frozenSelected: true, sportsEvery: 1, selectedIndex: 2 },
  play: async ({ canvasElement }) => exercisePageStory(canvasElement),
};

export const LongContentTablet: Story = {
  args: { longContent: true, itemCount: 12 },
  parameters: { viewport: { defaultViewport: 'tablet' } },
  globals: { theme: 'dark', motion: 'reduced' },
  play: async ({ canvasElement }) => exercisePageStory(canvasElement),
};

export const EmptyReadonly: Story = {
  globals: { theme: 'dark', motion: 'reduced' },
  args: {
    mode: 'readonly',
    itemCount: 0,
    selectedIndex: 0,
    publicationState: 'DRAFT',
  },
  play: async ({ canvasElement }) => exercisePageStory(canvasElement),
};

export const InterestAndEligibility: Story = {
  args: { selectedIndex: 0 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Permitir manifestação de interesse')).toBeVisible();
    await expect(canvas.getByText('Qualquer participante')).toBeVisible();
    await expect(canvas.getByText('Emitir para presentes não pagantes')).toBeVisible();
    await expect(canvas.getByText('Emitir para presentes não inscritos')).toBeVisible();
  },
};

export const CourseAudience: Story = {
  args: { selectedIndex: 2 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Curso permitido')).toBeVisible();
    await expect(canvas.getAllByText(/matrícula confirmada no Account Manager/i)[0]).toBeVisible();
  },
};

export const InvitationAudience: Story = {
  args: { selectedIndex: 3 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Pessoas convidadas')).toBeVisible();
    await expect(canvas.getByText('Pessoa convidada 4')).toBeVisible();
  },
};

export const OptionalPaymentWithPrices: Story = {
  args: { requiresPayment: false, sportsEvery: 0 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const prices = canvas.getAllByRole('spinbutton', { name: 'Valor' });
    const originalValues = prices.map((price) => (price as HTMLInputElement).value);
    await expect(canvas.getByRole('button', { name: 'Instruções e dados para pagamento' })).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(canvas.getByRole('checkbox', { name: 'Exigir pagamento' }));
    await userEvent.click(canvas.getByRole('checkbox', { name: 'Exigir pagamento' }));
    await expect(prices.map((price) => (price as HTMLInputElement).value)).toEqual(originalValues);
    for (const price of prices) await expect(price).toBeVisible();
  },
};

export const SearchMajorEvents: Story = {
  args: { itemCount: 12 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const records = canvasElement.querySelectorAll('app-workspace-record');
    await expect(records).toHaveLength(12);
    await userEvent.type(canvas.getByLabelText('Buscar grande evento por nome'), 'inexistente');
    await expect(canvas.getByText('Nenhum grande evento encontrado')).toBeVisible();
    await userEvent.clear(canvas.getByLabelText('Buscar grande evento por nome'));
    await expect(canvasElement.querySelectorAll('app-workspace-record')).toHaveLength(12);
  },
};
