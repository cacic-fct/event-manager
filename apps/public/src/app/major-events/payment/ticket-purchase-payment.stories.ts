import { withScenarioControls } from '@cacic-fct/shared-angular/storybook';
import { applicationConfig, type Meta, type StoryObj } from '@storybook/angular';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import type { CurrentUserMajorEventSubscription } from '@cacic-fct/shared-utils';
import { createTicketPurchase, createTicketPurchaseOption, createTicketPurchaseReceipt } from '@cacic-fct/shared-ticketing/testing';
import type { TicketPurchaseOption } from '@cacic-fct/shared-ticketing';
import { EMPTY, of, throwError } from 'rxjs';
import { expect, fireEvent, userEvent, waitFor, within } from 'storybook/test';
import { AnalyticsService } from '../../analytics/analytics.service';
import { MajorEventSubscriptionApiService } from '../registration/subscription-api.service';
import { PaymentReceiptApiService } from './receipt-api.service';
import { RealtimeInvalidationService } from '../../shared/realtime-invalidation.service';
import { TicketingApiService } from '../../profile/ticketing/ticketing-api.service';
import { TicketPurchaseApiService } from './ticket-purchase-api.service';
import { PaymentInfo } from './payment-info';

type TicketPurchasePaymentStoryArgs = {
  mode: 'ready' | 'under-review' | 'rejected' | 'price-changed' | 'upload-error';
  expectedAmountCents: number;
  ticketName: string;
  ticketEmoji: string;
  description: string;
  amountCents: number;
  priceTierName: string;
};

const ticketOption = (args: TicketPurchasePaymentStoryArgs): TicketPurchaseOption =>
  createTicketPurchaseOption({
    eventId: 'party-event',
    majorEventId: 'major-1',
    ticketConfigId: 'party-ticket-config',
    name: args.ticketName,
    emoji: args.ticketEmoji,
    description: args.description,
    amountCents: args.amountCents,
    priceTierName: args.priceTierName || null,
    event: {
      id: 'party-event',
      name: args.ticketName,
      emoji: args.ticketEmoji,
      locationDescription: 'Salão de eventos',
    },
  });

const parentSubscription = {
  id: 'major-event-subscription-1',
  majorEventId: 'major-1',
  subscriptionStatus: 'CONFIRMED',
  paymentTier: 'Estudante',
  amountPaid: 10000,
  majorEvent: {
    id: 'major-1',
    name: 'Congresso de Computação',
    isPaymentRequired: true,
    paymentInfo: {
      bankName: 'Banco do Brasil',
      agency: '0001',
      account: '12345-6',
      holder: 'CACiC Eventos',
      document: '00.000.000/0001-00',
      pixKey: 'pagamentos@cacic.com.br',
      pixCity: 'São Paulo',
      additionalPaymentInfo: null,
    },
    additionalPaymentInfo: 'Informe o nome completo no comprovante.',
    majorEventPrices: [],
  },
} as unknown as CurrentUserMajorEventSubscription;

const defaultArgs: TicketPurchasePaymentStoryArgs = {
  mode: 'ready',
  expectedAmountCents: 2500,
  ticketName: 'Festa de encerramento',
  ticketEmoji: '🎉',
  description: 'Acesso à festa de encerramento do congresso.',
  amountCents: 2500,
  priceTierName: 'Estudante',
};

