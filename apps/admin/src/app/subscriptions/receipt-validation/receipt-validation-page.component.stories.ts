import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { applicationConfig, type Meta, type StoryObj } from '@storybook/angular';
import { NEVER, delay, of, throwError } from 'rxjs';
import { expect, userEvent, within } from 'storybook/test';
import { ReceiptValidationApiService, type ReceiptValidationQueue } from '../../graphql/receipt-validation-api.service';
import { PermissionsService } from '../../permissions/permissions.service';
import { adminFixtureDateFromNow } from '../../testing/admin-entity-fixtures';
import { ReceiptValidationPageComponent } from './receipt-validation-page.component';

interface ReceiptValidationStoryArgs {
  apiState: 'ready' | 'loading' | 'error';
  queueCount: number;
  latencyMs: number;
  frozenEvery: number;
  conflictEvery: number;
  amountPaid: number;
  ocrMatch: 'full' | 'amount-only' | 'name-only' | 'none';
  canMutate: boolean;
  longContent: boolean;
}

const defaultArgs: ReceiptValidationStoryArgs = {
  apiState: 'ready',
  queueCount: 2,
  latencyMs: 120,
  frozenEvery: 0,
  conflictEvery: 2,
  amountPaid: 12_000,
  ocrMatch: 'full',
  canMutate: true,
  longContent: false,
};

const meta: Meta<ReceiptValidationStoryArgs> = {
  component: ReceiptValidationPageComponent,
  title: 'CACiC Eventos/Workspace/Tabs/Subscriptions/Receipt Validation/Workspace Receipt Validation',
  tags: ['autodocs'],
  args: defaultArgs,
  argTypes: {
    apiState: { control: 'inline-radio', options: ['ready', 'loading', 'error'] },
    queueCount: { control: { type: 'range', min: 0, max: 50, step: 1 } },
    latencyMs: { control: { type: 'range', min: 0, max: 2_000, step: 100 } },
    frozenEvery: { control: { type: 'range', min: 0, max: 10, step: 1 } },
    conflictEvery: { control: { type: 'range', min: 0, max: 10, step: 1 } },
    amountPaid: { control: { type: 'range', min: 0, max: 1_000_000, step: 500 } },
    ocrMatch: { control: 'select', options: ['full', 'amount-only', 'name-only', 'none'] },
    canMutate: { control: 'boolean' },
    longContent: { control: 'boolean' },
  },
  decorators: [
    (story, context) =>
      applicationConfig({
        providers: createReceiptValidationStoryProviders(buildQueue(context.args), context.args),
      })(story, context),
  ],
  parameters: { layout: 'fullscreen', a11y: { test: 'todo' } },
};

export default meta;
type Story = StoryObj<ReceiptValidationStoryArgs>;

const exerciseStory = async (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement);
  await userEvent.tab();
  const enabledButton = canvas
    .queryAllByRole('button')
    .find((button) => !button.hasAttribute('disabled') && button.getAttribute('aria-disabled') !== 'true');
  if (enabledButton) await userEvent.hover(enabledButton);
};

export const Playground: Story = {
  globals: { theme: 'light' },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};

export const EmptyQueue: Story = {
  args: { queueCount: 0, latencyMs: 0 },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText('Nenhum comprovante pendente')).toBeVisible();
  },
};

export const FrozenQueue: Story = {
  args: { queueCount: 4, frozenEvery: 1, latencyMs: 0 },
  globals: { theme: 'dark', motion: 'reduced' },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByRole('button', { name: 'Aprovar comprovante' })).toBeNull();
  },
};

export const DenseQueue: Story = {
  args: { queueCount: 50, conflictEvery: 3, frozenEvery: 5, latencyMs: 0 },
};

export const Loading: Story = {
  args: { apiState: 'loading', latencyMs: 0 },
};

export const LoadError: Story = {
  args: { apiState: 'error', latencyMs: 0 },
  globals: { theme: 'dark', motion: 'reduced' },
};

export const OcrMismatch: Story = {
  args: { queueCount: 6, ocrMatch: 'none', amountPaid: 24_500, latencyMs: 0 },
};

export const ReadOnly: Story = {
  args: { canMutate: false, queueCount: 8, latencyMs: 0 },
};

export const LongContentMobile: Story = {
  args: { queueCount: 12, longContent: true, conflictEvery: 2, latencyMs: 0 },
  parameters: { viewport: { defaultViewport: 'mobile' } },
  globals: { theme: 'dark', motion: 'reduced' },
};

