import type { Meta, StoryObj } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import {
  emptyCertificateTemplatesHandler,
  failedCertificateTemplatesHandler,
} from '../../../.storybook/storybook-mocks';
import { CertificatesPageComponent } from './certificates-page.component';

const meta: Meta<CertificatesPageComponent> = {
  component: CertificatesPageComponent,
  title: 'CACiC Eventos/Workspace/Tabs/Certificates/Workspace Certificates Tab',
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
  },
};

export default meta;

type Story = StoryObj<CertificatesPageComponent>;

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
  globals: { theme: 'light' },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};

export const DarkReducedMotion: Story = {
  ...Playground,
  globals: { ...Playground.globals, theme: 'dark', motion: 'reduced' },
};

export const CompactIssuanceWorkspace: Story = {
  ...Playground,
  name: 'Emissão em workspace compacto',
  parameters: { viewport: { defaultViewport: 'tablet' } },
};

export const NoRegisteredTemplates: Story = {
  ...Playground,
  name: 'Sem templates registrados',
  parameters: {
    msw: { handlers: [emptyCertificateTemplatesHandler] },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const targets = await canvas.findAllByRole('listitem');
    await userEvent.click(targets[0]);
    await expect(
      await canvas.findByText(
        'Nenhum modelo de certificado está disponível. Verifique o cadastro dos arquivos do ambiente.',
      ),
    ).toBeVisible();
  },
};

export const TemplateRegistryUnavailable: Story = {
  ...Playground,
  name: 'Falha ao carregar modelos',
  parameters: {
    msw: { handlers: [failedCertificateTemplatesHandler] },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const targets = await canvas.findAllByRole('listitem');
    await userEvent.click(targets[0]);
    await expect(await canvas.findByRole('alert')).toHaveTextContent(
      'Não foi possível carregar os modelos de certificado.',
    );
    await expect(canvas.getByRole('button', { name: 'Tentar novamente' })).toBeVisible();
  },
};
