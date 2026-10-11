import { withScenarioControls } from '@cacic-fct/shared-angular/storybook';
import { ScannerFeedbackService } from '@cacic-fct/shared-angular';
import { Component } from '@angular/core';
import { ActivatedRoute, convertToParamMap, provideRouter, withDisabledInitialNavigation, withHashLocation } from '@angular/router';
import { of } from 'rxjs';
import type { Meta, StoryObj } from '@storybook/angular';
import { applicationConfig } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import {
  OnlineAttendanceStoryControls,
  createOnlineAttendanceStoryContext,
  onlineAttendanceStoryControlArgTypes,
  onlineAttendanceStoryDefaultControls,
  onlineAttendanceStoryHandlers,
  renderOnlineAttendanceStory,
} from '../online-attendance-story-fixtures';
import { OnlineAttendanceCodeComponent } from './code-page';

const storyContext = createOnlineAttendanceStoryContext();

@Component({ template: '' })
class AttendanceStoryDestination {}

const meta: Meta<OnlineAttendanceStoryControls> = {
  component: OnlineAttendanceCodeComponent,
  title: 'Public/Attendance/Self Registration/Code',
  tags: ['autodocs'],
  args: onlineAttendanceStoryDefaultControls,
  argTypes: onlineAttendanceStoryControlArgTypes,
  render: (args) => renderOnlineAttendanceStory(args, storyContext),
  decorators: [
    withScenarioControls<OnlineAttendanceStoryControls>(),
    applicationConfig({
      providers: [
        ScannerFeedbackService,
        provideRouter([
          { path: 'attendance/register', component: AttendanceStoryDestination },
          { path: 'attendance/register/:eventId', component: AttendanceStoryDestination },
          { path: 'profile/attendances/event/:eventId', component: AttendanceStoryDestination },
        ], withHashLocation(), withDisabledInitialNavigation()),
        { provide: ActivatedRoute, useValue: {
          paramMap: of(convertToParamMap({ eventId: 'event-1' })),
          queryParamMap: of(convertToParamMap({})),
          snapshot: { paramMap: convertToParamMap({ eventId: 'event-1' }), queryParamMap: convertToParamMap({}), data: {} },
        } },
      ],
    }),
  ],
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'error' },
    msw: { handlers: { graphql: onlineAttendanceStoryHandlers(storyContext) } },
  },
};

export default meta;
type Story = StoryObj<OnlineAttendanceStoryControls>;

const enterCode = async (canvasElement: HTMLElement, code: string) => {
  const canvas = within(canvasElement);
  await expect(await canvas.findByRole('heading', { name: onlineAttendanceStoryDefaultControls.name })).toBeVisible();
  const codeInput = canvas.getByRole('textbox');
  const confirmButton = canvas.getByRole('button', { name: 'Confirmar' });
  await expect(confirmButton).toBeDisabled();
  await userEvent.type(codeInput, code);
  await expect(confirmButton).toBeEnabled();
  return { canvas, confirmButton };
};

export const Playground: Story = {
  play: async ({ args, canvasElement }) => {
    const { confirmButton } = await enterCode(canvasElement, args.expectedCode);
    await userEvent.click(confirmButton);
    await expect(await within(document.body).findByText('Presença confirmada.')).toBeVisible();
  },
};

export const UnregisteredWalkIn: Story = {
  args: { unregisteredWalkIn: true },
  globals: { network: 'online' },
  play: async ({ args, canvasElement }) => {
    const { confirmButton } = await enterCode(canvasElement, args.expectedCode);
    await expect(confirmButton).toBeEnabled();
  },
};

export const InvalidCode: Story = {
  args: { confirmationOutcome: 'invalid-code' },
  play: async ({ canvasElement }) => {
    const { confirmButton } = await enterCode(canvasElement, 'ZZ99');
    await userEvent.click(confirmButton);
    await expect(await within(document.body).findByText('Código de presença inválido.')).toBeVisible();
  },
};

export const RateLimited: Story = {
  args: { confirmationOutcome: 'rate-limited', retryAfterSeconds: 8 },
  globals: { network: 'online' },
  play: async ({ canvasElement }) => {
    const { canvas, confirmButton } = await enterCode(canvasElement, 'A1B2');
    await userEvent.click(confirmButton);
    await expect(await canvas.findByText(/Muitas tentativas\. Aguarde 8s/)).toBeVisible();
    await expect(confirmButton).toBeDisabled();
  },
};

export const LongContent: Story = {
  args: {
    name: 'Oficina interdisciplinar de acessibilidade para produtos digitais da comunidade universitária',
    majorEventName: 'Semana acadêmica de ciência, cultura e tecnologia',
    latencyMs: 0,
  },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText(/Oficina interdisciplinar/)).toBeVisible();
  },
};

export const EventNotPending: Story = {
  args: { state: 'empty', eventCount: 0 },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText('Não há presença pendente para este evento.')).toBeVisible();
  },
};

export const Loading: Story = {
  args: { state: 'loading' },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByLabelText('Carregando evento')).toBeVisible();
  },
};

export const ApiError: Story = {
  args: { state: 'error' },
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText('Não foi possível carregar as presenças pendentes.'),
    ).toBeVisible();
  },
};
