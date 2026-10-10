import { withScenarioControls } from '@cacic-fct/shared-angular/storybook';
import { AnalyticsService } from '../../analytics/analytics.service';
import { applicationConfig, type Meta, type StoryObj } from '@storybook/angular';
import { provideRouter } from '@angular/router';
import { EMPTY, NEVER, of, throwError } from 'rxjs';
import { expect, within } from 'storybook/test';
import type { TicketPurchaseOption } from '@cacic-fct/shared-ticketing';
import { createTicketPurchase, createTicketPurchaseOption } from '@cacic-fct/shared-ticketing/testing';
import { TicketingApiService } from '../../profile/ticketing/ticketing-api.service';
import { TicketPurchaseApiService } from './ticket-purchase-api.service';
import { TicketPurchaseOptionsSectionComponent } from './ticket-purchase-options-section.component';

type TicketPurchaseOptionsStoryArgs = {
  majorEventId: string;
  subscriptionStatus: string;
  scenario: 'available' | 'empty' | 'under-review' | 'rejected' | 'approved' | 'unvalidated' | 'loading' | 'error';
  ticketName: string;
  emoji: string;
  description: string;
  amountCents: number;
  priceTierName: string;
};

const sampleOption = (args: TicketPurchaseOptionsStoryArgs): TicketPurchaseOption =>
  createTicketPurchaseOption({
    eventId: 'party-event',
    majorEventId: args.majorEventId,
    ticketConfigId: 'party-ticket-config',
    name: args.ticketName,
    emoji: args.emoji,
    description: args.description,
    amountCents: args.amountCents,
    priceTierId: args.priceTierName ? 'student-tier' : null,
    priceTierName: args.priceTierName || null,
    event: { id: 'party-event', name: args.ticketName, emoji: args.emoji, locationDescription: 'Salão de eventos' },
  });

const meta: Meta<TicketPurchaseOptionsStoryArgs> = {
  component: TicketPurchaseOptionsSectionComponent,
  title: 'Public/Ticketing/Purchases/Options',
  tags: ['autodocs', 'ticketing'],
  parameters: { layout: 'padded', a11y: { test: 'error' } },
  args: {
    majorEventId: 'major-event-1',
    subscriptionStatus: 'CONFIRMED',
    scenario: 'available',
    ticketName: 'Festa de encerramento',
    emoji: '🎉',
    description: 'Entrada para a festa de encerramento do congresso.',
    amountCents: 2500,
    priceTierName: 'Estudante',
  },
  argTypes: {
    majorEventId: { control: 'text' },
    subscriptionStatus: { control: 'text' },
    scenario: { control: 'select', options: ['available', 'empty', 'under-review', 'rejected', 'approved', 'unvalidated', 'loading', 'error'] },
    ticketName: { control: 'text' },
    emoji: { control: 'text' },
    description: { control: 'text' },
    amountCents: { control: 'number' },
    priceTierName: { control: 'text' },
  },
  decorators: [
    withScenarioControls<TicketPurchaseOptionsStoryArgs>(),
    (story, context) =>
      applicationConfig({
        providers: [
          {
            provide: TicketPurchaseApiService,
            useValue: {
              getOptions: () => {
                if (context.args.scenario === 'loading') return NEVER;
                if (context.args.scenario === 'error') return throwError(() => new Error('Falha na API'));
                if (context.args.scenario === 'empty' || context.args.scenario === 'unvalidated') return of([]);
                return of([sampleOption(context.args)]);
              },
              getPurchases: () => context.args.scenario === 'under-review' || context.args.scenario === 'rejected' || context.args.scenario === 'approved'
                ? of([createTicketPurchase({
                    name: context.args.ticketName,
                    emoji: context.args.emoji,
                    amountCents: context.args.amountCents,
                    priceTierName: context.args.priceTierName || null,
                    status: context.args.scenario === 'under-review' ? 'UNDER_REVIEW' : context.args.scenario === 'rejected' ? 'REJECTED' : 'APPROVED',
                    rejectionReason: context.args.scenario === 'rejected' ? 'O comprovante está ilegível.' : null,
                  })])
                : of([]),
            },
          },
          { provide: TicketingApiService, useValue: { watchCurrentUser: () => EMPTY } },
          { provide: AnalyticsService, useValue: { trackEvent: () => undefined } },
          provideRouter([{ path: '**', children: [] }]),
        ],
      })(story, context),
  ],
};

export default meta;

type Story = StoryObj<TicketPurchaseOptionsStoryArgs>;

export const Playground: Story = {
  args: { scenario: 'available' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('heading', { name: 'Bilhetes adicionais' })).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Comprar' })).toBeEnabled();
  },
};

export const Available: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: 'Bilhetes adicionais' })).toBeVisible();
    await expect(canvas.getByText('Valor para a faixa Estudante')).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Comprar' })).toBeVisible();
  },
};

export const NoOffers: Story = {
  args: { scenario: 'empty' },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByText('Bilhetes adicionais')).toBeNull();
  },
};

export const ReceiptNotValidated: Story = {
  args: { scenario: 'unvalidated', subscriptionStatus: 'RECEIPT_UNDER_REVIEW' },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByText('Festa de encerramento')).toBeNull();
  },
};

export const RejectedReceipt: Story = {
  args: { scenario: 'rejected' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Comprovante rejeitado')).toBeVisible();
    await expect(canvas.getByText('O comprovante está ilegível.')).toBeVisible();
  },
};

export const Loading: Story = {
  args: { scenario: 'loading' },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByRole('progressbar', { name: 'Carregando bilhetes adicionais' })).toBeVisible();
  },
};

export const LoadError: Story = {
  args: { scenario: 'error' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Não foi possível carregar os bilhetes adicionais.')).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Tentar novamente' })).toBeEnabled();
  },
};
