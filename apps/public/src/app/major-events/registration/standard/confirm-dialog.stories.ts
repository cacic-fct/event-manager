import type { Meta, StoryObj } from '@storybook/angular';
import { applicationConfig } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { publicStoryDate } from '../../../testing/public-event-story-fixtures';
import { ConfirmSubscriptionDialog } from './confirm-dialog';

const meta: Meta<ConfirmSubscriptionDialog> = {
  component: ConfirmSubscriptionDialog,
  title: 'CACiC Eventos/Major Events/Registration/Standard/Confirmation Dialog',
  tags: ['autodocs'],
  decorators: [
    applicationConfig({
      providers: [
        {
          provide: MAT_DIALOG_DATA,
          useValue: {
            majorEvent: {
              id: 'major-1',
              name: 'SECOMPP',
              emoji: '🎓',
              startDate: publicStoryDate(1, 9),
              endDate: publicStoryDate(5, 18),
              requiresImageLicenseAgreement: true,
            },
            events: [
              {
                id: 'event-1',
                name: 'Minicurso de Angular',
                emoji: '🧩',
                type: 'MINICURSO',
                startDate: publicStoryDate(1, 9),
                endDate: publicStoryDate(1, 12),
              },
            ],
            forms: [
              {
                form: {
                  id: 'form-1',
                  name: 'Camiseta',
                  description: 'Dados para retirada de camiseta.',
                  elementsJson: JSON.stringify([
                    {
                      id: 'shirt',
                      type: 'singleChoice',
                      title: 'Tamanho da camiseta',
                      required: true,
                      options: [
                        { id: 'p', label: 'P' },
                        { id: 'm', label: 'M' },
                        { id: 'g', label: 'G' },
                      ],
                    },
                  ]),
                  sigilo: 'SECRET',
                  responseMode: 'ONE_PER_TARGET',
                  resultsPublic: false,
                  resultsLive: false,
                  allowResponseEdits: false,
                  publicationState: 'PUBLISHED',
                  links: [],
                  responseCount: 0,
                  createdAt: publicStoryDate(-2),
                  updatedAt: publicStoryDate(-2),
                },
                targetType: 'MAJOR_EVENT',
                targetId: 'major-1',
                targetName: 'SECOMPP',
                linkId: 'link-1',
                requiredInSubscriptionFlow: true,
                enforceRequiredAnswers: true,
                initialAnswers: [],
                submitted: false,
                editable: true,
              },
            ],
            imageLicenseAgreement: {
              required: true,
              accepted: false,
            },
          },
        },
        {
          provide: MatDialogRef,
          useValue: {
            close: () => undefined,
          },
        },
      ],
    }),
  ],
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
  },
};

export default meta;

type Story = StoryObj<ConfirmSubscriptionDialog>;

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

export const Playground: Story = {
  args: {},
  globals: { theme: 'light', network: 'online' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await exerciseStory(canvasElement);
    await expect(canvas.getByRole('button', { name: 'Inscrever-se' })).toBeDisabled();
  },
};

export const RequiredAnswersCompleted: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('radio', { name: 'M' }));
    await userEvent.click(canvas.getByRole('checkbox', { name: /contrato de licença de uso de imagem/i }));
    await expect(canvas.getByRole('button', { name: 'Inscrever-se' })).toBeEnabled();
  },
};

export const MobileDarkReducedMotion: Story = {
  globals: { theme: 'dark', motion: 'reduced' },
  parameters: { viewport: { defaultViewport: 'mobile' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: 'Confirmar inscrição' })).toBeVisible();
    await expect(canvas.getByText('É necessário concordar com o contrato para continuar.')).toBeVisible();
  },
};
