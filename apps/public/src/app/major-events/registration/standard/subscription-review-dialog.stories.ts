import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import {
  createPublicEvent,
  createPublicMajorEvent,
  createPublicMajorEventPrice,
  publicFixtureDateFromNow,
} from '@cacic-fct/event-manager-public-testing';
import type { Meta, StoryObj } from '@storybook/angular';
import { applicationConfig } from '@storybook/angular';
import { expect, fn, within } from 'storybook/test';
import { createSubscriptionFlowFormFixtures } from './subscription-flow.fixtures';
import { createSubscriptionFlowDraft, subscriptionFormKey } from './subscription-flow.models';
import { SubscriptionReviewDialog, type SubscriptionReviewDialogData } from './subscription-review-dialog';

interface SubscriptionReviewDialogStoryArgs {
  eventCount: number;
  formCount: number;
  paymentTier: string;
  requireLicenseAgreement: boolean;
  longNames: boolean;
  targetType: 'major-event' | 'event';
}

const defaultArgs: SubscriptionReviewDialogStoryArgs = {
  eventCount: 3,
  formCount: 2,
  paymentTier: 'Estudante',
  requireLicenseAgreement: true,
  longNames: false,
  targetType: 'major-event',
};

let activeArgs = defaultArgs;

const meta: Meta<SubscriptionReviewDialogStoryArgs> = {
  component: SubscriptionReviewDialog,
  title: 'CACiC Eventos/Major Events/Registration/Standard/Review Dialog',
  tags: ['autodocs'],
  args: defaultArgs,
  argTypes: {
    eventCount: { control: { type: 'range', min: 1, max: 8, step: 1 } },
    formCount: { control: { type: 'range', min: 0, max: 2, step: 1 } },
    paymentTier: { control: 'text' },
    requireLicenseAgreement: { control: 'boolean' },
    longNames: { control: 'boolean' },
    targetType: { control: 'inline-radio', options: ['major-event', 'event'] },
  },
  render: (args) => {
    activeArgs = { ...defaultArgs, ...args };
    return { props: {} };
  },
  decorators: [
    applicationConfig({
      providers: [
        { provide: MAT_DIALOG_DATA, useFactory: () => createReviewData(activeArgs) },
        { provide: MatDialogRef, useValue: { close: fn() } },
      ],
    }),
  ],
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'error' },
  },
};

export default meta;
type Story = StoryObj<SubscriptionReviewDialogStoryArgs>;

export const Playground: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: 'Revise sua inscrição' })).toBeVisible();
    await expect(canvas.getByText('Tamanho da camiseta')).toBeVisible();
    await expect(canvas.getByText('M')).toBeVisible();
    await expect(canvas.queryByText('Responda as perguntas obrigatórias')).not.toBeInTheDocument();
    await expect(canvasElement.querySelector('lib-event-form-renderer')).toBeNull();
  },
};

export const EventsOnly: Story = {
  args: { formCount: 0, paymentTier: '', requireLicenseAgreement: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: 'Eventos selecionados' })).toBeVisible();
    await expect(canvas.queryByRole('heading', { name: 'Respostas' })).not.toBeInTheDocument();
  },
};

export const StandaloneEvent: Story = {
  args: { targetType: 'event', eventCount: 1, paymentTier: '', requireLicenseAgreement: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Evento', { exact: true })).toBeVisible();
    await expect(canvas.getByText('Atividade 1', { exact: true })).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Confirmar inscrição' })).toBeVisible();
  },
};

export const DenseMobileDark: Story = {
  args: { eventCount: 8, longNames: true },
  parameters: { viewport: { defaultViewport: 'mobile' } },
  globals: { theme: 'dark', motion: 'reduced' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect((await canvas.findAllByText(/Atividade interdisciplinar/)).length).toBeGreaterThan(5);
    await expect(canvas.getByRole('button', { name: 'Confirmar inscrição' })).toBeVisible();
  },
};

function createReviewData(args: SubscriptionReviewDialogStoryArgs): SubscriptionReviewDialogData {
  const events = Array.from({ length: args.eventCount }, (_, index) =>
    createPublicEvent({
      id: `event-${index + 1}`,
      name: args.longNames
        ? `Atividade interdisciplinar de tecnologia, ciência e acessibilidade ${index + 1}`
        : `Atividade ${index + 1}`,
      emoji: ['🧩', '🧠', '♿', '📡'][index % 4],
      startDate: publicFixtureDateFromNow(index + 1, 9 + (index % 4) * 2),
      endDate: publicFixtureDateFromNow(index + 1, 11 + (index % 4) * 2),
    }),
  );
  const forms = createSubscriptionFlowFormFixtures()
    .slice(0, args.formCount)
    .map((form) =>
      args.targetType === 'event' && events[0]
        ? {
            ...form,
            targetType: 'EVENT' as const,
            targetId: events[0].id,
            targetName: events[0].name,
          }
        : form,
    );
  const draft = createSubscriptionFlowDraft(forms, args.requireLicenseAgreement);
  if (forms[0]) {
    draft.answersByKey[subscriptionFormKey(forms[0])] = [{ elementId: 'shirt-size', value: 'm' }];
  }
  if (forms[1]) {
    draft.answersByKey[subscriptionFormKey(forms[1])] = [{ elementId: 'meal', value: 'yes' }];
  }

  return {
    ...(args.targetType === 'major-event'
      ? {
          majorEvent: createPublicMajorEvent({
            id: 'major-1',
            name: 'SECOMPP',
            emoji: '🎓',
            majorEventPrices: [createPublicMajorEventPrice()],
          }),
        }
      : { event: events[0] }),
    events,
    forms,
    draft,
    paymentTier: args.paymentTier || null,
    requireImageLicenseAgreement: args.requireLicenseAgreement,
  };
}
