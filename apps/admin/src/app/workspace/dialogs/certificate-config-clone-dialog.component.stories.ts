import { NgComponentOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, Injector, computed, inject, input } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import {
  CertificateConfig,
  CertificateFolder,
  CertificateScope,
  Event,
  EventGroup,
  MajorEvent,
} from '@cacic-fct/event-manager-admin-contracts';
import type { Meta, StoryObj } from '@storybook/angular';
import { applicationConfig } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import { of, throwError } from 'rxjs';
import {
  createAdminCertificateConfig,
  createAdminEvent,
  createAdminEventGroup,
  createAdminMajorEvent,
} from '../../testing/admin-entity-fixtures';
import { CertificateApiService } from '../../graphql/certificate-api.service';
import {
  CertificateConfigCloneDialogComponent,
  CertificateConfigCloneDialogData,
} from './certificate-config-clone-dialog.component';

type CertificateCloneTargetsMode = 'populated' | 'empty' | 'loading-error';

type CertificateConfigCloneDialogStoryArgs = {
  defaultName: string;
  sourceScope: CertificateScope;
  targetsMode: CertificateCloneTargetsMode;
  canCopyIssuedPeople: boolean;
};

const dialogRefMock = {
  close: () => undefined,
};

@Component({
  selector: 'app-storybook-certificate-config-clone-dialog-host',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgComponentOutlet],
  template: `<ng-container *ngComponentOutlet="component; injector: storyInjector()" />`,
})
class CertificateConfigCloneDialogStoryHostComponent {
  private readonly injector = inject(Injector);

  readonly component = CertificateConfigCloneDialogComponent;
  readonly defaultName = input('Certificado de participação (cópia)');
  readonly sourceScope = input<CertificateScope>('EVENT');
  readonly targetsMode = input<CertificateCloneTargetsMode>('populated');
  readonly canCopyIssuedPeople = input(true);

  readonly storyInjector = computed(() =>
    Injector.create({
      parent: this.injector,
      providers: [
        {
          provide: MAT_DIALOG_DATA,
          useValue: {
            config: certificateConfig(this.sourceScope()),
            defaultName: this.defaultName(),
            canCopyIssuedPeople: this.canCopyIssuedPeople(),
          } satisfies CertificateConfigCloneDialogData,
        },
        { provide: MatDialogRef, useValue: dialogRefMock },
        { provide: CertificateApiService, useValue: certificateApi(this.targetsMode()) },
      ],
    }),
  );
}

const meta: Meta<CertificateConfigCloneDialogStoryArgs> = {
  component: CertificateConfigCloneDialogStoryHostComponent,
  title: 'CACiC Eventos/Workspace/Dialogs/Certificate Config Clone Dialog',
  tags: ['autodocs'],
  args: {
    defaultName: 'Certificado de participação (cópia)',
    sourceScope: 'EVENT',
    targetsMode: 'populated',
    canCopyIssuedPeople: true,
  },
  argTypes: {
    defaultName: { control: 'text' },
    sourceScope: {
      control: 'select',
      options: ['EVENT', 'EVENT_GROUP', 'MAJOR_EVENT', 'OTHER'],
    },
    targetsMode: {
      control: 'select',
      options: ['populated', 'empty', 'loading-error'],
    },
    canCopyIssuedPeople: { control: 'boolean' },
  },
  decorators: [
    applicationConfig({
      providers: [provideNoopAnimations()],
    }),
  ],
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
  },
};

export default meta;

type Story = StoryObj<CertificateConfigCloneDialogStoryArgs>;

export const Playground: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Duplicar configuração de certificado')).toBeVisible();
    await expect(await canvas.findByText('Minicurso de Angular')).toBeVisible();
    await userEvent.click(canvas.getByText('Minicurso de Angular'));
  },
};

export const EventGroupTarget: Story = {
  args: {
    sourceScope: 'EVENT_GROUP',
    defaultName: 'Certificado do grupo (cópia)',
  },
};

export const NoTargets: Story = {
  args: {
    targetsMode: 'empty',
  },
};

