import { computed, signal } from '@angular/core';
import { AuthService } from '@cacic-fct/shared-angular';
import type { Meta, StoryObj } from '@storybook/angular';
import { applicationConfig } from '@storybook/angular';
import { expect, within } from 'storybook/test';
import { Help } from './help';

const activeUserId = signal<string | null>('storybook-user');

interface HelpStoryArgs {
  userId: string | null;
}

const meta: Meta<HelpStoryArgs> = {
  component: Help,
  title: 'Public/Support/Help',
  tags: ['autodocs'],
  decorators: [
    applicationConfig({
      providers: [
        {
          provide: AuthService,
          useValue: {
            user: computed(() => {
              const userId = activeUserId();
              return userId ? { sub: userId } : undefined;
            }),
          },
        },
      ],
    }),
  ],
  args: { userId: 'storybook-user' },
  argTypes: {
    userId: {
      control: 'text',
      name: 'User ID',
      description: 'Adds an identifier to support diagnostics. Leave empty to represent an anonymous visitor.',
    },
  },
  render: (args) => {
    activeUserId.set(args.userId?.trim() || null);
    return { props: {} };
  },
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: 'Help center with documentation, identified support, and a public bug-report channel.',
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
