import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { applicationConfig, type Meta, type StoryObj } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import type { ReceiptValidationFilters } from './receipt-validation-filtering';
import { ReceiptValidationFiltersDialogComponent } from './receipt-validation-filters-dialog.component';

interface FilterDialogStoryArgs {
  subscriptionCount: number;
  ticketCount: number;
  paymentTiers: string[];
  category: 'ALL' | 'SUBSCRIPTION' | 'TICKET';
  paymentTier: string | null;
  sort: ReceiptValidationFilters['sort'];
}

const defaultArgs: FilterDialogStoryArgs = {
  subscriptionCount: 3,
  ticketCount: 2,
  paymentTiers: ['Estudante', 'Visitante'],
  category: 'ALL',
  paymentTier: null,
  sort: 'UPDATED_ASC',
};

let appliedFilters: ReceiptValidationFilters | undefined;

const meta: Meta<FilterDialogStoryArgs> = {
  component: ReceiptValidationFiltersDialogComponent,
  title: 'CACiC Eventos/Workspace/Tabs/Subscriptions/Receipt Validation/Receipt Filters',
  tags: ['autodocs', 'ticketing'],
  args: defaultArgs,
  argTypes: {
    subscriptionCount: { control: { type: 'range', min: 0, max: 100, step: 1 } },
    ticketCount: { control: { type: 'range', min: 0, max: 100, step: 1 } },
    paymentTiers: { control: 'object' },
    category: { control: 'inline-radio', options: ['ALL', 'SUBSCRIPTION', 'TICKET'] },
    paymentTier: { control: 'text' },
    sort: { control: 'select', options: ['UPDATED_ASC', 'UPDATED_DESC', 'CREATED_ASC', 'CREATED_DESC'] },
  },
  decorators: [
    (story, context) => {
      appliedFilters = undefined;
      const args = context.args;
      const filters: ReceiptValidationFilters = {
        category: args.category,
        paymentTier: args.paymentTier,
        sort: args.sort,
      };
      return applicationConfig({
        providers: [
          {
            provide: MAT_DIALOG_DATA,
            useValue: {
              subscriptionCount: args.subscriptionCount,
              ticketCount: args.ticketCount,
              paymentTiers: args.paymentTiers,
              filters,
            },
          },
          {
            provide: MatDialogRef,
            useValue: { close: (value?: ReceiptValidationFilters) => { appliedFilters = value; } },
          },
        ],
      })(story, context);
    },
  ],
  parameters: { layout: 'centered', a11y: { test: 'error' } },
};

export default meta;
type Story = StoryObj<FilterDialogStoryArgs>;

export const Playground: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('heading', { name: 'Filtrar comprovantes' })).toBeVisible();
    await userEvent.click(canvas.getByRole('radio', { name: 'Bilhetes (2)' }));
    await expect(canvas.queryByRole('combobox', { name: 'Lote da inscrição' })).toBeNull();
    await userEvent.click(canvas.getByRole('button', { name: 'Aplicar filtros' }));
    expect(appliedFilters).toEqual({ category: 'TICKET', paymentTier: null, sort: 'UPDATED_ASC' });
  },
};

export const SubscriptionWithTier: Story = {
  args: { category: 'SUBSCRIPTION' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('combobox', { name: 'Lote da inscrição' })).toBeVisible();
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole('combobox', { name: 'Lote da inscrição' }));
    await userEvent.click(await body.findByRole('option', { name: 'Visitante' }));
    await userEvent.click(canvas.getByRole('combobox', { name: 'Ordenar por' }));
    await userEvent.click(await body.findByRole('option', { name: 'Criação (mais recente primeiro)' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Aplicar filtros' }));
    expect(appliedFilters).toEqual({ category: 'SUBSCRIPTION', paymentTier: 'Visitante', sort: 'CREATED_DESC' });
  },
};

export const OneTicketResult: Story = {
  args: { subscriptionCount: 0, ticketCount: 1, paymentTiers: [] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Bilhete (1)', { exact: true })).toBeVisible();
  },
};

export const DarkTheme: Story = {
  globals: { theme: 'dark' },
};

export const ReducedMotion: Story = {
  globals: { motion: 'reduced' },
};