export const TargetLoadError: Story = {
  args: {
    targetsMode: 'loading-error',
  },
};

export const CannotCopyIssuedPeople: Story = {
  args: {
    canCopyIssuedPeople: false,
  },
};

function certificateConfig(scope: CertificateScope): CertificateConfig {
  switch (scope) {
    case 'EVENT_GROUP': {
      const eventGroup = createAdminEventGroup({
        id: 'group-1',
        name: 'Trilha de Desenvolvimento',
        emoji: 'code',
      });
      return createAdminCertificateConfig({
        scope,
        eventGroupId: eventGroup.id,
        eventGroup,
        eventId: null,
        event: null,
        majorEventId: null,
        majorEvent: null,
        folderId: null,
        folder: null,
      });
    }
    case 'MAJOR_EVENT': {
      const majorEvent = createAdminMajorEvent({
        id: 'major-event-1',
        name: 'CACiC Tech Week',
        emoji: 'festival',
      });
      return createAdminCertificateConfig({
        scope,
        majorEventId: majorEvent.id,
        majorEvent,
        eventId: null,
        event: null,
        eventGroupId: null,
        eventGroup: null,
        folderId: null,
        folder: null,
      });
    }
    case 'OTHER': {
      const folder = certificateFolder({ id: 'folder-1', name: 'Certificados avulsos' });
      return createAdminCertificateConfig({
        scope,
        folderId: folder.id,
        folder,
        eventId: null,
        event: null,
        eventGroupId: null,
        eventGroup: null,
        majorEventId: null,
        majorEvent: null,
      });
    }
    case 'EVENT':
    default: {
      const event = createAdminEvent({
        id: 'event-1',
        name: 'Minicurso de Angular',
        emoji: 'computer',
      });
      return createAdminCertificateConfig({
        scope: 'EVENT',
        eventId: event.id,
        event,
        eventGroupId: null,
        eventGroup: null,
        majorEventId: null,
        majorEvent: null,
        folderId: null,
        folder: null,
      });
    }
  }
}

function certificateApi(mode: CertificateCloneTargetsMode): Pick<
  CertificateApiService,
  | 'listCertificateIssuableEvents'
  | 'listCertificateIssuableEventGroups'
  | 'listCertificateIssuableMajorEvents'
  | 'listCertificateFolders'
> {
  const result = <T>(items: T[]) => {
    if (mode === 'loading-error') {
      return throwError(() => new Error('Falha simulada ao carregar destinos.'));
    }
    return of(mode === 'empty' ? [] : items);
  };

  return {
    listCertificateIssuableEvents: () =>
      result<Event>([
        createAdminEvent({ id: 'event-1', name: 'Minicurso de Angular', emoji: 'computer' }),
        createAdminEvent({ id: 'event-2', name: 'Oficina de UX', emoji: 'palette' }),
      ]),
    listCertificateIssuableEventGroups: () =>
      result<EventGroup>([
        createAdminEventGroup({ id: 'group-1', name: 'Trilha de Desenvolvimento', emoji: 'code' }),
        createAdminEventGroup({ id: 'group-2', name: 'Trilha de Gestão', emoji: 'briefcase' }),
      ]),
    listCertificateIssuableMajorEvents: () =>
      result<MajorEvent>([
        createAdminMajorEvent({ id: 'major-event-1', name: 'CACiC Tech Week', emoji: 'festival' }),
      ]),
    listCertificateFolders: () =>
      result<CertificateFolder>([
        certificateFolder({ id: 'folder-1', name: 'Certificados avulsos' }),
        certificateFolder({ id: 'folder-2', name: 'Declarações manuais' }),
      ]),
  };
}

function certificateFolder(overrides: Partial<CertificateFolder> = {}): CertificateFolder {
  return {
    id: 'folder-1',
    name: 'Certificados avulsos',
    emoji: 'folder',
    createdAt: '2026-05-21T12:00:00.000Z',
    createdById: 'admin-user-1',
    updatedAt: '2026-05-21T12:00:00.000Z',
    updatedById: 'admin-user-1',
    deletedAt: null,
    ...overrides,
  };
}
