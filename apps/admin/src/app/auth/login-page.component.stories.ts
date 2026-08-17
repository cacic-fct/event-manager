import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '@cacic-fct/shared-angular';
import { applicationConfig, type Meta, type StoryObj } from '@storybook/angular';
import { expect, fn, userEvent, within } from 'storybook/test';
import { LOGIN_DEVELOPMENT_MODE, LoginPageComponent } from './login-page.component';

interface LoginStoryArgs {
  email: string;
  password: string;
  returnTo: string;
  authenticated: boolean;
  passwordOutcome: 'success' | 'invalid';
  ssoOutcome: 'success' | 'error';
}

const defaultArgs: LoginStoryArgs = {
  email: 'admin@cacic.dev',
  password: 'storybook-password',
  returnTo: '/events',
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
  title: 'CACiC Eventos/Auth/Login Page',
  tags: ['autodocs'],
  args: defaultArgs,
  argTypes: {
    email: { control: 'text' },
    password: { control: 'text' },
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
    layout: 'fullscreen',
    a11y: { test: 'todo' },
  },
};

export default meta;
type Story = StoryObj<LoginStoryArgs>;

async function fillCredentials(canvasElement: HTMLElement, args: LoginStoryArgs) {
  const canvas = within(canvasElement);
  await userEvent.type(await canvas.findByRole('textbox', { name: 'E-mail' }), args.email);
  await userEvent.type(canvas.getByLabelText('Senha'), args.password);
  return canvas;
}

export const Playground: Story = {
  globals: { theme: 'light' },
  play: async ({ canvasElement, args }) => {
    const canvas = await fillCredentials(canvasElement, args);
    await userEvent.click(canvas.getByRole('button', { name: /^Entrar$/ }));
    await expect(passwordLogin).toHaveBeenCalledWith(args.email, args.password);
    await expect(navigateByUrl).toHaveBeenCalledWith(args.returnTo);
  },
};

export const InvalidCredentials: Story = {
  args: { passwordOutcome: 'invalid' },
  play: async ({ canvasElement, args }) => {
    const canvas = await fillCredentials(canvasElement, args);
    await userEvent.click(canvas.getByRole('button', { name: /^Entrar$/ }));
    await expect(await canvas.findByRole('alert')).toHaveTextContent('E-mail ou senha inválidos.');
  },
};

export const InvalidEmail: Story = {
  args: { email: 'endereco-invalido' },
  play: async ({ canvasElement, args }) => {
    const canvas = await fillCredentials(canvasElement, args);
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

export const LongCredentialsMobile: Story = {
  args: {
    email: 'administracao.interdisciplinar.de.eventos.universitarios@instituicao.example.br',
    password: 'senha-de-demonstracao-muito-longa-para-validar-o-campo',
    returnTo: '/major-events/gestao-interdisciplinar-de-eventos',
  },
  parameters: { viewport: { defaultViewport: 'mobile' } },
  globals: { theme: 'dark', motion: 'reduced' },
};
