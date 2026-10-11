import { withScenarioControls } from '@cacic-fct/shared-angular/storybook';
import { AuthService } from '@cacic-fct/shared-angular';
import type { Meta, StoryObj } from '@storybook/angular';
import { applicationConfig } from '@storybook/angular';
import { NEVER, of, throwError } from 'rxjs';
import { expect, userEvent, within } from 'storybook/test';
import { AttendanceCollectionApiService } from '../attendance/collection/attendance-collection-api.service';
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
  title: 'Public/Layout/Menu',
  tags: ['autodocs'],
  args: defaultArgs,
  argTypes: {
    authenticated: { control: 'boolean' },
    displayName: { control: 'text' },
    picture: { control: 'text' },
    sportsRedirect: { control: 'select', options: ['operate', 'view', 'none', 'loading', 'error'] },
  },
  decorators: [
    withScenarioControls<MenuStoryArgs>(),
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
        {
          provide: AttendanceCollectionApiService,
          useValue: { listCollectionEvents: () => of([]) },
        },
      ],
    }),
  ],
  render: (args) => {
    activeArgs = { ...defaultArgs, ...args };
    return { props: {}, template: '<app-menu class="component"></app-menu>' };
  },
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'error' },
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
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};

export const OfflineInstalled: Story = {
  args: {},
  globals: { network: 'offline', serviceWorker: 'enabled' },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};

export const NoServiceWorker: Story = {
  args: {},
  globals: { network: 'online', serviceWorker: 'disabled' },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};

export const SportsAccessPoint: Story = {
  args: { sportsRedirect: 'operate' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const link = await canvas.findByRole('link', { name: /Minha próxima partida/ });
    await expect(new URL(link.getAttribute('href') ?? '', window.location.origin).pathname).toBe('/sports');
    await expect(canvas.getByText('Atleta, equipe e arbitragem')).toBeVisible();
  },
};

export const WithoutSportsRedirect: Story = {
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
  globals: { network: 'online' },
};

export const LongProfileName: Story = {
  args: { displayName: 'Ana Beatriz de Souza Albuquerque dos Santos e Oliveira', sportsRedirect: 'operate' },
  globals: { network: 'online', serviceWorker: 'enabled' },
};
