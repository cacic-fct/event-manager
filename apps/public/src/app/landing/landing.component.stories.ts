import type { Meta, StoryObj } from '@storybook/angular';
import { applicationConfig } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import { provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { signal } from '@angular/core';
import { MediaMatcher } from '@angular/cdk/layout';
import { AuthService } from '@cacic-fct/shared-angular';
import { PublicFeatureFlagService } from '../feature-flags/public-feature-flag.service';
import { LandingComponent } from './landing.component';

const meta: Meta<LandingComponent> = {
  component: LandingComponent,
  title: 'Public/Landing/Landing',
  tags: ['autodocs'],
  decorators: [
    applicationConfig({
      providers: [
        provideRouter([]),
        provideNoopAnimations(),
        {
          provide: AuthService,
          useValue: {
            isAuthenticated: signal(false),
            login: async () => undefined,
          },
        },
        {
          provide: PublicFeatureFlagService,
          useValue: {
            stringValue: (key: string) => {
              if (key === 'defaultLoginRedirectPath') {
                return '/calendar';
              }

              return undefined;
            },
          },
        },
        {
          provide: MediaMatcher,
          useValue: {
            matchMedia: () => ({
              matches: false,
              addEventListener: () => undefined,
              removeEventListener: () => undefined,
            }),
          },
        },
      ],
    }),
  ],
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
  },
};

export default meta;

type Story = StoryObj<LandingComponent>;

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

export const DesktopLight: Story = {
  parameters: {
    viewport: { defaultViewport: 'desktop' },
  },
  globals: { theme: 'light' },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};

export const MobileLight: Story = {
  parameters: {
    viewport: { defaultViewport: 'mobile' },
  },
  globals: { theme: 'light' },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};

