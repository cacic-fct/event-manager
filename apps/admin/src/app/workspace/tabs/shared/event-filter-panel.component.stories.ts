import type { Meta, StoryObj } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import { FormControl, FormGroup } from '@angular/forms';
import type { EventMembershipFilter } from '../../../shared/event-list-filters';
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
    startDateFrom: '2026-05-01',
    startDateUntil: '2026-05-31',
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
    a11y: { test: 'todo' },
  },
};

export default meta;

type Story = StoryObj<EventFilterPanelStoryArgs>;

const normalizeDateControlValue = (value: string | number): string => {
  if (typeof value === 'number') {
    return new Date(value).toISOString().slice(0, 10);
  }
  return value;
};

const createFilterForm = (args: EventFilterPanelStoryArgs) =>
  new FormGroup({
    startDateFrom: new FormControl(normalizeDateControlValue(args.startDateFrom), { nonNullable: true }),
    startDateUntil: new FormControl(normalizeDateControlValue(args.startDateUntil), { nonNullable: true }),
    isInGroup: new FormControl(args.isInGroup, { nonNullable: true }),
    isInMajorEvent: new FormControl(args.isInMajorEvent, { nonNullable: true }),
    query: new FormControl(args.query, { nonNullable: true }),
  });

const exerciseStory = async (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement);
  await userEvent.tab();
  const buttons = canvas.queryAllByRole('button');
  const enabledButton = buttons.find(
    (button) => !button.hasAttribute('disabled') && button.getAttribute('aria-disabled') !== 'true',
  );
  if (enabledButton) {
    await userEvent.hover(enabledButton);
    await expect(enabledButton).toBeVisible();
  }
  const links = canvas.queryAllByRole('link');
  if (links[0]) {
    await expect(links[0]).toBeVisible();
  }
};

export const FilledFilters: Story = {
  globals: { theme: 'light' },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};

export const EmptyFilters: Story = {
  args: {
    query: '',
    startDateFrom: '',
    startDateUntil: '',
    isInGroup: 'ALL',
    isInMajorEvent: 'ALL',
    applyLabel: 'Aplicar',
    resetLabel: 'Redefinir',
  },
  globals: { theme: 'light' },
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
