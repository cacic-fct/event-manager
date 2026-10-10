import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '@cacic-fct/shared-angular';
import { applicationConfig, type Meta, type StoryObj } from '@storybook/angular';
import { withScenarioControls } from '@cacic-fct/shared-angular/storybook';
import { expect, fn, userEvent, within } from 'storybook/test';
import { LOGIN_DEVELOPMENT_MODE, LoginPageComponent } from './login-page.component';

interface LoginStoryArgs {
  returnTo: string;
  authenticated: boolean;
  passwordOutcome: 'success' | 'invalid';
  ssoOutcome: 'success' | 'error';
}

const defaultCredentials = {
  email: 'admin@cacic.dev',
  password: 'storybook-password',
};

const invalidEmail = 'endereco-invalido';

const defaultArgs: LoginStoryArgs = {
  returnTo: '/event-workspace',
  authenticated: false,
  passwordOutcome: 'success',
  ssoOutcome: 'success',
};

let activeArgs = defaultArgs;
const navigateByUrl = fn(async (url: string) => Boolean(url));
const passwordLogin = fn((email: string, password: string) => Boolean(email && password));
const ssoLogin = fn((options: { returnTo: string }) => Boolean(options.returnTo));

const meta: Meta<LoginStoryArgs> = {
  component: LoginPageComponent,
  title: 'Admin/Access/Login',
  tags: ['autodocs'],
  args: defaultArgs,
  argTypes: {
    returnTo: { control: 'text' },
    authenticated: { control: 'boolean' },
    passwordOutcome: { control: 'inline-radio', options: ['success', 'invalid'] },
    ssoOutcome: { control: 'inline-radio', options: ['success', 'error'] },
  },
  render: (args) => {
    activeArgs = { ...defaultArgs, ...args };
    return { props: {} };
  },
  decorators: [
    withScenarioControls<LoginStoryArgs>(),
    applicationConfig({
      providers: [
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              queryParamMap: {
                get: (key: string) => (key === 'returnTo' ? activeArgs.returnTo : null),
              },
            },
          },
        },
        { provide: LOGIN_DEVELOPMENT_MODE, useValue: true },
        {
          provide: Router,
          useValue: {
            navigateByUrl,
            setUpLocationChangeListener: () => undefined,
            initialNavigation: () => undefined,
            resetRootComponentType: () => undefined,
            dispose: () => undefined,
          },
        },
        {
          provide: AuthService,
          useValue: {
            isAuthenticated: () => activeArgs.authenticated,
            passwordLogin: (email: string, password: string) => {
              passwordLogin(email, password);
              return activeArgs.passwordOutcome === 'invalid'
                ? Promise.reject(new Error('Credenciais inválidas.'))
                : Promise.resolve();
            },
            login: (options: { returnTo: string }) => {
              ssoLogin(options);
              return activeArgs.ssoOutcome === 'error'
                ? Promise.reject(new Error('SSO indisponível.'))
                : Promise.resolve();
            },
          },
        },
      ],
    }),
  ],
  beforeEach: () => {
    navigateByUrl.mockClear();
    passwordLogin.mockClear();
    ssoLogin.mockClear();
  },
  parameters: {
    docs: {
      description: {
        component: 'Login form states for successful sign-in, invalid credentials, and SSO responses. Use the outcome controls to explore each result.',
      },
    },
    layout: 'fullscreen',
    a11y: { test: 'error' },
  },
};

export default meta;
type Story = StoryObj<LoginStoryArgs>;

async function fillCredentials(
  canvasElement: HTMLElement,
  credentials: { email: string; password: string } = defaultCredentials,
) {
  const canvas = within(canvasElement);
  await userEvent.type(await canvas.findByRole('textbox', { name: 'E-mail' }), credentials.email);
  await userEvent.type(canvas.getByLabelText('Senha'), credentials.password);
  return canvas;
}

export const Playground: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = await fillCredentials(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: /^Entrar$/ }));
    await expect(passwordLogin).toHaveBeenCalledWith(defaultCredentials.email, defaultCredentials.password);
    await expect(navigateByUrl).toHaveBeenCalledWith(args.returnTo);
  },
};

export const InvalidCredentials: Story = {
  args: { passwordOutcome: 'invalid' },
  play: async ({ canvasElement }) => {
    const canvas = await fillCredentials(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: /^Entrar$/ }));
    await expect(await canvas.findByRole('alert')).toHaveTextContent('E-mail ou senha inválidos.');
  },
};

export const InvalidEmail: Story = {
  play: async ({ canvasElement }) => {
    const canvas = await fillCredentials(canvasElement, { ...defaultCredentials, email: invalidEmail });
    await userEvent.tab();
    await expect(await canvas.findByText('Informe um e-mail válido.')).toBeVisible();
    await expect(canvas.getByRole('button', { name: /^Entrar$/ })).toBeDisabled();
  },
};

export const SsoLogin: Story = {
  play: async ({ canvasElement, args }) => {
    await userEvent.click(await within(canvasElement).findByRole('button', { name: 'Entrar com SSO' }));
    await expect(ssoLogin).toHaveBeenCalledWith({ returnTo: args.returnTo });
  },
};

export const AlreadyAuthenticated: Story = {
  args: { authenticated: true },
  play: async ({ args }) => {
    await expect(navigateByUrl).toHaveBeenCalledWith(args.returnTo);
  },
};
