import { Component } from '@angular/core';
import { applicationConfig, moduleMetadata, type Meta, type StoryObj } from '@storybook/angular';
import { provideRouter, withHashLocation, withDisabledInitialNavigation } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { expect, fn, userEvent, within } from 'storybook/test';
import { WorkspaceRecordComponent } from './workspace-record.component';

@Component({ template: '<p>Formulário selecionado</p>' })
class RecordDestinationStory {}

const meta: Meta<WorkspaceRecordComponent> = {
  component: WorkspaceRecordComponent,
  title: 'Admin/Event Management/Event Workspace/Record',
  tags: ['autodocs'],
  decorators: [
    moduleMetadata({ imports: [MatButtonModule, MatIconModule] }),
    applicationConfig({
      providers: [
        provideRouter(
          [{ path: 'forms/:id', component: RecordDestinationStory }],
          withHashLocation(),
          withDisabledInitialNavigation(),
        ),
      ],
    }),
  ],
  args: {
    title: 'Oficina de acessibilidade',
    selected: false,
    disabled: false,
    readonly: false,
    label: '',
    activate: fn(),
  },
  argTypes: {
    title: { control: 'text' },
    label: { control: 'text' },
    readonly: { control: 'boolean' },
    selected: { control: 'boolean' },
    disabled: { control: 'boolean' },
    activate: { action: 'activate', control: false, table: { disable: true } },
  },
  render: (args) => ({
    props: args,
    template: `
    <app-workspace-record [title]="title" [label]="label" [selected]="selected" [disabled]="disabled" [readonly]="readonly" [link]="link" [queryParams]="queryParams" (activate)="activate($event)">
      <mat-icon recordIcon>event</mat-icon>
      <span recordDescription>Minicurso, no Auditório da FCT, com 24 participantes</span>
      <button recordActions matIconButton type="button" aria-label="Mais ações"><mat-icon>more_vert</mat-icon></button>
    </app-workspace-record>
  `,
  }),
  parameters: { a11y: { test: 'error' } },
};
export default meta;
type Story = StoryObj<WorkspaceRecordComponent>;

export const Playground: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const recordButton = canvas.getByRole('button', { name: args.label || args.title });
    await expect(recordButton).toHaveAccessibleName(args.label || args.title);
    await expect(recordButton).toHaveAccessibleDescription('Minicurso, no Auditório da FCT, com 24 participantes');
    await userEvent.click(recordButton);
    await expect(args.activate).toHaveBeenCalledTimes(1);
    await userEvent.click(canvas.getByRole('button', { name: 'Mais ações' }));
    await expect(args.activate).toHaveBeenCalledTimes(1);
  },
};
export const Selected: Story = { args: { selected: true } };
export const DeepLink: Story = {
  args: { link: ['/forms', 'form-1'], queryParams: { eventId: 'event-1' }, selected: true },
  play: async ({ canvasElement, args }) => {
    const link = within(canvasElement).getByRole('link', { name: args.label || args.title });
    await expect(link).toHaveAttribute('href', '#/forms/form-1?eventId=event-1');
    await expect(link).toHaveAttribute('aria-current', 'page');
    await expect(link).toHaveAccessibleDescription('Minicurso, no Auditório da FCT, com 24 participantes');
  },
};
export const Unavailable: Story = {
  args: { disabled: true },
  play: async ({ canvasElement, args }) => {
    await expect(within(canvasElement).getByRole('button', { name: args.label || args.title })).toBeDisabled();
  },
};
export const LongName: Story = {
  args: {
    title:
      'Oficina de acessibilidade e inclusão digital para estudantes, ministrantes e organizadores da comunidade universitária',
  },
};

export const ReadOnly: Story = {
  args: { readonly: true },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole('link', { name: args.label || args.title })).toBeNull();
    await expect(canvas.queryByRole('button', { name: args.label || args.title })).toBeNull();
    await expect(canvas.getByText(args.title)).toBeVisible();
  },
};

export const CustomAction: Story = {
  args: { label: 'Selecionar Oficina de acessibilidade' },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const button = canvas.getByRole('button', { name: args.label });
    await expect(button).toHaveAccessibleName(args.label);
    await expect(button).toHaveAccessibleDescription('Minicurso, no Auditório da FCT, com 24 participantes');
    await userEvent.tab();
    await expect(button).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await expect(args.activate).toHaveBeenCalledTimes(1);
    await userEvent.keyboard(' ');
    await expect(args.activate).toHaveBeenCalledTimes(2);
    await userEvent.tab();
    await expect(canvas.getByRole('button', { name: 'Mais ações' })).toHaveFocus();
  },
};

export const WithoutDescription: Story = {
  render: (args) => ({
    props: args,
    template: '<app-workspace-record [title]="title" (activate)="activate($event)" />',
  }),
  play: async ({ canvasElement, args }) => {
    const button = within(canvasElement).getByRole('button', { name: args.title });
    await expect(button).toHaveAccessibleName(args.title);
    await expect(button).toHaveAccessibleDescription('');
  },
};

export const InteractionFeedback: Story = {
  render: (args) => ({
    props: { ...args, selections: 0, secondaryActions: 0 },
    template: `
      <app-workspace-record [title]="title" [disabled]="disabled" (activate)="selections = selections + 1">
        <span recordDescription>Minicurso, no Auditório da FCT, com 24 participantes</span>
        <button recordActions matIconButton type="button" aria-label="Mais ações" (click)="secondaryActions = secondaryActions + 1">
          <mat-icon>more_vert</mat-icon>
        </button>
      </app-workspace-record>
      <output aria-live="polite">Seleções: {{ selections }}. Ações secundárias: {{ secondaryActions }}.</output>
    `,
  }),
};
