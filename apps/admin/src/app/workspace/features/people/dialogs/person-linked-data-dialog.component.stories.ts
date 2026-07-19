import { NgComponentOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, Injector, computed, inject, input } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import {
  PersonLinkedDataSummary,
  PersonLinkedResourceGroup,
  PersonLinkedResourcePage,
} from '@cacic-fct/event-manager-admin-contracts';
import type { Meta, StoryObj } from '@storybook/angular';
import { applicationConfig } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import { of, throwError } from 'rxjs';
import { PeopleApiService } from '../../../../graphql/people-api.service';
import { PersonLinkedDataDialogComponent, PersonLinkedDataDialogData } from './person-linked-data-dialog.component';

type PersonLinkedDataMode = 'linked' | 'empty-deleteable' | 'empty-locked' | 'loading' | 'error' | 'paged';

type PersonLinkedDataDialogStoryArgs = {
  mode: PersonLinkedDataMode;
  personName: string;
  totalCount: number;
};

const dialogRefMock = {
  close: () => undefined,
};

const dialogMock = {
  open: () => ({ afterClosed: () => of(false) }),
};

const snackBarMock = {
  open: () => undefined,
};

@Component({
  selector: 'app-storybook-person-linked-data-dialog-host',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgComponentOutlet],
  template: `<ng-container *ngComponentOutlet="component; injector: storyInjector()" />`,
})
class PersonLinkedDataDialogStoryHostComponent {
  private readonly injector = inject(Injector);

  readonly component = PersonLinkedDataDialogComponent;
  readonly mode = input<PersonLinkedDataMode>('linked');
  readonly personName = input('Ada Lovelace');
  readonly totalCount = input(3);

  readonly storyInjector = computed(() =>
    Injector.create({
      parent: this.injector,
      providers: [
        {
          provide: MAT_DIALOG_DATA,
          useValue: {
            personId: 'person-storybook',
            personName: this.personName(),
          } satisfies PersonLinkedDataDialogData,
        },
        { provide: MatDialogRef, useValue: dialogRefMock },
        { provide: MatDialog, useValue: dialogMock },
        { provide: MatSnackBar, useValue: snackBarMock },
        { provide: PeopleApiService, useValue: createPeopleApi(this.mode(), this.totalCount()) },
      ],
    }),
  );
}

const meta: Meta<PersonLinkedDataDialogStoryArgs> = {
  component: PersonLinkedDataDialogStoryHostComponent,
  title: 'CACiC Eventos/Workspace/Dialogs/Person Linked Data Dialog',
  tags: ['autodocs'],
  args: {
    mode: 'linked',
    personName: 'Ada Lovelace',
    totalCount: 3,
  },
  argTypes: {
    mode: {
      control: 'select',
      options: ['linked', 'empty-deleteable', 'empty-locked', 'loading', 'error', 'paged'],
    },
    personName: { control: 'text' },
    totalCount: { control: { type: 'number', min: 0, max: 50, step: 1 } },
  },
  decorators: [
    applicationConfig({
      providers: [provideNoopAnimations(), provideRouter([])],
    }),
  ],
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
  },
};

export default meta;

type Story = StoryObj<PersonLinkedDataDialogStoryArgs>;

export const LinkedData: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Vínculos da pessoa')).toBeVisible();
    await userEvent.click(await canvas.findByText('Certificados'));
    await expect(await canvas.findByText('Certificado de participação')).toBeVisible();
  },
};

export const EmptyDeleteable: Story = {
  args: {
    mode: 'empty-deleteable',
    totalCount: 0,
  },
};

export const EmptyLocked: Story = {
  args: {
    mode: 'empty-locked',
    totalCount: 0,
  },
};

export const Loading: Story = {
  args: {
    mode: 'loading',
  },
};

export const ErrorState: Story = {
  args: {
    mode: 'error',
  },
};

export const PagedResources: Story = {
  args: {
    mode: 'paged',
    totalCount: 18,
  },
};

function createPeopleApi(mode: PersonLinkedDataMode, totalCount: number): Pick<
  PeopleApiService,
  'getPersonLinkedDataSummary' | 'getPersonLinkedResources' | 'deletePerson'
> {
  return {
    getPersonLinkedDataSummary: () => {
      if (mode === 'loading') {
        return of(null as unknown as PersonLinkedDataSummary);
      }
      if (mode === 'error') {
        return throwError(() => new Error('Falha simulada ao carregar vínculos.'));
      }
      return of(linkedSummary(mode, totalCount));
    },
    getPersonLinkedResources: (_personId: string, type: string, skip: number, take: number) =>
      of(linkedResources(type, skip, take, mode === 'paged' ? totalCount : 3)),
    deletePerson: () => of({ deleted: true, id: 'person-storybook' }),
  };
}

function linkedSummary(mode: PersonLinkedDataMode, totalCount: number): PersonLinkedDataSummary {
  if (mode === 'empty-deleteable' || mode === 'empty-locked') {
    return {
      personId: 'person-storybook',
      groups: [],
      totalCount: 0,
      hasLinkedData: false,
      canDelete: mode === 'empty-deleteable',
    };
  }

  const groups: PersonLinkedResourceGroup[] = [
    {
      type: 'CERTIFICATE',
      label: 'Certificados',
      icon: 'workspace_premium',
      totalCount,
    },
    {
      type: 'EVENT_RELATION',
      label: 'Vínculos com eventos',
      icon: 'event_available',
      totalCount: 2,
      items: eventResources(0, 2),
    },
  ];

  return {
    personId: 'person-storybook',
    groups,
    totalCount: groups.reduce((sum, group) => sum + group.totalCount, 0),
    hasLinkedData: true,
    canDelete: false,
  };
}

function linkedResources(type: string, skip: number, take: number, total: number): PersonLinkedResourcePage {
  const items = type === 'EVENT_RELATION' ? eventResources(skip, take) : certificateResources(skip, take);
  return {
    personId: 'person-storybook',
    type,
    label: type === 'EVENT_RELATION' ? 'Vínculos com eventos' : 'Certificados',
    icon: type === 'EVENT_RELATION' ? 'event_available' : 'workspace_premium',
    items,
    total,
    skip,
    take,
  };
}

function certificateResources(skip: number, take: number) {
  return Array.from({ length: take }, (_, index) => {
    const item = skip + index + 1;
    return {
      id: `certificate-${item}`,
      label: item === 1 ? 'Certificado de participação' : `Certificado ${item}`,
      description: item === 1 ? 'Grande evento: CACiC Tech Week' : 'Evento: Oficina prática',
      route: `/certificates/major-event/major-1/config-${item}`,
      status: item % 3 === 0 ? 'Emitido' : null,
      occurredAt: '2026-06-21T12:00:00.000Z',
    };
  });
}

function eventResources(skip: number, take: number) {
  return Array.from({ length: take }, (_, index) => {
    const item = skip + index + 1;
    return {
      id: `event-${item}`,
      label: item === 1 ? 'Minicurso de Angular' : `Atividade ${item}`,
      description: item === 1 ? 'Ministrante' : 'Participante confirmado',
      route: `/events/event-${item}`,
      status: null,
      occurredAt: '2026-06-20T14:00:00.000Z',
    };
  });
}
