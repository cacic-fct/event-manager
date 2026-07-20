import type { Meta, StoryObj } from '@storybook/angular';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { applicationConfig } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import { CertificateDialog } from './certificate-dialog';

const meta: Meta<CertificateDialog> = {
  component: CertificateDialog,
  title: 'Public/Profile/Attendances/Certificate Dialog/Certificate Dialog',
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
  },
};

export default meta;

type Story = StoryObj<CertificateDialog>;

const exerciseStory = async (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement);
  await userEvent.tab();
  const buttons = canvas.queryAllByRole('button');
  const enabledButton = buttons.find((button) => !button.hasAttribute('disabled') && button.getAttribute('aria-disabled') !== 'true');
  if (enabledButton) {
    await userEvent.hover(enabledButton);
    await expect(enabledButton).toBeVisible();
  }
  const links = canvas.queryAllByRole('link');
  if (links[0]) {
    await expect(links[0]).toBeVisible();
  }
};

export const Online: Story = {
  args: {},
  globals: { theme: 'light', network: 'online' },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};

export const OfflineFallback: Story = {
  args: {},
  globals: { theme: 'light', network: 'offline' },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};

export const StandaloneFolder: Story = {
  args: {},
  decorators: [
    applicationConfig({
      providers: [
        {
          provide: MAT_DIALOG_DATA,
          useValue: {
            title: 'Atividades complementares',
            certificates: [
              {
                id: 'standalone-certificate-1',
                configId: 'standalone-config-1',
                issuedAt: '2026-07-04T12:00:00.000Z',
                config: {
                  id: 'standalone-config-1',
                  name: 'Certificado avulso',
                  scope: 'OTHER',
                  certificateText: 'Certificamos a participação.',
                  certificateTemplate: {
                    id: 'template-1',
                    name: 'Modelo CACiC',
                    version: 1,
                  },
                },
                certificateTemplate: {
                  id: 'template-1',
                  name: 'Modelo CACiC',
                  version: 1,
                },
              },
            ],
          },
        },
      ],
    }),
  ],
  globals: { theme: 'light', network: 'online' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Certificado avulso')).toBeVisible();
    await exerciseStory(canvasElement);
  },
};
