import type { AdminEventContextPageOptions } from '@cacic-fct/event-manager-admin-contracts';
import { Component, inject, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { applicationConfig, type Meta, type StoryObj } from '@storybook/angular';
import { withScenarioControls } from '@cacic-fct/shared-angular/storybook';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { of, throwError } from 'rxjs';
import { Permission } from '@cacic-fct/shared-permissions';
import { AdminEventContextApiService } from '../graphql/admin-event-context-api.service';
import { EventApiService } from '../graphql/event-api.service';
import { EventGroupApiService } from '../graphql/event-group-api.service';
import { MajorEventApiService } from '../graphql/major-event-api.service';
import { PermissionsService } from '../permissions/permissions.service';
import { EventContextDialogComponent, type EventContextDialogData, type EventContextDialogResult } from './event-context-dialog.component';
import type { EventContextRef } from './event-context-picker.component';
import { contextStoryPage } from './event-context-story.fixtures';

type Args = {
  parentContext: EventContextRef | null;
  childKind: 'event' | 'group' | null;
  allowGroups: boolean;
  currentKind: EventContextRef['kind'] | 'none';
  empty: boolean;
  fail: boolean;
  limited: boolean;
  longNames: boolean;
};

const defaults: Args = {
  parentContext: null,
  childKind: null,
  allowGroups: true,
  currentKind: 'event',
  empty: false,
  fail: false,
  limited: false,
  longNames: false,
};

let active = defaults;

const startDate = new Date().toISOString();
const event = () => ({
  id: 'event-1',
  name: active.longNames
    ? 'Oficina de acessibilidade e desenvolvimento de interfaces para a comunidade universitária'
    : 'Oficina de acessibilidade',
  emoji: '♿',
  startDate,
  majorEventId: 'major-1',
  eventGroupId: null,
});
const major = { id: 'major-1', name: 'Semana da Computação', emoji: '🎓', startDate };
const group = { id: 'group-1', name: 'Trilha de desenvolvimento web', emoji: '🌐', majorEventId: 'major-1' };
const groupEvent = {
  id: 'event-2',
  name: 'Encontro da trilha',
  emoji: '🎙️',
  startDate,
  majorEventId: 'major-1',
  eventGroupId: 'group-1',
};

function list<T extends { name: string }>(items: T[], query?: string) {
  if (active.fail) return throwError(() => new Error('Busca indisponível'));
  const normalizedQuery = query?.toLocaleLowerCase('pt-BR') ?? '';
  return of(
    active.empty
      ? []
      : items.filter((item) => item.name.toLocaleLowerCase('pt-BR').includes(normalizedQuery)),
  );
}

@Component({
  selector: 'app-context-dialog-story',
  imports: [MatButtonModule],
  template: [
    '<button mat-stroked-button type="button" (click)="open()">Escolher contexto</button>',
    '<p role="status">{{ result() }}</p>',
  ].join('\n'),
})
class EventContextDialogStoryHost {
  readonly parentContext = input<EventContextRef | null>(null);
  readonly childKind = input<'event' | 'group' | null>(null);
  readonly allowGroups = input(true);
  readonly currentKind = input<Args['currentKind']>('event');
  readonly result = signal('O contexto atual permanece selecionado.');
  private readonly dialog = inject(MatDialog);

  open(): void {
    const kind = this.currentKind();
    this.dialog
      .open<EventContextDialogComponent, EventContextDialogData, EventContextDialogResult>(
        EventContextDialogComponent,
        {
          data: {
            context: kind === 'none' ? null : { kind, id: 'current-context' },
            allowGroups: this.allowGroups(),
            parentContext: this.parentContext(),
            childKind: this.childKind() ?? undefined,
          },
          width: '640px',
          maxWidth: 'calc(100vw - 2rem)',
          autoFocus: 'input[type="search"]',
        },
      )
      .afterClosed()
      .subscribe((context) => {
        if (!context) {
          this.result.set('O contexto anterior foi mantido.');
          return;
        }

        const name =
          'create' in context
            ? 'Criar: ' + context.create
            : context.kind === 'event'
              ? context.id === groupEvent.id
                ? groupEvent.name
                : event().name
              : context.kind === 'group'
                ? group.name
                : major.name;
        this.result.set('Selecionado: ' + name);
      });
  }
}

const meta: Meta<Args> = {
  component: EventContextDialogStoryHost,
  title: 'Admin/Event Management/Event Workspace/Context Dialog',
  tags: ['autodocs'],
  args: defaults,
  argTypes: {
    parentContext: { control: 'object' },
    childKind: { control: 'select', options: [null, 'event', 'group'] },
    allowGroups: { control: 'boolean' },
    currentKind: { control: 'select', options: ['none', 'event', 'group', 'major-event'] },
    empty: { control: 'boolean' },
    fail: { control: 'boolean' },
    limited: { control: 'boolean' },
    longNames: { control: 'boolean' },
  },
  decorators: [
    withScenarioControls<Args>(),
    applicationConfig({
      providers: [
        {
          provide: AdminEventContextApiService,
          useValue: {
            listPage: (options: AdminEventContextPageOptions) =>
              active.fail
                ? throwError(() => new Error('Unavailable'))
                : of(contextStoryPage(options, active)),
          },
        },
        {
          provide: EventApiService,
          useValue: {
            listEvents: (filters: {
              query?: string;
              majorEventId?: string;
              eventGroupId?: string;
              isInGroup?: boolean;
            }) => {
              const events = [event(), groupEvent].filter(
                (item) =>
                  (!filters.majorEventId || item.majorEventId === filters.majorEventId) &&
                  (!filters.eventGroupId || item.eventGroupId === filters.eventGroupId) &&
                  (filters.isInGroup !== false || item.eventGroupId === null),
              );
              return list(events, filters.query);
            },
          },
        },
        {
          provide: EventGroupApiService,
          useValue: {
            listEventGroups: ({ query, majorEventId }: { query?: string; majorEventId?: string }) =>
              list([group].filter((item) => !majorEventId || item.majorEventId === majorEventId), query),
          },
        },
        {
          provide: MajorEventApiService,
          useValue: {
            listMajorEvents: ({ query }: { query?: string }) => list([major], query),
          },
        },
        {
          provide: PermissionsService,
          useValue: {
            evaluateWorkspacePermissions: async () => undefined,
            has: (scope: string) => !active.limited || scope === Permission.Event.Read,
          },
        },
      ],
    }),
  ],
  render: (args) => {
    active = args;
    return {
      props: {
        parentContext: args.parentContext,
        childKind: args.childKind,
        allowGroups: args.allowGroups,
        currentKind: args.currentKind,
      },
    };
  },
  parameters: {
    docs: {
      description: {
        component:
          'Event context dialog for searching and selecting event hierarchy targets. Stories cover keyboard use, permissions, child contexts, and recovery.',
      },
    },
    layout: 'centered',
    a11y: { test: 'error' },
  },
};

export default meta;
type Story = StoryObj<Args>;

async function openDialog(canvasElement: HTMLElement) {
  await userEvent.click(within(canvasElement).getByRole('button', { name: 'Escolher contexto' }));
  return within(await within(canvasElement.ownerDocument.body).findByRole('dialog'));
}

export const Playground: Story = {
  play: async ({ canvasElement }) => {
    const dialog = await openDialog(canvasElement);
    await expect(dialog.getByRole('searchbox', { name: 'Buscar contexto' })).toHaveFocus();
    await userEvent.click(await dialog.findByRole('button', { name: 'Selecionar Semana da Computação' }));
    await expect(await within(canvasElement).findByText('Selecionado: Semana da Computação')).toBeVisible();
  },
};

export const KeyboardSearchAndSelect: Story = {
  play: async ({ canvasElement }) => {
    const dialog = await openDialog(canvasElement);
    await userEvent.type(dialog.getByRole('searchbox'), 'Trilha');
    await waitFor(() =>
      expect(dialog.queryByRole('button', { name: 'Selecionar Semana da Computação' })).not.toBeInTheDocument(),
    );
    const result = await dialog.findByRole('button', { name: 'Selecionar Trilha de desenvolvimento web' });
    result.focus();
    await userEvent.keyboard('{Enter}');
    await expect(await within(canvasElement).findByText('Selecionado: Trilha de desenvolvimento web')).toBeVisible();
  },
};

export const CancelPreservesContext: Story = {
  play: async ({ canvasElement }) => {
    const trigger = within(canvasElement).getByRole('button', { name: 'Escolher contexto' });
    const dialog = await openDialog(canvasElement);
    await userEvent.click(dialog.getByRole('button', { name: 'Cancelar' }));
    await expect(await within(canvasElement).findByText('O contexto anterior foi mantido.')).toBeVisible();
    await waitFor(() => expect(trigger).toHaveFocus(), { timeout: 1_000 });
  },
};

export const EmptyResults: Story = {
  args: { empty: true },
  play: async ({ canvasElement }) => {
    const dialog = await openDialog(canvasElement);
    await expect(
      await dialog.findByText('Nenhum contexto encontrado. Revise a busca ou volte à página anterior.'),
    ).toBeVisible();
  },
};

export const ErrorRecovery: Story = {
  args: { fail: true },
  play: async ({ canvasElement }) => {
    const dialog = await openDialog(canvasElement);
    await expect(await dialog.findByRole('button', { name: 'Tentar novamente' })).toBeVisible();
  },
};

export const EventOnlyPermissions: Story = {
  args: { limited: true },
  play: async ({ canvasElement }) => {
    const dialog = await openDialog(canvasElement);
    await userEvent.click(await dialog.findByRole('button', { name: 'Expandir Semana da Computação' }));
    await expect(await dialog.findByRole('button', { name: 'Selecionar Oficina de acessibilidade' })).toBeVisible();
    await expect(
      dialog.queryByRole('button', { name: 'Selecionar Semana da Computação' }),
    ).not.toBeInTheDocument();
  },
};

export const LongNames: Story = {
  args: { longNames: true },
  play: async ({ canvasElement }) => {
    const dialog = await openDialog(canvasElement);
    await userEvent.click(await dialog.findByRole('button', { name: /Expandir Semana da Computação/ }));
    await expect(
      await dialog.findByRole('button', { name: /Selecionar Oficina de acessibilidade/ }),
    ).toBeVisible();
  },
};

export const QuickCreation: Story = {
  play: async ({ canvasElement }) => {
    const dialog = await openDialog(canvasElement);
    await userEvent.click(dialog.getByRole('button', { name: 'Novo grupo' }));
    await expect(await within(canvasElement).findByText('Selecionado: Criar: group')).toBeVisible();
  },
};

export const MajorEventChildren: Story = {
  args: { parentContext: { kind: 'major-event', id: 'major-1' }, childKind: 'event' },
  play: async ({ canvasElement }) => {
    const dialog = await openDialog(canvasElement);
    await expect(dialog.getByRole('heading', { name: 'Eventos deste contexto' })).toBeVisible();
    await expect(await dialog.findByRole('button', { name: 'Selecionar Oficina de acessibilidade' })).toBeVisible();
    await expect(
      dialog.queryByRole('button', { name: 'Selecionar Encontro da trilha' }),
    ).not.toBeInTheDocument();
    await expect(
      dialog.queryByRole('button', { name: 'Selecionar Semana da Computação' }),
    ).not.toBeInTheDocument();
    await expect(dialog.getByRole('button', { name: 'Novo evento' })).toBeVisible();
    await expect(dialog.queryByRole('button', { name: 'Novo grupo' })).not.toBeInTheDocument();
  },
};

export const GroupChildren: Story = {
  args: { parentContext: { kind: 'group', id: 'group-1' }, childKind: 'event' },
  play: async ({ canvasElement }) => {
    const dialog = await openDialog(canvasElement);
    await expect(await dialog.findByRole('button', { name: 'Selecionar Encontro da trilha' })).toBeVisible();
    await expect(
      dialog.queryByRole('button', { name: 'Selecionar Oficina de acessibilidade' }),
    ).not.toBeInTheDocument();
    await userEvent.click(dialog.getByRole('button', { name: 'Selecionar Encontro da trilha' }));
    await expect(await within(canvasElement).findByText('Selecionado: Encontro da trilha')).toBeVisible();
  },
};

export const MajorEventGroups: Story = {
  args: { parentContext: { kind: 'major-event', id: 'major-1' }, childKind: 'group' },
  play: async ({ canvasElement }) => {
    const dialog = await openDialog(canvasElement);
    await expect(dialog.getByRole('heading', { name: 'Grupos deste contexto' })).toBeVisible();
    await expect(
      await dialog.findByRole('button', { name: 'Selecionar Trilha de desenvolvimento web' }),
    ).toBeVisible();
    await expect(
      dialog.queryByRole('button', { name: 'Selecionar Semana da Computação' }),
    ).not.toBeInTheDocument();
    await expect(dialog.queryByRole('button', { name: 'Novo evento' })).not.toBeInTheDocument();
    await expect(dialog.getByRole('button', { name: 'Novo grupo' })).toBeVisible();
  },
};
