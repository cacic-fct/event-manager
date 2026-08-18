import type { Meta, StoryObj } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import {
  createCertificateTemplatesStoryHandler,
  type CertificateTemplatesStoryOptions,
} from '../../../.storybook/storybook-mocks';
import { CertificatesPageComponent } from './certificates-page.component';

interface CertificatesPageStoryArgs extends CertificateTemplatesStoryOptions {
  longContent: boolean;
}

const defaultArgs: CertificatesPageStoryArgs = {
  state: 'ready',
  count: 6,
  latencyMs: 120,
  namePrefix: 'Modelo de certificado',
  inactiveEvery: 4,
  longContent: false,
};

let activeArgs = defaultArgs;

const meta: Meta<CertificatesPageStoryArgs> = {
  component: CertificatesPageComponent,
  title: 'CACiC Eventos/Workspace/Tabs/Certificates/Workspace Certificates Tab',
  tags: ['autodocs'],
  args: defaultArgs,
  argTypes: {
    state: { control: 'inline-radio', options: ['ready', 'empty', 'loading', 'error'] },
    count: { control: { type: 'range', min: 0, max: 30, step: 1 } },
    latencyMs: { control: { type: 'range', min: 0, max: 2_000, step: 100 } },
    namePrefix: { control: 'text' },
    inactiveEvery: { control: { type: 'range', min: 0, max: 10, step: 1 } },
    longContent: { control: 'boolean' },
  },
  render: (args) => {
    activeArgs = {
      ...defaultArgs,
      ...args,
      namePrefix: args.longContent
        ? 'Modelo institucional interdisciplinar para certificados acadêmicos, culturais e esportivos'
        : args.namePrefix,
    };
    return { props: {} };
  },
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
    msw: { handlers: { graphql: [createCertificateTemplatesStoryHandler(() => activeArgs)] } },
  },
};

export default meta;

type Story = StoryObj<CertificatesPageStoryArgs>;

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
  args: { state: 'empty', count: 0, latencyMs: 0 },
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
  args: { state: 'error', latencyMs: 0 },
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

export const DenseTemplateRegistry: Story = {
  args: { count: 30, inactiveEvery: 3, latencyMs: 0 },
};

export const SlowTemplateRegistry: Story = {
  args: { count: 12, latencyMs: 1_500 },
};

export const LoadingTemplates: Story = {
  args: { state: 'loading', latencyMs: 0 },
};

export const LongTemplateNamesMobile: Story = {
  args: { count: 12, longContent: true, latencyMs: 0 },
  parameters: { viewport: { defaultViewport: 'mobile' } },
  globals: { theme: 'dark', motion: 'reduced' },
};
