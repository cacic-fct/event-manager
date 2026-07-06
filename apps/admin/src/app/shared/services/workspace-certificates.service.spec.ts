import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { CertificateApiService } from '../../graphql/certificate-api.service';
import { EventApiService } from '../../graphql/event-api.service';
import { EventGroupApiService } from '../../graphql/event-group-api.service';
import { MajorEventApiService } from '../../graphql/major-event-api.service';
import { PeopleApiService } from '../../graphql/people-api.service';
import { CertificateConfigInput } from '@cacic-fct/event-manager-admin-contracts';
import { Permission } from '@cacic-fct/shared-permissions';
import {
  createAdminCertificateConfig,
  createAdminCertificateConfigFromInput,
  createAdminCertificateTemplate,
  createAdminEvent,
  createAdminPerson,
} from '../../testing/admin-entity-fixtures';
import { WorkspaceCertificatesService } from './workspace-certificates.service';
import { WorkspacePermissionsService } from './workspace-permissions.service';

describe('WorkspaceCertificatesService', () => {
  const certificateTemplate = createAdminCertificateTemplate({
    certificateFieldsJson: JSON.stringify({
      'top-text': {
        label: 'Texto em cima do nome',
        type: 'string',
        required: true,
        default: 'Certificamos a participação de',
      },
      'bottom-text': {
        label: 'Texto embaixo do nome',
        type: 'string',
        required: true,
        default: 'como organizador do evento',
      },
    }),
  });

  let service: WorkspaceCertificatesService;
  let api: {
    createCertificateConfig: ReturnType<typeof vi.fn>;
    createCertificateFolder: ReturnType<typeof vi.fn>;
    cloneCertificateConfig: ReturnType<typeof vi.fn>;
    getCertificateFolder: ReturnType<typeof vi.fn>;
    issueMissedCertificates: ReturnType<typeof vi.fn>;
    listCertificateConfigs: ReturnType<typeof vi.fn>;
    listCertificateFolders: ReturnType<typeof vi.fn>;
    listCertificateIssuableEventGroups: ReturnType<typeof vi.fn>;
    listCertificateIssuableEvents: ReturnType<typeof vi.fn>;
    listCertificateIssuableMajorEvents: ReturnType<typeof vi.fn>;
    listCertificateTemplates: ReturnType<typeof vi.fn>;
    listCertificates: ReturnType<typeof vi.fn>;
    updateCertificateConfig: ReturnType<typeof vi.fn>;
    updateCertificateFolder: ReturnType<typeof vi.fn>;
  };
  let lastPayload: CertificateConfigInput | null;
  let peopleApi: {
    listPeopleSummaries: ReturnType<typeof vi.fn>;
  };
  let dialog: {
    open: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    lastPayload = null;
    dialog = {
      open: vi.fn(() => ({
        afterClosed: () => of(null),
      })),
    };
    api = {
      createCertificateConfig: vi.fn((payload: CertificateConfigInput) => {
        lastPayload = payload;
        return of(createAdminCertificateConfigFromInput(payload, certificateTemplate));
      }),
      createCertificateFolder: vi.fn((payload: { name?: string; emoji?: string }) =>
        of({
          id: 'folder-created',
          name: payload.name ?? 'Pasta',
          emoji: payload.emoji ?? '🏅',
          createdAt: '2026-07-01T12:00:00.000Z',
          updatedAt: '2026-07-01T12:00:00.000Z',
        }),
      ),
      cloneCertificateConfig: vi.fn((id: string) =>
        of(createAdminCertificateConfig({ id: `${id}-clone`, name: 'Certificate (cópia)' }, certificateTemplate)),
      ),
      getCertificateFolder: vi.fn(() => of(certificateFolderFixture())),
      issueMissedCertificates: vi.fn(() => of([])),
      listCertificateConfigs: vi.fn(() => of([])),
      listCertificateFolders: vi.fn(() => of([certificateFolderFixture()])),
      listCertificateIssuableEventGroups: vi.fn(() => of([])),
      listCertificateIssuableEvents: vi.fn(() => of([])),
      listCertificateIssuableMajorEvents: vi.fn(() => of([])),
      listCertificateTemplates: vi.fn(() => of([certificateTemplate])),
      listCertificates: vi.fn(() => of([])),
      updateCertificateConfig: vi.fn((id: string, payload: CertificateConfigInput) => {
        lastPayload = payload;
        return of(createAdminCertificateConfigFromInput(payload, certificateTemplate, { id }));
      }),
      updateCertificateFolder: vi.fn((id: string, payload: { name?: string; emoji?: string }) =>
        of({
          ...certificateFolderFixture(),
          id,
          name: payload.name ?? 'Pasta',
          emoji: payload.emoji ?? '🏅',
        }),
      ),
    };
    peopleApi = {
      listPeopleSummaries: vi.fn(() => of([])),
    };

    await TestBed.configureTestingModule({
      providers: [
        WorkspaceCertificatesService,
        { provide: CertificateApiService, useValue: api },
        { provide: EventApiService, useValue: {} },
        { provide: EventGroupApiService, useValue: {} },
        { provide: MajorEventApiService, useValue: {} },
        { provide: PeopleApiService, useValue: peopleApi },
        { provide: MatDialog, useValue: dialog },
        { provide: MatSnackBar, useValue: { open: vi.fn() } },
        { provide: Router, useValue: { navigate: vi.fn() } },
        {
          provide: WorkspacePermissionsService,
          useValue: {
            has: vi.fn((permission: Permission) => permission === Permission.Certificate.Issue),
          },
        },
      ],
    }).compileComponents();

    service = TestBed.inject(WorkspaceCertificatesService);
    await service.loadCertificateTemplates();
    service.selectedTarget.set({ id: 'event-1', name: 'Event' });
    service.certificateConfigForm.name().value.set('Certificate');
    service.certificateConfigForm.certificateTemplateId().value.set(certificateTemplate.id);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('posts template defaults as stored certificate fields', async () => {
    await service.saveCertificateConfig();

    expect(lastPayload?.certificateTypeLabel).toBe('Participação');
    expect(lastPayload?.certificateFieldsJson).toBe(
      JSON.stringify({
        'top-text': 'Certificamos a participação de',
        'bottom-text': 'como organizador do evento',
      }),
    );
  });

  it('searches certificate targets as the query changes', async () => {
    vi.useFakeTimers();
    api.listCertificateIssuableEvents.mockReturnValueOnce(of([createAdminEvent({ id: 'event-1', name: 'Aula' })]));

    service.targetFiltersForm.controls.query.setValue('aula');

    await vi.advanceTimersByTimeAsync(250);

    expect(api.listCertificateIssuableEvents).toHaveBeenCalledWith({ query: 'aula', skip: 0, take: 51 });
    expect(service.issuableEvents().map((eventItem) => eventItem.id)).toEqual(['event-1']);
  });

  it('searches folders and creates standalone manual certificate configs', async () => {
    await service.onScopeChanged('OTHER');

    expect(api.listCertificateFolders).toHaveBeenCalledWith({ query: undefined, skip: 0, take: 51 });
    expect(service.certificateFolders().map((folder) => folder.id)).toEqual(['folder-1']);

    await service.selectTarget(certificateFolderFixture());
    service.certificateConfigForm.name().value.set('Certificado avulso');
    service.certificateConfigForm.secondPageText().value.set('Texto manual do verso');

    await service.saveCertificateConfig();

    expect(lastPayload).toEqual(
      expect.objectContaining({
        name: 'Certificado avulso',
        scope: 'OTHER',
        folderId: 'folder-1',
        majorEventId: null,
        eventGroupId: null,
        eventId: null,
        issuedTo: 'OTHER',
        shouldAutofillSecondPage: false,
        secondPageText: 'Texto manual do verso',
      }),
    );
  });

  it('searches manual certificate people as the query changes', async () => {
    vi.useFakeTimers();
    peopleApi.listPeopleSummaries.mockReturnValueOnce(of([createAdminPerson({ id: 'person-1', name: 'Ana' })]));

    service.personLookupForm.controls.query.setValue('ana');

    await vi.advanceTimersByTimeAsync(250);

    expect(peopleApi.listPeopleSummaries).toHaveBeenCalledWith({ query: 'ana', take: 20 });
    expect(service.personSearchResults().map((person) => person.id)).toEqual(['person-1']);
  });

  it('uses template defaults in the form and sends them in the payload', async () => {
    expect(service.certificateField('bottom-text')().value()).toBe('como organizador do evento');

    await service.saveCertificateConfig();

    expect(lastPayload?.certificateFieldsJson).toBe(
      JSON.stringify({
        'top-text': 'Certificamos a participação de',
        'bottom-text': 'como organizador do evento',
      }),
    );
  });

  it('posts edited custom fields as stored overrides', async () => {
    service.certificateField('top-text')().value.set('Certificamos a presença de');

    await service.saveCertificateConfig();

    expect(lastPayload?.certificateFieldsJson).toBe(
      JSON.stringify({
        'top-text': 'Certificamos a presença de',
        'bottom-text': 'como organizador do evento',
      }),
    );
  });

  it('posts edited text when it differs by one character from the template default', async () => {
    service.certificateField('bottom-text')().value.set('como organizador do event');

    await service.saveCertificateConfig();

    expect(lastPayload?.certificateFieldsJson).toBe(
      JSON.stringify({
        'top-text': 'Certificamos a participação de',
        'bottom-text': 'como organizador do event',
      }),
    );
  });

  it('persists current recipient type before issuing pending certificates', async () => {
    service.selectCertificateConfig(createAdminCertificateConfig({ id: 'config-1' }, certificateTemplate));
    service.certificateConfigForm.issuedTo().value.set('LECTURER');
    service.certificateConfigForm.certificateTypeLabel().value.set('Mediador');

    await service.issueMissedCertificates();

    expect(api.updateCertificateConfig).toHaveBeenCalledWith(
      'config-1',
      expect.objectContaining({ issuedTo: 'LECTURER', certificateTypeLabel: 'Mediador' }),
    );
    expect(api.issueMissedCertificates).toHaveBeenCalledWith('config-1');
  });

  it('maps recipient selections to certificate type labels', async () => {
    service.onCertificateIssuedToChanged('LECTURER_PALESTRA');

    await service.saveCertificateConfig();

    expect(lastPayload).toEqual(
      expect.objectContaining({
        issuedTo: 'LECTURER',
        certificateTypeLabel: 'Palestrante',
        certificateFieldsJson: expect.stringContaining('__lecturerEventCategory'),
      }),
    );

    service.onCertificateIssuedToChanged('LECTURER');
    service.certificateConfigForm.certificateTypeLabel().value.set('Painelista');

    await service.saveCertificateConfig();

    expect(lastPayload).toEqual(
      expect.objectContaining({
        issuedTo: 'LECTURER',
        certificateTypeLabel: 'Painelista',
      }),
    );
  });

  it('sends custom second page text only when event autofill is disabled', async () => {
    service.certificateConfigForm.shouldAutofillSecondPage().value.set(false);
    service.certificateConfigForm.secondPageText().value.set('Texto livre para o verso');

    await service.saveCertificateConfig();

    expect(lastPayload).toEqual(
      expect.objectContaining({
        shouldAutofillSecondPage: false,
        secondPageText: 'Texto livre para o verso',
      }),
    );

    service.certificateConfigForm.shouldAutofillSecondPage().value.set(true);

    await service.saveCertificateConfig();

    expect(lastPayload).toEqual(
      expect.objectContaining({
        shouldAutofillSecondPage: true,
        secondPageText: null,
      }),
    );
  });

  it('duplicates certificate configs with selected keep options', async () => {
    dialog.open.mockReturnValueOnce({
      afterClosed: () =>
        of({
          name: 'Certificate (cópia)',
          scope: 'EVENT_GROUP',
          targetId: 'event-group-1',
          parts: {
            textContent: true,
            recipientData: true,
            activeState: false,
            issuedPeople: true,
          },
        }),
    });

    await service.cloneCertificateConfig(createAdminCertificateConfig({ id: 'config-1', name: 'Certificate' }));

    expect(api.cloneCertificateConfig).toHaveBeenCalledWith('config-1', {
      name: 'Certificate (cópia)',
      scope: 'EVENT_GROUP',
      majorEventId: null,
      eventGroupId: 'event-group-1',
      eventId: null,
      folderId: null,
      parts: {
        textContent: true,
        recipientData: true,
        activeState: false,
        issuedPeople: true,
      },
    });
  });
});

function certificateFolderFixture() {
  return {
    id: 'folder-1',
    name: 'Atividades complementares',
    emoji: '🏅',
    createdAt: '2026-07-01T12:00:00.000Z',
    createdById: null,
    updatedAt: '2026-07-01T12:00:00.000Z',
    updatedById: null,
    deletedAt: null,
  };
}
