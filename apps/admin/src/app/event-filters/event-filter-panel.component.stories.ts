import type { Meta, StoryObj } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import { FormControl, FormGroup } from '@angular/forms';
import type { EventMembershipFilter } from './event-list-filters';
import { EventFilterPanelComponent } from './event-filter-panel.component';

type EventFilterPanelStoryArgs = {
  query: string;
  startDateFrom: string;
  startDateUntil: string;
  isInGroup: EventMembershipFilter;
  isInMajorEvent: EventMembershipFilter;
  applyLabel: string;
  resetLabel: string;
};

const meta: Meta<EventFilterPanelStoryArgs> = {
  component: EventFilterPanelComponent,
  title: 'CACiC Eventos/Workspace/Tabs/Shared/Event Filter Panel',
  tags: ['autodocs'],
  args: {
    query: 'angular',
    startDateFrom: new Date().toISOString().slice(0, 10),
    startDateUntil: new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10),
    isInGroup: 'ALL',
    isInMajorEvent: 'ALL',
    applyLabel: 'Buscar eventos',
    resetLabel: 'Limpar filtros',
  },
  argTypes: {
    query: { control: 'text' },
    startDateFrom: { control: 'date' },
    startDateUntil: { control: 'date' },
    isInGroup: { control: 'select', options: ['ALL', 'YES', 'NO'] },
    isInMajorEvent: { control: 'select', options: ['ALL', 'YES', 'NO'] },
    applyLabel: { control: 'text' },
    resetLabel: { control: 'text' },
  },
  render: (args) => ({
    props: {
      form: createFilterForm(args),
      applyLabel: args.applyLabel,
      resetLabel: args.resetLabel,
    },
  }),
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'error' },
  },
};

export default meta;

type Story = StoryObj<EventFilterPanelStoryArgs>;

const normalizeDateControlValue = (value: string | number): Date | null => {
  if (value === '') return null;
  return new Date(typeof value === 'number' ? value : `${value}T12:00:00`);
};

const createFilterForm = (args: EventFilterPanelStoryArgs) =>
  new FormGroup({
    startDateFrom: new FormControl<Date | null>(normalizeDateControlValue(args.startDateFrom)),
    startDateUntil: new FormControl<Date | null>(normalizeDateControlValue(args.startDateUntil)),
    isInGroup: new FormControl(args.isInGroup, { nonNullable: true }),
    isInMajorEvent: new FormControl(args.isInMajorEvent, { nonNullable: true }),
    query: new FormControl(args.query, { nonNullable: true }),
  });

const exerciseStory = async (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement);
  await expect(canvas.getByRole('searchbox', { name: 'Buscar eventos' })).toBeVisible();
  const filters = canvas.getByRole('button', { name: /Filtros/ });
  await expect(filters).toHaveAttribute('aria-expanded', 'false');
  await userEvent.click(filters);
  await expect(canvas.getByRole('combobox', { name: 'Vínculo com grupo' })).toBeVisible();
  await expect(canvas.getByRole('combobox', { name: 'Vínculo com grande evento' })).toBeVisible();
  await userEvent.click(filters);
  await expect(filters).toHaveAttribute('aria-expanded', 'false');
};

export const Playground: Story = {

  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};

export const EmptyFilters: Story = {
  globals: { theme: 'dark', motion: 'reduced' },
  args: {
    query: '',
    startDateFrom: '',
    startDateUntil: '',
    isInGroup: 'ALL',
    isInMajorEvent: 'ALL',
    applyLabel: 'Aplicar',
    resetLabel: 'Redefinir',
  },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};

export const Filters: Story = {
  args: {
    query: 'certificados',
    isInGroup: 'YES',
    isInMajorEvent: 'NO',
    applyLabel: 'Buscar',
    resetLabel: 'Limpar',
  },
  globals: { theme: 'light' },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};
