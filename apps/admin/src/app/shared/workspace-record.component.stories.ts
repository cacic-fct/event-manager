import { applicationConfig, moduleMetadata, type Meta, type StoryObj } from '@storybook/angular';
import { provideRouter, withHashLocation, withDisabledInitialNavigation } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { expect, fn, userEvent, within } from 'storybook/test';
import { WorkspaceRecordComponent } from './workspace-record.component';

const meta: Meta<WorkspaceRecordComponent> = {
  component: WorkspaceRecordComponent,
  title: 'CACiC Eventos/Workspace/Components/Record',
  tags: ['autodocs'],
  decorators: [moduleMetadata({ imports: [MatButtonModule, MatIconModule] }), applicationConfig({ providers: [provideRouter([], withHashLocation(), withDisabledInitialNavigation())] })],
  args: { title: 'Oficina de acessibilidade', selected: false, disabled: false, readonly: false, label: '', activate: fn() },
  argTypes: {
    title: { control: 'text' }, label: { control: 'text' },
    readonly: { control: 'boolean' }, selected: { control: 'boolean' }, disabled: { control: 'boolean' },
  },
  render: (args) => ({ props: args, template: `
    <app-workspace-record [title]="title" [label]="label" [selected]="selected" [disabled]="disabled" [readonly]="readonly" [link]="link" [queryParams]="queryParams" (activate)="activate($event)">
      <mat-icon recordIcon>event</mat-icon>
      <span recordDescription>Minicurso · Auditório da FCT · 24 participantes</span>
      <button recordActions matIconButton type="button" aria-label="Mais ações"><mat-icon>more_vert</mat-icon></button>
    </app-workspace-record>
  ` }),
  parameters: { a11y: { test: 'error' } },
};
export default meta;
type Story = StoryObj<WorkspaceRecordComponent>;

export const Playground: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const recordButton = canvas.getByRole('button', { name: args.title });
    const descriptionId = recordButton.getAttribute('aria-describedby');
    await expect(descriptionId).toBeTruthy();
    await expect(canvasElement.querySelector(`#${descriptionId}`)).not.toBeNull();
    await userEvent.click(recordButton);
    await expect(args.activate).toHaveBeenCalledTimes(1);
    await userEvent.click(canvas.getByRole('button', { name: 'Mais ações' }));
    await expect(args.activate).toHaveBeenCalledTimes(1);
  },
};
export const Selected: Story = { args: { selected: true }, globals: { theme: 'dark', motion: 'reduced' } };
export const DeepLink: Story = {
  args: { link: ['/forms', 'form-1'], queryParams: { eventId: 'event-1' }, selected: true },
  play: async ({ canvasElement, args }) => {
    const link = within(canvasElement).getByRole('link', { name: args.title });
    await expect(link).toHaveAttribute('href', '#/forms/form-1?eventId=event-1');
    await expect(link).toHaveAttribute('aria-current', 'page');
  },
};
export const Unavailable: Story = {
  args: { disabled: true },
  play: async ({ canvasElement, args }) => {
    await expect(within(canvasElement).getByRole('button', { name: args.title })).toBeDisabled();
  },
};
export const LongName: Story = {
  args: { title: 'Oficina de acessibilidade e inclusão digital para estudantes, ministrantes e organizadores da comunidade universitária' },
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};

export const ReadOnly: Story = {
  args: { readonly: true },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole('link', { name: args.title })).toBeNull();
    await expect(canvas.queryByRole('button', { name: args.title })).toBeNull();
    await expect(canvas.getByText(args.title)).toBeVisible();
  },
};
