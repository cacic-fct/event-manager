import type { Meta, StoryObj } from '@storybook/angular';
import { applicationConfig } from '@storybook/angular';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { expect, userEvent, within } from 'storybook/test';
import {
  ReceiptValidationApiService,
  ReceiptValidationQueue,
} from '../../../../graphql/receipt-validation-api.service';
import { WorkspaceReceiptValidationComponent } from './workspace-receipt-validation.component';

const meta: Meta<WorkspaceReceiptValidationComponent> = {
  component: WorkspaceReceiptValidationComponent,
  title: 'CACiC Eventos/Workspace/Tabs/Subscriptions/Receipt Validation/Workspace Receipt Validation',
  tags: ['autodocs'],
  decorators: [
    applicationConfig({
      providers: createReceiptValidationStoryProviders(buildQueue(2)),
    }),
  ],
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
  },
};

export default meta;

type Story = StoryObj<WorkspaceReceiptValidationComponent>;

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

export const DataLoaded: Story = {
  args: {},
  parameters: {
    viewport: { defaultViewport: 'desktop' },
  },
  globals: { theme: 'light' },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};

export const DenseDesktop: Story = {
  args: {},
  decorators: [
    applicationConfig({
      providers: createReceiptValidationStoryProviders(buildQueue(6)),
    }),
  ],
  parameters: {
    viewport: { defaultViewport: 'desktop' },
  },
  globals: { theme: 'light' },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};

export const DarkMode: Story = {
  args: {},
  parameters: {
    backgrounds: { default: 'dark' },
    viewport: { defaultViewport: 'desktop' },
  },
  globals: { theme: 'dark' },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};

export const MobileLayout: Story = {
  args: {},
  parameters: {
    viewport: { defaultViewport: 'mobile' },
  },
  globals: { theme: 'light' },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};

export const EmptyQueue: Story = {
  args: {},
  decorators: [
    applicationConfig({
      providers: createReceiptValidationStoryProviders({ pendingCount: 0, items: [] }),
    }),
  ],
  parameters: {
    viewport: { defaultViewport: 'desktop' },
  },
  globals: { theme: 'light' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Nenhum comprovante pendente')).toBeVisible();
  },
};

function createReceiptValidationStoryProviders(queue: ReceiptValidationQueue) {
  const api = {
    watchQueue: () => of(queue),
    getQueue: () => of(queue),
    approve: () => of({ actionId: 'action-approve', item: queue.items[0] }),
    reject: () => of({ actionId: 'action-reject', item: queue.items[0] }),
    undo: () => of(queue.items[0]),
  } satisfies Partial<ReceiptValidationApiService>;

  return [
    provideRouter([]),
    {
      provide: ActivatedRoute,
      useValue: {
        snapshot: {
          paramMap: convertToParamMap({ majorEventId: 'major-event-1' }),
        },
      },
    },
    { provide: ReceiptValidationApiService, useValue: api },
  ];
}

function buildQueue(count: number): ReceiptValidationQueue {
  return {
    pendingCount: count,
    items: Array.from({ length: count }, (_, index) => ({
      subscriptionId: `subscription-${index + 1}`,
      majorEventId: 'major-event-1',
      majorEventName: 'Semana da Computação',
      personId: `person-${index + 1}`,
      personName: index === 0 ? 'Ada Lovelace' : `Participante ${index + 1}`,
      personEmail: `participante-${index + 1}@cacic.dev.br`,
      personPhone: '18999999999',
      amountPaid: 12000,
      paymentTier: 'Estudante',
      subscriptionFlow: index % 2 === 0 ? 'RANKED_VOTING' : 'REGULAR',
      desiredCourses: 1,
      desiredLectures: 1,
      desiredUncategorized: 0,
      subscriptionStatus: 'RECEIPT_UNDER_REVIEW',
      subscriptionUpdatedAt: '2026-05-20T15:30:00.000Z',
      receipt: {
        id: `receipt-${index + 1}`,
        fileName: 'comprovante.png',
        mimeType: 'image/png',
        sizeBytes: 240000,
        uploadedAt: '2026-05-20T14:30:00.000Z',
        expiresAt: '2026-05-27T14:30:00.000Z',
        imageUrl:
          'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200" viewBox="0 0 900 1200"><rect width="900" height="1200" fill="%23f7f2ec"/><rect x="90" y="90" width="720" height="1020" rx="18" fill="white" stroke="%23988f86"/><text x="450" y="180" text-anchor="middle" font-family="Arial" font-size="42" fill="%23231f20">Comprovante</text><text x="140" y="300" font-family="Arial" font-size="30" fill="%23231f20">FUNDACTE</text><text x="140" y="360" font-family="Arial" font-size="26" fill="%235f5a55">Valor: R$ 120,00</text><text x="140" y="420" font-family="Arial" font-size="26" fill="%235f5a55">Nome do participante</text></svg>',
        processingStatus: 'PROCESSED',
        ocrText: 'Comprovante Semana da Computação Valor R$ 120,00',
        amountMatched: true,
        matchedAmountText: 'R$ 120,00',
        nameMatched: true,
        matchedNameText: index === 0 ? 'Ada Lovelace' : `Participante ${index + 1}`,
      },
      events: [
        {
          id: 'event-angular',
          name: 'Arquitetura Angular',
          emoji: '💻',
          type: 'MINICURSO',
          startDate: '2026-06-02T12:00:00.000Z',
          endDate: '2026-06-02T15:00:00.000Z',
          locationDescription: 'Lab 3',
          slots: 40,
          slotsAvailable: 8,
          eventGroupId: 'group-front',
          eventGroupName: 'Trilha Frontend',
          preferenceOrder: 1,
          autoSubscribe: false,
          selectedForConfirmation: true,
          hasScheduleConflict: false,
          hasNoSlots: false,
        },
        {
          id: 'event-graphql',
          name: 'GraphQL com NestJS',
          emoji: '🚀',
          type: 'PALESTRA',
          startDate: '2026-06-03T13:00:00.000Z',
          endDate: '2026-06-03T14:00:00.000Z',
          locationDescription: 'Auditório',
          slots: 120,
          slotsAvailable: 0,
          eventGroupId: 'group-back',
          eventGroupName: 'Trilha Backend',
          preferenceOrder: 2,
          autoSubscribe: false,
          selectedForConfirmation: true,
          hasScheduleConflict: false,
          hasNoSlots: true,
        },
      ],
    })),
  };
}