const meta: Meta<TicketPurchasePaymentStoryArgs> = {
  component: PaymentInfo,
  title: 'Public/Ticketing/Payments/Receipt',
  tags: ['autodocs', 'ticketing'],
  parameters: { layout: 'fullscreen', a11y: { test: 'error' } },
  args: defaultArgs,
  argTypes: {
    mode: { control: 'select', options: ['ready', 'under-review', 'rejected', 'price-changed', 'upload-error'] },
    expectedAmountCents: { control: 'number' },
    ticketName: { control: 'text' },
    ticketEmoji: { control: 'text' },
    description: { control: 'text' },
    amountCents: { control: 'number' },
    priceTierName: { control: 'text' },
  },
  decorators: [
    withScenarioControls<TicketPurchasePaymentStoryArgs>(),
    (story, context) => {
      const args = { ...defaultArgs, ...context.args };
      const option = ticketOption(args);
      const purchase = storyPurchase(args.mode, option);
      const options = args.mode === 'under-review' ? [] : [option];
      const receiptResult = {
        ...createTicketPurchaseReceipt(),
        id: 'ticket-receipt-uploaded',
        imageUrl: '/api/ticket-purchases/story-purchase/receipt',
        purchaseId: 'story-purchase',
      };

      return applicationConfig({
        providers: [
          provideRouter([]),
          {
            provide: ActivatedRoute,
            useValue: {
              snapshot: {
                paramMap: convertToParamMap({ majorEventId: 'major-1', ticketEventId: 'party-event' }),
                queryParamMap: convertToParamMap({
                  ticketConfigId: option.ticketConfigId,
                  expectedAmountCents: args.expectedAmountCents.toString(),
                }),
              },
            },
          },
          { provide: MajorEventSubscriptionApiService, useValue: { getCurrentUserSubscription: () => of(parentSubscription) } },
          { provide: PaymentReceiptApiService, useValue: { getCurrentReceipt: () => of(null), uploadReceipt: () => of() } },
          {
            provide: TicketPurchaseApiService,
            useValue: {
              getOptions: () => of(options),
              getPurchases: () => of(purchase ? [purchase] : []),
              uploadReceipt: () => args.mode === 'upload-error'
                ? throwError(() => new Error('Serviço temporariamente indisponível.'))
                : of({ type: 'progress' as const, progress: 100 }, { type: 'done' as const, result: receiptResult }),
            },
          },
          { provide: TicketingApiService, useValue: { watchCurrentUser: () => EMPTY } },
          {
            provide: RealtimeInvalidationService,
            useValue: { watchCurrentUserData: () => EMPTY, watchCatalog: () => EMPTY },
          },
          {
            provide: AnalyticsService,
            useValue: { trackEvent: () => undefined, trackMajorEventTransaction: () => undefined },
          },
        ],
      })(story, context);
    },
  ],
};

export default meta;

function storyPurchase(mode: TicketPurchasePaymentStoryArgs['mode'], option: TicketPurchaseOption) {
  if (mode !== 'under-review' && mode !== 'rejected') return null;
  return createTicketPurchase({
    id: 'story-purchase',
    eventId: option.eventId,
    majorEventId: option.majorEventId,
    ticketConfigId: option.ticketConfigId,
    name: option.name,
    emoji: option.emoji,
    priceTierName: option.priceTierName,
    amountCents: option.amountCents,
    status: mode === 'under-review' ? 'UNDER_REVIEW' : 'REJECTED',
    receipt: createTicketPurchaseReceipt({ imageUrl: '/api/ticket-purchases/story-purchase/receipt' }),
    rejectionReason: mode === 'rejected' ? 'O comprovante está ilegível.' : null,
  });
}

type Story = StoryObj<TicketPurchasePaymentStoryArgs>;

export const Playground: Story = {
  args: { mode: 'ready', expectedAmountCents: 2500 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('heading', { name: 'Festa de encerramento' })).toBeVisible();
    await expect(canvas.getByRole('button', { name: /^Enviar comprovante/ })).toBeEnabled();
  },
};

export const ReadyToUpload: Story = {
  args: { mode: 'ready', expectedAmountCents: 2500 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('heading', { name: 'Festa de encerramento' })).toBeVisible();
    await expect(canvas.getByText('R$ 25,00')).toBeVisible();
    await expect(canvas.getByRole('button', { name: /^Enviar comprovante/ })).toBeEnabled();
    await expect(canvas.getByText(/a equipe analisará o comprovante/)).toBeVisible();
  },
};

