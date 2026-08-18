import type { Meta, StoryObj } from '@storybook/angular';
import { HttpResponse, http } from 'msw';
import { expect, within } from 'storybook/test';
import { TwemojiComponent } from './twemoji.component';

const meta: Meta<TwemojiComponent> = {
  component: TwemojiComponent,
  title: 'CACiC Eventos/Shared/Content/Twemoji',
  tags: ['autodocs'],
  args: { emoji: '🏆' },
  argTypes: {
    emoji: { control: 'text', description: 'Emoji Unicode renderizado com o conjunto Twemoji.' },
  },
  parameters: {
    layout: 'centered',
    msw: {
      handlers: {
        rest: [
          http.get('https://cdn.jsdelivr.net/gh/jdecked/twemoji@latest/assets/svg/:asset', () =>
            HttpResponse.text(
              '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36"><circle cx="18" cy="18" r="16" fill="#ffcc4d"/></svg>',
              { headers: { 'Content-Type': 'image/svg+xml' } },
            ),
          ),
        ],
      },
    },
  },
};

export default meta;
type Story = StoryObj<TwemojiComponent>;

export const Playground: Story = {
  play: async ({ canvasElement }) => {
    const emoji = within(canvasElement).getByRole('img', { name: '🏆' });
    await expect(emoji).toBeVisible();
    await expect(emoji).toHaveAttribute('src', expect.stringContaining('/1f3c6.svg'));
  },
};

export const CompoundEmoji: Story = {
  args: {
    emoji: '🧑🏽‍💻',
  },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('img', { name: '🧑🏽‍💻' })).toBeVisible();
  },
};

export const EmptyValueFallback: Story = {
  args: {
    emoji: '',
  },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('img', { name: 'emoji' })).toBeVisible();
  },
};

export const DarkReducedMotion: Story = {
  args: {
    emoji: '🌙',
  },
  globals: { theme: 'dark', motion: 'reduced' },
};
