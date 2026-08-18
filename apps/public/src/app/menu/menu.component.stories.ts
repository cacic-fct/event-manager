import { AuthService } from '@cacic-fct/shared-angular';
import type { Meta, StoryObj } from '@storybook/angular';
import { applicationConfig } from '@storybook/angular';
import { NEVER, of, throwError } from 'rxjs';
import { expect, userEvent, within } from 'storybook/test';
import { DefaultRedirectApiService } from '../landing/default-redirect-api.service';
import { MenuComponent } from './menu.component';

interface MenuStoryArgs {
  authenticated: boolean;
  displayName: string;
  picture: string;
  sportsRedirect: 'operate' | 'view' | 'none' | 'loading' | 'error';
}

const defaultArgs: MenuStoryArgs = {
  authenticated: true,
  displayName: 'Ana Beatriz de Souza',
  picture: '',
  sportsRedirect: 'none',
};

let activeArgs = defaultArgs;

const meta: Meta<MenuStoryArgs> = {
  component: MenuComponent,
  title: 'CACiC Eventos/Menu/Page',
  tags: ['autodocs'],
  args: defaultArgs,
  argTypes: {
    authenticated: { control: 'boolean' },
    displayName: { control: 'text' },
    picture: { control: 'text' },
    sportsRedirect: { control: 'select', options: ['operate', 'view', 'none', 'loading', 'error'] },
  },
  decorators: [
    applicationConfig({
      providers: [
        {
          provide: AuthService,
          useValue: {
            isAuthenticated: () => activeArgs.authenticated,
            user: () =>
              activeArgs.authenticated
                ? { claims: { name: activeArgs.displayName, picture: activeArgs.picture || null } }
                : null,
            evaluatePermissions: () => of([]),
          },
        },
        {
          provide: DefaultRedirectApiService,
          useValue: {
            getCurrentUserSportsAutoroute: () => {
              if (activeArgs.sportsRedirect === 'loading') return NEVER;
              if (activeArgs.sportsRedirect === 'error') return throwError(() => new Error('Atalho indisponível.'));
              if (activeArgs.sportsRedirect === 'none') return of(null);
              return of({
                matchId: 'match-story',
                mode: activeArgs.sportsRedirect === 'operate' ? 'OPERATE' : 'VIEW',
              });
            },
          },
        },
      ],
    }),
  ],
  render: (args) => {
    activeArgs = { ...defaultArgs, ...args };
    return { props: {} };
  },
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
  },
};

export default meta;

type Story = StoryObj<MenuStoryArgs>;

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
  globals: { theme: 'dark', network: 'online', serviceWorker: 'disabled', motion: 'reduced' },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};

export const SportsAccessPoint: Story = {
  name: 'Atalho para operações esportivas',
  args: { sportsRedirect: 'operate' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const link = await canvas.findByRole('link', { name: /Minha próxima partida/ });
    await expect(link).toHaveAttribute('href', '/sports');
    await expect(canvas.getByText('Atleta, equipe e arbitragem')).toBeVisible();
  },
};

export const WithoutSportsRedirect: Story = {
  name: 'Sem atalho esportivo válido',
  args: { sportsRedirect: 'none' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole('link', { name: /Minha próxima partida/ })).not.toBeInTheDocument();
  },
};

export const SportsViewer: Story = {
  args: { sportsRedirect: 'view' },
};

export const Anonymous: Story = {
  args: { authenticated: false, sportsRedirect: 'none' },
};

export const SportsRedirectLoading: Story = {
  args: { sportsRedirect: 'loading' },
};

export const SportsRedirectError: Story = {
  args: { sportsRedirect: 'error' },
  globals: { theme: 'dark', network: 'online', motion: 'reduced' },
};

export const LongProfileNameMobile: Story = {
  args: { displayName: 'Ana Beatriz de Souza Albuquerque dos Santos e Oliveira', sportsRedirect: 'operate' },
  parameters: { viewport: { defaultViewport: 'mobile' } },
  globals: { theme: 'dark', network: 'online', serviceWorker: 'enabled', motion: 'reduced' },
};
