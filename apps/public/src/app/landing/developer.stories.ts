import type { Meta, StoryObj } from '@storybook/angular';
import { expect, within } from 'storybook/test';
import { Developer } from './developer';

const meta: Meta<Developer> = {
  component: Developer,
  title: 'CACiC Eventos/Landing/Developer',
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
  },
};

export default meta;

type Story = StoryObj<Developer>;

export const Playground: Story = {
  globals: { theme: 'light' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('link', { name: 'Documentação' })).toBeVisible();
    const graphqlExample = canvasElement.querySelector<HTMLElement>('.developer-api-query code');
    if (!graphqlExample) {
      throw new Error('O exemplo de consulta GraphQL não foi renderizado.');
    }
    await expect(graphqlExample).toHaveTextContent('publicEvents(take: 3)');
    await expect(canvas.getByRole('region', { name: 'Exemplo em curl' })).toHaveTextContent(
      "curl --request POST 'https://eventos.cacic.com.br/api/graphql'",
    );
    await expect(canvas.getByRole('button', { name: 'Copiar exemplo em curl' })).toBeVisible();
  },
};

export const Dark: Story = {
  globals: { theme: 'dark', motion: 'reduced' },
};

export const MobileCodeSample: Story = {
  parameters: { viewport: { defaultViewport: 'mobile' } },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('button', { name: 'Copiar exemplo em curl' })).toBeVisible();
  },
};
