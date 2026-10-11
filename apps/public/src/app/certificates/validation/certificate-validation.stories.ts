import { ActivatedRoute, convertToParamMap } from '@angular/router';
import type { Meta, StoryObj } from '@storybook/angular';
import { applicationConfig } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import { of } from 'rxjs';
import { CertificateValidation } from './certificate-validation';

const meta: Meta<CertificateValidation> = {
  component: CertificateValidation,
  title: 'Public/Support/Certificate Validation',
  tags: ['autodocs'],
  parameters: {
    controls: { disable: true },
    docs: {
      description: {
        component: 'Certificate validation examples for event, lecturer, disabled, and offline states.',
      },
    },
    layout: 'fullscreen',
    a11y: { test: 'error' },
  },
};

export default meta;

type Story = StoryObj<CertificateValidation>;

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
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};

export const StandaloneWithoutActivities: Story = {
  args: {},
  decorators: [routeDecorator('certificate-standalone')],
  globals: { network: 'online' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Atividade complementar')).toBeVisible();
    await expect(await canvas.findByText('Texto do verso')).toBeVisible();
    await expect(canvas.queryByText('Atividades')).toBeNull();
  },
};

export const LecturerCertificate: Story = {
  args: {},
  decorators: [routeDecorator('certificate-lecturer')],
  globals: { network: 'online' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Palestrante')).toBeVisible();
    await expect(await canvas.findByText('Atividades')).toBeVisible();
  },
};

export const DisabledCertificate: Story = {
  args: {},
  decorators: [routeDecorator(null, 'certificate-disabled')],
  globals: { network: 'online' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('textbox', { name: 'Código do certificado' })).toHaveValue('certificate-disabled');
    await expect(canvas.getByRole('button', { name: 'Validar' })).toBeDisabled();
  },
};

export const OfflineFallback: Story = {
  args: {},
  globals: { network: 'offline' },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};

function routeDecorator(certificateId: string | null, invalidId?: string) {
  const routeParams = certificateId ? { certificateId } : {};
  const queryParams = certificateId ? { certificateId } : invalidId ? { invalidId } : {};
  return applicationConfig({
    providers: [
      {
        provide: ActivatedRoute,
        useValue: {
          paramMap: of(convertToParamMap(routeParams)),
          queryParamMap: of(convertToParamMap(queryParams)),
          snapshot: {
            paramMap: convertToParamMap(routeParams),
            queryParamMap: convertToParamMap(queryParams),
          },
        },
      },
    ],
  });
}
