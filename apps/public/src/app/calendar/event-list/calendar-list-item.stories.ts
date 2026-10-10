import { type Meta, type StoryObj } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import { publicStoryDate } from '../../testing/public-event-story-fixtures';
import { CalendarListItem, type CalendarListItemData } from './calendar-list-item';

type CalendarListItemStoryArgs = {
  item: CalendarListItemData;
};

const meta: Meta<CalendarListItemStoryArgs> = {
  component: CalendarListItem,
  title: 'CACiC Eventos/Calendar/Shared List Item',
  tags: ['autodocs', 'ticketing'],
  parameters: {
    layout: 'padded',
    a11y: { test: 'error' },
  },
  args: {
    item: {
      id: 'party-ticket',
      name: 'Festa de encerramento',
      emoji: '🎉',
      startDate: publicStoryDate(0, 22),
      endDate: publicStoryDate(1, 2),
      contextLine: 'Congresso de Computação',
      secondaryLines: ['Cedente: Marina'],
      route: ['/profile/ticket-transfers', 'transfer-1'],
      returnUrl: '/profile/ticket-transfers',
    },
  },
  argTypes: {
    item: { control: 'object' },
  },
};

export default meta;

type Story = StoryObj<CalendarListItemStoryArgs>;

export const Playground: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const link = await canvas.findByRole('link', { name: 'Abrir Festa de encerramento' });
    await expect(link).toBeVisible();
    await expect(canvas.getByText('Cedente: Marina')).toBeVisible();
  },
};

export const Linked: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('link', { name: 'Abrir Festa de encerramento' })).toBeVisible();
    await expect(canvas.getByText('Cedente: Marina')).toBeVisible();
  },
};

export const HiddenEvent: Story = {
  args: {
    item: {
      id: 'welcome-kit',
      name: 'Entrega do kit de boas-vindas',
      emoji: '🎁',
      startDate: publicStoryDate(0, 14),
      endDate: publicStoryDate(0, 18),
      contextLine: 'CACiC Eventos',
      secondaryLines: ['Disponível até 18h'],
      route: null,
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Entrega do kit de boas-vindas')).toBeVisible();
    await expect(canvas.queryByRole('link')).toBeNull();
  },
};

export const TransferMetadata: Story = {
  args: {
    item: {
      id: 'ticket-transfer-preview',
      name: 'Kit de boas-vindas',
      emoji: '🎁',
      startDate: publicStoryDate(1, 9),
      endDate: publicStoryDate(1, 12),
      contextLine: 'Congresso de Computação',
      contextLines: ['Congresso de Computação', 'Trilha de acessibilidade'],
      eventType: 'OTHER',
      secondaryLines: ['Cedente: Ana Costa', 'Transferência iniciada por: Alex'],
      expiresAt: publicStoryDate(1, 12),
      expiresLabel: 'Disponível na lista até',
      locationDescription: 'Entrada principal',
      route: ['/profile/wallet/ticket-transfers', 'transfer-preview'],
      returnUrl: '/profile/wallet/ticket-transfers',
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('link', { name: 'Abrir Kit de boas-vindas' })).toBeVisible();
    const metadata = Array.from(canvasElement.querySelectorAll('.metadata-item'), (item) => item.textContent?.trim());
    await expect(metadata).toEqual([
      'Congresso de Computação',
      'Trilha de acessibilidade',
      'Evento',
      'Cedente: Ana Costa',
      'Transferência iniciada por: Alex',
      expect.stringMatching(/^Disponível na lista até /),
      'Entrada principal',
    ]);
    await userEvent.hover(canvas.getByRole('link', { name: 'Abrir Kit de boas-vindas' }));
  },
};

export const DarkReducedMotion: Story = {
  ...Playground,
  args: {
    item: {
      id: 'dark-hidden-event',
      name: 'Entrega do kit de boas-vindas',
      emoji: '🎁',
      startDate: publicStoryDate(0, 14),
      endDate: publicStoryDate(0, 18),
      contextLine: 'CACiC Eventos',
      secondaryLines: ['Disponível até 18h'],
      route: null,
    },
  },
  globals: { theme: 'dark', motion: 'reduced' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Entrega do kit de boas-vindas')).toBeVisible();
    await expect(canvas.queryByRole('link')).toBeNull();
  },
};
