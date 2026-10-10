import { Component, input, linkedSignal } from '@angular/core';
import type { Meta, StoryObj } from '@storybook/angular';
import { applicationConfig, moduleMetadata } from '@storybook/angular';
import { expect, fn, userEvent, within } from 'storybook/test';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { SubscriptionEventOptionComponent } from './subscription-event-option.component';
import type { SubscriptionEventOptionView } from './subscription-event-option.models';

type SubscriptionEventOptionStoryArgs = {
  option: SubscriptionEventOptionView;
  selected: boolean;
  disabled: boolean;
  disabledReason: string | null;
  warningReason: string | null;
  interested: boolean;
  readOnly: boolean;
  showInfoButton: boolean;
  showFullDate: boolean;
  selectionChange: ReturnType<typeof fn>;
  info: ReturnType<typeof fn>;
};

@Component({
  selector: 'lib-storybook-subscription-event-option-host',
  imports: [SubscriptionEventOptionComponent],
  template: `
    <lib-subscription-event-option
      [option]="option()"
      [selected]="currentSelected()"
      [disabled]="disabled()"
      [disabledReason]="disabledReason()"
      [warningReason]="warningReason()"
      [interested]="interested()"
      [readOnly]="readOnly()"
      [showInfoButton]="showInfoButton()"
      [showFullDate]="showFullDate()"
      (selectionChange)="updateSelected($event)"
      (info)="notifyInfo()" />
  `,
})
class SubscriptionEventOptionStoryHostComponent {
  readonly option = input.required<SubscriptionEventOptionView>();
  readonly selected = input(false);
  readonly disabled = input(false);
  readonly disabledReason = input<string | null>(null);
  readonly warningReason = input<string | null>(null);
  readonly interested = input(false);
  readonly readOnly = input(false);
  readonly showInfoButton = input(false);
  readonly showFullDate = input(false);
  readonly selectionChange = input<SubscriptionEventOptionStoryArgs['selectionChange']>(fn());
  readonly info = input<SubscriptionEventOptionStoryArgs['info']>(fn());
  readonly currentSelected = linkedSignal(() => this.selected());

  updateSelected(selected: boolean): void {
    this.currentSelected.set(selected);
    this.selectionChange()(selected);
  }

  notifyInfo(): void {
    this.info()();
  }
}

const meta: Meta<SubscriptionEventOptionStoryArgs> = {
  component: SubscriptionEventOptionStoryHostComponent,
  title: 'Shared/Registration/Event Selection Option',
  tags: ['autodocs'],
  args: {
    option: {
      id: 'event-1',
      name: 'Arquitetura Angular para aplicações acadêmicas',
      emoji: '💻',
      description: 'Minicurso',
      startDate: '2026-06-02T12:00:00.000Z',
      endDate: '2026-06-02T14:00:00.000Z',
      locationDescription: 'Auditório 2',
      availabilityLine: '2 vagas disponíveis, posição 4 na fila',
    },
    selected: true,
    disabled: false,
    disabledReason: null,
    warningReason: null,
    interested: false,
    readOnly: false,
    showInfoButton: false,
    showFullDate: false,
    selectionChange: fn(),
    info: fn(),
  },
  argTypes: {
    option: { control: 'object', description: 'Event data shown in the selection option.' },
    selected: { control: 'boolean', description: 'Whether the event is currently selected.' },
    disabled: { control: 'boolean', description: 'Prevent selecting this event.' },
    disabledReason: { control: 'text', description: 'Explain why the event cannot be selected.' },
    warningReason: { control: 'text', description: 'Show a warning associated with this event.' },
    interested: { control: 'boolean', description: 'Whether the visitor marked this event as interesting.' },
    readOnly: { control: 'boolean', description: 'Display the option without allowing changes.' },
    showInfoButton: { control: 'boolean', description: 'Show an action for event details.' },
    showFullDate: { control: 'boolean', description: 'Show the full date instead of only the time.' },
    selectionChange: { action: 'selectionChange', control: false, table: { disable: true } },
    info: { action: 'info', control: false, table: { disable: true } },
  },
  render: (args) => ({
    props: args,
    template: `
      <lib-storybook-subscription-event-option-host
        [option]="option"
        [selected]="selected"
        [disabled]="disabled"
        [disabledReason]="disabledReason"
        [warningReason]="warningReason"
        [interested]="interested"
        [readOnly]="readOnly"
        [showInfoButton]="showInfoButton"
        [showFullDate]="showFullDate"
        [selectionChange]="selectionChange"
        [info]="info" />
    `,
  }),
  decorators: [
    applicationConfig({ providers: [provideNoopAnimations()] }),
    moduleMetadata({ imports: [SubscriptionEventOptionStoryHostComponent] }),
  ],
  parameters: {
    layout: 'padded',
    a11y: { test: 'error' },
    docs: {
      description: {
        component:
          'The story host updates the selected input after selection changes, so the checkbox reflects the parent-controlled state while the callback remains observable.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<SubscriptionEventOptionStoryArgs>;

export const Playground: Story = {
  args: {
    selectionChange: fn(),
    info: fn(),
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const selection = canvas.getByRole('checkbox', {
      name: 'Selecionar Arquitetura Angular para aplicações acadêmicas',
    });

    await expect(selection).toBeChecked();
    await userEvent.click(selection);
    await expect(args.selectionChange).toHaveBeenCalledWith(false);
    await expect(selection).not.toBeChecked();
  },
};

export const Selected: Story = {};

export const LecturerOwnEventWarning: Story = {
  args: { warningReason: 'Palestrante inscrito no próprio evento' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Palestrante inscrito no próprio evento')).toBeVisible();
    await expect(canvas.getByText('warning')).toBeVisible();
  },
};

export const PublicWithInfoAction: Story = {
  args: { showInfoButton: true, info: fn() },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Mais informações sobre Arquitetura Angular para aplicações acadêmicas' }));
    await expect(args.info).toHaveBeenCalledOnce();
  },
};

export const InterestedWithFullDate: Story = {
  args: {
    selected: false,
    interested: true,
    showFullDate: true,
  },
};