function createReceiptValidationStoryProviders(queue: ReceiptValidationQueue, args: ReceiptValidationStoryArgs) {
  const api = {
    watchQueue: () => {
      if (args.apiState === 'loading') return NEVER;
      if (args.apiState === 'error') return throwError(() => new Error('Não foi possível carregar os comprovantes.'));
      return of(queue).pipe(delay(args.latencyMs));
    },
    getQueue: () => of(queue).pipe(delay(args.latencyMs)),
    approve: () => of({ actionId: 'action-approve', item: queue.items[0] }),
    reject: () => of({ actionId: 'action-reject', item: queue.items[0] }),
    undo: () => of(queue.items[0]),
  } satisfies Partial<ReceiptValidationApiService>;

  return [
    provideRouter([]),
    {
      provide: ActivatedRoute,
      useValue: { snapshot: { paramMap: convertToParamMap({ majorEventId: 'major-event-1' }) } },
    },
    { provide: ReceiptValidationApiService, useValue: api },
    {
      provide: PermissionsService,
      useValue: {
        has: () => false,
        hasAny: () => args.canMutate,
        canEdit: () => args.canMutate,
      },
    },
  ];
}

function buildQueue(args: ReceiptValidationStoryArgs): ReceiptValidationQueue {
  const count = Math.max(0, Math.min(50, Math.round(args.queueCount)));
  return {
    pendingCount: count,
    items: Array.from({ length: count }, (_, index) => {
      const frozen = args.frozenEvery > 0 && (index + 1) % Math.round(args.frozenEvery) === 0;
      const conflict = args.conflictEvery > 0 && (index + 1) % Math.round(args.conflictEvery) === 0;
      const personName = args.longContent
        ? `Participante interdisciplinar com cadastro institucional detalhado número ${index + 1}`
        : index === 0
          ? 'Ada Lovelace'
          : `Participante ${index + 1}`;
      return {
        subscriptionId: `subscription-${index + 1}`,
        majorEventId: 'major-event-1',
        majorEventName: args.longContent
          ? 'Semana interdisciplinar universitária de computação, acessibilidade, cultura e esportes'
          : 'Semana da Computação',
        majorEventCreatedAt: adminFixtureDateFromNow(frozen ? -30 : -20),
        majorEventEndDate: adminFixtureDateFromNow(frozen ? -1 : 5, 21),
        personId: `person-${index + 1}`,
        personName,
        personEmail: `participante-${index + 1}@cacic.com.br`,
        personPhone: '18999999999',
        amountPaid: args.amountPaid,
        paymentTier: 'Estudante',
        subscriptionFlow: index % 2 === 0 ? 'RANKED_VOTING' : 'REGULAR',
        desiredCourses: 1,
        desiredLectures: 1,
        desiredUncategorized: 0,
        subscriptionStatus: 'RECEIPT_UNDER_REVIEW',
        subscriptionUpdatedAt: adminFixtureDateFromNow(-1, 15),
        receipt: {
          id: `receipt-${index + 1}`,
          fileName: args.longContent ? `comprovante-institucional-detalhado-${index + 1}.png` : 'comprovante.png',
          mimeType: 'image/png',
          sizeBytes: 240_000 + index * 1_000,
          uploadedAt: adminFixtureDateFromNow(-1, 14),
          expiresAt: adminFixtureDateFromNow(6, 14),
          imageUrl:
            'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200"><rect width="900" height="1200" fill="white"/><text x="100" y="180" font-size="42">Comprovante Storybook</text></svg>',
          processingStatus: 'PROCESSED',
          ocrText: `Comprovante ${personName} Valor R$ ${(args.amountPaid / 100).toFixed(2)}`,
          amountMatched: args.ocrMatch === 'full' || args.ocrMatch === 'amount-only',
          matchedAmountText: `R$ ${(args.amountPaid / 100).toFixed(2)}`,
          nameMatched: args.ocrMatch === 'full' || args.ocrMatch === 'name-only',
          matchedNameText: personName,
        },
        events: [
          {
            id: `event-angular-${index + 1}`,
            name: args.longContent
              ? 'Arquitetura Angular com Signals e acessibilidade em escala'
              : 'Arquitetura Angular',
            emoji: '💻',
            type: 'MINICURSO',
            startDate: adminFixtureDateFromNow(2),
            endDate: adminFixtureDateFromNow(2, 15),
            locationDescription: 'Lab 3',
            slots: 40,
            slotsAvailable: conflict ? 0 : 8,
            eventGroupId: 'group-front',
            eventGroupName: 'Trilha Frontend',
            preferenceOrder: 1,
            autoSubscribe: false,
            selectedForConfirmation: true,
            hasScheduleConflict: conflict,
            hasNoSlots: conflict,
          },
          {
            id: `event-graphql-${index + 1}`,
            name: 'GraphQL com NestJS',
            emoji: '🚀',
            type: 'PALESTRA',
            startDate: adminFixtureDateFromNow(3, 13),
            endDate: adminFixtureDateFromNow(3, 14),
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
      };
    }),
  };
}
