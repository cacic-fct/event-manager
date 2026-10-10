import type { Meta, StoryObj } from '@storybook/angular';
import { expect, within } from 'storybook/test';
import { LivestreamEmbedComponent } from './livestream-embed.component';

interface LivestreamStoryArgs {
  provider: 'YOUTUBE' | 'TWITCH' | 'GENERAL';
  value: string;
  title: string;
}

const meta: Meta<LivestreamStoryArgs> = {
  component: LivestreamEmbedComponent,
  title: 'CACiC Eventos/Shared/Media/Livestream Embed',
  tags: ['autodocs'],
  args: {
    provider: 'YOUTUBE',
    value: 'storybook-livestream',
    title: 'Transmissão da partida',
  },
  argTypes: {
    provider: { control: 'select', options: ['YOUTUBE', 'TWITCH', 'GENERAL'] },
    value: { control: 'text' },
    title: { control: 'text' },
  },
};

export default meta;
type Story = StoryObj<LivestreamStoryArgs>;

export const Playground: Story = {};

export const YouTube: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const frame = await canvas.findByTitle('Transmissão da partida');
    await expect(frame).toHaveAttribute('src', expect.stringContaining('youtube-nocookie.com/embed/'));
    await expect(canvas.getByRole('link', { name: /Abrir no YouTube/ })).toHaveAttribute(
      'href',
      'https://www.youtube.com/watch?v=storybook-livestream',
    );
  },
};

export const Twitch: Story = {
  args: { provider: 'TWITCH', value: 'cacic' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const frame = await canvas.findByTitle('Transmissão da partida');
    await expect(frame).toHaveAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups-to-escape-sandbox');
    await expect(canvas.getByRole('link', { name: /Abrir na Twitch/ })).toHaveAttribute(
      'href',
      'https://www.twitch.tv/cacic',
    );
  },
  globals: { theme: 'dark', motion: 'reduced' },
};

export const TwitchOnMobile: Story = {
  args: { provider: 'TWITCH', value: 'cacic' },
  parameters: { viewport: { defaultViewport: 'mobile' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Em telas estreitas, abra a transmissão na Twitch.')).toBeVisible();
    await expect(canvas.getByRole('link', { name: /Abrir na Twitch/ })).toBeVisible();
  },
};

export const ExternalStream: Story = {
  args: { provider: 'GENERAL', value: 'https://stream.example.test/live' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('link', { name: /Abrir transmissão/ })).toHaveAttribute(
      'href',
      'https://stream.example.test/live',
    );
    await expect(canvas.queryByTitle('Transmissão da partida')).toBeNull();
  },
};
