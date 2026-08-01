import { signal } from '@angular/core';
import { AuthService } from '@cacic-fct/shared-angular';
import type { Meta, StoryObj } from '@storybook/angular';
import { applicationConfig } from '@storybook/angular';
import { of } from 'rxjs';
import { expect, userEvent, within } from 'storybook/test';
import { DefaultRedirectApiService } from '../landing/default-redirect-api.service';
import { MenuComponent } from './menu.component';

const meta: Meta<MenuComponent> = {
  component: MenuComponent,
  title: 'Public/Tabs/Menu/Menu',
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
  },
};

export default meta;

type Story = StoryObj<MenuComponent>;

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

export const ServiceWorkerReady: Story = {
  args: {},
  globals: { theme: 'light', network: 'online', serviceWorker: 'enabled' },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};

export const OfflineInstalled: Story = {
  args: {},
  globals: { theme: 'light', network: 'offline', serviceWorker: 'enabled' },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};

export const NoServiceWorker: Story = {
  args: {},
  globals: { theme: 'light', network: 'online', serviceWorker: 'disabled' },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};

export const SportsAccessPoint: Story = {
  name: 'Atalho para operações esportivas',
  decorators: [
    applicationConfig({
      providers: [
        {
          provide: AuthService,
          useValue: {
            isAuthenticated: signal(true),
            user: signal({
              claims: { name: 'Ana Beatriz de Souza', picture: null },
            }),
            evaluatePermissions: () => of([]),
          },
        },
        {
          provide: DefaultRedirectApiService,
          useValue: {
            getCurrentUserSportsAutoroute: () => of({ matchId: 'match-story', mode: 'OPERATE' }),
          },
        },
      ],
    }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const link = await canvas.findByRole('link', { name: /Minha próxima partida/ });
    await expect(link).toHaveAttribute('href', '/sports');
    await expect(canvas.getByText('Atleta, equipe e arbitragem')).toBeVisible();
  },
};

export const WithoutSportsRedirect: Story = {
  name: 'Sem atalho esportivo válido',
  decorators: [
    applicationConfig({
      providers: [
        {
          provide: AuthService,
          useValue: {
            isAuthenticated: signal(true),
            user: signal({
              claims: { name: 'Ana Beatriz de Souza', picture: null },
            }),
            evaluatePermissions: () => of([]),
          },
        },
        {
          provide: DefaultRedirectApiService,
          useValue: {
            getCurrentUserSportsAutoroute: () => of(null),
          },
        },
      ],
    }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole('link', { name: /Minha próxima partida/ })).not.toBeInTheDocument();
  },
};
