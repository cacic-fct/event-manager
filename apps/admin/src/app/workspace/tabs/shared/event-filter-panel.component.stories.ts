import type { Meta, StoryObj } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import { FormControl, FormGroup } from '@angular/forms';
import { EventFilterPanelComponent } from './event-filter-panel.component';

const meta: Meta<EventFilterPanelComponent> = {
  component: EventFilterPanelComponent,
  title: 'CACiC Eventos/Workspace/Tabs/Shared/Event Filter Panel',
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
  },
};

export default meta;

type Story = StoryObj<EventFilterPanelComponent>;

const createFilterForm = (query = '') =>
  new FormGroup({
    startDateFrom: new FormControl('2026-05-01', { nonNullable: true }),
    startDateUntil: new FormControl('2026-05-31', { nonNullable: true }),
    isInGroup: new FormControl('ALL', { nonNullable: true }),
    isInMajorEvent: new FormControl('ALL', { nonNullable: true }),
    query: new FormControl(query, { nonNullable: true }),
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
  args: { form: createFilterForm('angular'), applyLabel: 'Buscar eventos', resetLabel: 'Limpar filtros' },
  parameters: {
    viewport: { defaultViewport: 'desktop' },
  },
  globals: { theme: 'light' },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};

export const EmptyFilters: Story = {
  args: { form: createFilterForm('certificados'), applyLabel: 'Aplicar', resetLabel: 'Redefinir' },
  parameters: {
    viewport: { defaultViewport: 'desktop' },
  },
  globals: { theme: 'light' },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};

export const DarkFilters: Story = {
  args: { form: createFilterForm('offline'), applyLabel: 'Buscar no cache', resetLabel: 'Limpar' },
  parameters: {
    backgrounds: { default: 'dark' },
    viewport: { defaultViewport: 'desktop' },
  },
  globals: { theme: 'dark' },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};

export const MobileFilters: Story = {
  args: { form: createFilterForm(), applyLabel: 'Buscar', resetLabel: 'Limpar' },
  parameters: {
    viewport: { defaultViewport: 'mobile' },
  },
  globals: { theme: 'light' },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};
