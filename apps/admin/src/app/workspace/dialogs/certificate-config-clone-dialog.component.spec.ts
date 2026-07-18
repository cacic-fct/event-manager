import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of, throwError } from 'rxjs';
import { CertificateApiService } from '../../graphql/certificate-api.service';
import {
  createAdminCertificateConfig,
  createAdminEvent,
  createAdminEventGroup,
} from '../../testing/admin-entity-fixtures';
import {
  CertificateConfigCloneDialogComponent,
  CertificateConfigCloneDialogData,
} from './certificate-config-clone-dialog.component';

describe('CertificateConfigCloneDialogComponent', () => {
  it('loads paged event targets and keeps the current target available when it is not returned', async () => {
    const currentEvent = createAdminEvent({
      id: 'event-current',
      name: 'Evento atual',
      emoji: '📌',
      startDate: '2026-07-01T12:00:00.000Z',
      endDate: '2026-07-01T14:00:00.000Z',
    });
    const firstPage = Array.from({ length: 50 }, (_, index) =>
      createAdminEvent({
        id: `event-${index}`,
        name: `Evento ${index}`,
      }),
    );
    const lastEvent = createAdminEvent({ id: 'event-last', name: 'Evento final' });
    const api = createApi({
      listCertificateIssuableEvents: vi
        .fn()
        .mockReturnValueOnce(of(firstPage))
        .mockReturnValueOnce(of([lastEvent])),
    });

    const { component } = await createFixture(api, {
      config: createAdminCertificateConfig({
        eventId: currentEvent.id,
        event: currentEvent,
      }),
      defaultName: 'Certificate (cópia)',
      canCopyIssuedPeople: true,
      canCopyManualPeople: true,
    });

    await settleAsyncWork();

    expect(api.listCertificateIssuableEvents).toHaveBeenNthCalledWith(1, { skip: 0, take: 50 });
    expect(api.listCertificateIssuableEvents).toHaveBeenNthCalledWith(2, { skip: 50, take: 50 });
    expect(read(component).targets().map((target) => target.id)).toEqual([
      'event-current',
      ...firstPage.map((eventItem) => eventItem.id),
      'event-last',
    ]);
    expect(read(component).selectedTargetId()).toBe('event-current');
    expect(read(component).targets()[0]).toEqual(
      expect.objectContaining({
        name: 'Evento atual',
        dateLabel: '01/07/2026 - 01/07/2026',
      }),
    );
  });

  it('switches scopes, selects a folder, and closes with normalized clone options', async () => {
    const api = createApi({
      listCertificateFolders: vi.fn(() => of([certificateFolder({ id: 'folder-2', name: 'Atividades extras' })])),
    });
    const { component, dialogRef } = await createFixture(api);
    await settleAsyncWork();

    read(component).form.controls.scope.setValue('OTHER');
    read(component).onScopeChanged('OTHER');
    await settleAsyncWork();
    read(component).selectTarget('folder-2');
    read(component).form.controls.name.setValue('  Cópia ajustada  ');
    read(component).partControls.textContent.setValue(false);
    read(component).partControls.activeState.setValue(false);
    read(component).partControls.manualPeople.setValue(true);

    read(component).confirmClone();

    expect(api.listCertificateFolders).toHaveBeenCalledWith({ skip: 0, take: 50 });
    expect(dialogRef.close).toHaveBeenCalledWith({
      name: 'Cópia ajustada',
      scope: 'OTHER',
      targetId: 'folder-2',
      parts: {
        textContent: false,
        recipientData: true,
        activeState: false,
        issuedPeople: false,
        manualPeople: true,
      },
    });
  });

  it('omits an unchanged name and does not close without a selected target', async () => {
    const { component, dialogRef } = await createFixture(createApi());
    await settleAsyncWork();

    read(component).selectedTargetId.set(null);
    read(component).confirmClone();

    expect(dialogRef.close).not.toHaveBeenCalled();
    expect(read(component).form.touched).toBe(true);

    read(component).selectTarget('event-1');
    read(component).confirmClone();

    expect(dialogRef.close).toHaveBeenCalledWith(
      expect.objectContaining({
        name: null,
        targetId: 'event-1',
      }),
    );
  });

  it('clears targets and loading state when the selected scope cannot be loaded', async () => {
    const { component } = await createFixture(
      createApi({
        listCertificateIssuableEvents: vi.fn(() => throwError(() => new Error('network'))),
      }),
    );

    await settleAsyncWork();

    expect(read(component).targets()).toEqual([]);
    expect(read(component).loading()).toBe(false);
  });
});

async function createFixture(
  api: ReturnType<typeof createApi>,
  data: CertificateConfigCloneDialogData = {
    config: createAdminCertificateConfig({
      event: createAdminEvent({ id: 'event-1' }),
    }),
    defaultName: 'Certificate (cópia)',
    canCopyIssuedPeople: true,
    canCopyManualPeople: true,
  },
): Promise<{
  component: CertificateConfigCloneDialogComponent;
  dialogRef: { close: ReturnType<typeof vi.fn> };
  fixture: ComponentFixture<CertificateConfigCloneDialogComponent>;
}> {
  const dialogRef = {
    close: vi.fn(),
  };

  await TestBed.configureTestingModule({
    imports: [CertificateConfigCloneDialogComponent],
    providers: [
      provideNoopAnimations(),
      { provide: MAT_DIALOG_DATA, useValue: data },
      { provide: MatDialogRef, useValue: dialogRef },
      { provide: CertificateApiService, useValue: api },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(CertificateConfigCloneDialogComponent);
  fixture.detectChanges();

  return {
    component: fixture.componentInstance,
    dialogRef,
    fixture,
  };
}

function createApi(overrides: Partial<Record<keyof CertificateApiService, ReturnType<typeof vi.fn>>> = {}) {
  return {
    listCertificateIssuableEvents: vi.fn(() => of([createAdminEvent({ id: 'event-1' })])),
    listCertificateIssuableEventGroups: vi.fn(() => of([createAdminEventGroup({ id: 'group-1' })])),
    listCertificateIssuableMajorEvents: vi.fn(() => of([])),
    listCertificateFolders: vi.fn(() => of([certificateFolder()])),
    ...overrides,
  };
}

function certificateFolder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'folder-1',
    name: 'Atividades complementares',
    emoji: '🏅',
    createdAt: '2026-07-01T12:00:00.000Z',
    createdById: null,
    updatedAt: '2026-07-01T12:00:00.000Z',
    updatedById: null,
    deletedAt: null,
    ...overrides,
  };
}

function read(component: CertificateConfigCloneDialogComponent) {
  return component as unknown as {
    confirmClone: () => void;
    form: CertificateConfigCloneDialogComponent['form'];
    loading: CertificateConfigCloneDialogComponent['loading'];
    onScopeChanged: (scope: 'EVENT' | 'EVENT_GROUP' | 'MAJOR_EVENT' | 'OTHER') => void;
    partControls: CertificateConfigCloneDialogComponent['partControls'];
    selectTarget: (targetId: string) => void;
    selectedTargetId: CertificateConfigCloneDialogComponent['selectedTargetId'];
    targets: CertificateConfigCloneDialogComponent['targets'];
  };
}

async function settleAsyncWork(): Promise<void> {
  for (let index = 0; index < 5; index += 1) {
    await Promise.resolve();
  }
}
