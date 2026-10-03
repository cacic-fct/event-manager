import { AuthService } from '@cacic-fct/shared-angular';
import type { Meta, StoryObj } from '@storybook/angular';
import { applicationConfig } from '@storybook/angular';
import { expect, within } from 'storybook/test';
import { Help } from './help';

let activeUserId: string | null = 'storybook-user';

interface HelpStoryArgs {
  userId: string | null;
}

const meta: Meta<HelpStoryArgs> = {
  component: Help,
  title: 'CACiC Eventos/Help/Page',
  tags: ['autodocs'],
  decorators: [
    applicationConfig({
      providers: [
        {
          provide: AuthService,
          useValue: {
            user: () => (activeUserId ? { sub: activeUserId } : undefined),
          },
        },
      ],
    }),
  ],
  args: { userId: 'storybook-user' },
  argTypes: {
    userId: {
      control: 'text',
      description: 'Identificador incluído no diagnóstico do pedido de suporte; vazio representa visitante anônimo.',
    },
  },
  render: (args) => {
    activeUserId = args.userId?.trim() || null;
    return { props: {} };
  },
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: 'Central de ajuda com acesso à documentação, suporte identificado e canal público de bugs.',
      },
    },
  },
};

export default meta;

type Story = StoryObj<HelpStoryArgs>;

export const Playground: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('link', { name: /Documentação e manual de uso/ })).toBeVisible();
    const support = canvas.getByRole('link', { name: /Suporte ao usuário/ });
    await expect(support.getAttribute('href')).toMatch(/^mailto:fctapp@googlegroups.com\?/);
    await expect(decodeURIComponent(support.getAttribute('href') ?? '')).toContain('storybook-user');
  },
};

export const AnonymousSupport: Story = {
  args: { userId: null },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const support = canvas.getByRole('link', { name: /Suporte ao usuário/ });
    await expect(decodeURIComponent(support.getAttribute('href') ?? '')).toContain('userId: Desconhecido');
  },
};

export const MobileDarkReducedMotion: Story = {
  args: { userId: 'participante-mobile' },
  globals: { theme: 'dark', motion: 'reduced' },
  parameters: { viewport: { defaultViewport: 'mobile' } },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('link', { name: /Documentação e manual de uso/ })).toBeVisible();
  },
};