export const UploadSuccess: Story = {
  args: { mode: 'ready', expectedAmountCents: 2500 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole('heading', { name: 'Festa de encerramento' });
    const file = new File(['recibo de pagamento'], 'comprovante.pdf', { type: 'application/pdf' });
    const uploadButton = canvas.getByRole('button', { name: /^Enviar comprovante/ });
    await userEvent.click(uploadButton);
    // Deliver the native picker result without clicking its hidden input,
    // which would give Material the wrong focus-restoration target.
    const selectedFiles = new DataTransfer();
    selectedFiles.items.add(file);
    await fireEvent.change(canvas.getByLabelText('Enviar imagem ou PDF do comprovante de pagamento'), { target: { files: selectedFiles.files } });
    const dialog = within(canvasElement.ownerDocument.body);
    const confirmation = await dialog.findByRole('dialog', { name: 'Confirmar comprovante' });
    await expect(confirmation).toBeVisible();
    await userEvent.click(within(confirmation).getByRole('button', { name: 'Enviar' }));
    await expect(await canvas.findByText('Comprovante em análise')).toBeVisible();
    await expect(canvas.getByText(/comprovante do bilhete foi enviado e está vinculado/)).toBeVisible();
    const successMessage = await dialog.findByText('Comprovante enviado. A compra está em análise.');
    await expect(successMessage).toBeVisible();
    await waitFor(() => {
      expect(dialog.queryByRole('dialog', { name: 'Confirmar comprovante' })).toBeNull();
      expect(canvasElement.closest('[aria-hidden="true"]')).toBeNull();
      expect(successMessage.closest('[aria-hidden="true"]')).toBeNull();
    });
  },
};

export const PendingReceipt: Story = {
  args: { mode: 'under-review', expectedAmountCents: 2500 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Comprovante em análise')).toBeVisible();
    await expect(canvas.getByText('comprovante.pdf')).toBeVisible();
    await expect(canvas.queryByRole('button', { name: 'Enviar comprovante' })).toBeNull();
  },
};

export const RejectedReceipt: Story = {
  args: { mode: 'rejected', expectedAmountCents: 2500 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Comprovante rejeitado')).toBeVisible();
    await expect(canvas.getByRole('button', { name: /^Enviar novo comprovante/ })).toBeEnabled();
  },
};

export const ChangedPrice: Story = {
  args: { mode: 'ready', expectedAmountCents: 2400 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText(/O valor deste bilhete foi atualizado/)).toBeVisible();
    await expect(canvas.queryByRole('button', { name: 'Enviar comprovante' })).toBeNull();
  },
};

export const UploadFailure: Story = {
  args: { mode: 'upload-error', expectedAmountCents: 2500 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const file = new File(['recibo'], 'comprovante.pdf', { type: 'application/pdf' });
    const uploadButton = await canvas.findByRole('button', { name: /^Enviar comprovante/ });
    await userEvent.click(uploadButton);
    const selectedFiles = new DataTransfer();
    selectedFiles.items.add(file);
    await fireEvent.change(await canvas.findByLabelText('Enviar imagem ou PDF do comprovante de pagamento'), { target: { files: selectedFiles.files } });
    const dialog = within(canvasElement.ownerDocument.body);
    const confirmation = await dialog.findByRole('dialog', { name: 'Confirmar comprovante' });
    await expect(confirmation).toBeVisible();
    await userEvent.click(within(confirmation).getByRole('button', { name: 'Enviar' }));
    const errorMessage = await dialog.findByText('Serviço temporariamente indisponível.');
    await expect(errorMessage).toBeVisible();
    await expect(canvas.getByRole('button', { name: /^Enviar comprovante/ })).toBeEnabled();
    await waitFor(() => {
      expect(dialog.queryByRole('dialog', { name: 'Confirmar comprovante' })).toBeNull();
      expect(canvasElement.closest('[aria-hidden="true"]')).toBeNull();
      expect(errorMessage.closest('[aria-hidden="true"]')).toBeNull();
      expect(uploadButton).toHaveFocus();
    });
  },
};
