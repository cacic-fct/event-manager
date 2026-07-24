import { AuthService, MailtoService } from '@cacic-fct/shared-angular';
import type { Meta, StoryObj } from '@storybook/angular';
import { applicationConfig } from '@storybook/angular';
import { expect, fn, userEvent, within } from 'storybook/test';
import { Help } from './help';

const openMailClient = fn();

const meta: Meta<Help> = {
  component: Help,
  title: 'Public/Help/Help',
  tags: ['autodocs'],
  decorators: [
    applicationConfig({
      providers: [
        { provide: MailtoService, useValue: { open: openMailClient } },
        {
          provide: AuthService,
          useValue: {
            user: () => ({ sub: 'storybook-user' }),
          },
        },
      ],
    }),
  ],
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

type Story = StoryObj<Help>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('link', { name: /Documentação e manual de uso/ })).toBeVisible();
    await userEvent.click(canvas.getByRole('link', { name: /Suporte ao usuário/ }));
    await expect(openMailClient).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'fctapp@googlegroups.com',
        body: expect.stringContaining('storybook-user'),
      }),
    );
  },
};
