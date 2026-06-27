import { TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { CertificateApiService } from '../../graphql/certificate-api.service';
import { EventApiService } from '../../graphql/event-api.service';
import { EventGroupApiService } from '../../graphql/event-group-api.service';
import { MajorEventApiService } from '../../graphql/major-event-api.service';
import { PeopleApiService } from '../../graphql/people-api.service';
import { CertificateConfigInput } from '@cacic-fct/event-manager-admin-contracts';
import {
  createAdminCertificateConfig,
  createAdminCertificateConfigFromInput,
  createAdminCertificateTemplate,
  createAdminEvent,
  createAdminPerson,
} from '../../testing/admin-entity-fixtures';
import { WorkspaceCertificatesService } from './workspace-certificates.service';

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
    issueMissedCertificates: ReturnType<typeof vi.fn>;
    listCertificateConfigs: ReturnType<typeof vi.fn>;
    listCertificateIssuableEventGroups: ReturnType<typeof vi.fn>;
    listCertificateIssuableEvents: ReturnType<typeof vi.fn>;
    listCertificateIssuableMajorEvents: ReturnType<typeof vi.fn>;
    listCertificateTemplates: ReturnType<typeof vi.fn>;
    listCertificates: ReturnType<typeof vi.fn>;
    updateCertificateConfig: ReturnType<typeof vi.fn>;
  };
  let lastPayload: CertificateConfigInput | null;
  let peopleApi: {
    listPeopleSummaries: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    lastPayload = null;
    api = {
      createCertificateConfig: vi.fn((payload: CertificateConfigInput) => {
        lastPayload = payload;
        return of(createAdminCertificateConfigFromInput(payload, certificateTemplate));
      }),
      issueMissedCertificates: vi.fn(() => of([])),
      listCertificateConfigs: vi.fn(() => of([])),
      listCertificateIssuableEventGroups: vi.fn(() => of([])),
      listCertificateIssuableEvents: vi.fn(() => of([])),
      listCertificateIssuableMajorEvents: vi.fn(() => of([])),
      listCertificateTemplates: vi.fn(() => of([certificateTemplate])),
      listCertificates: vi.fn(() => of([])),
      updateCertificateConfig: vi.fn((id: string, payload: CertificateConfigInput) => {
        lastPayload = payload;
        return of(createAdminCertificateConfigFromInput(payload, certificateTemplate, { id }));
      }),
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
        { provide: MatSnackBar, useValue: { open: vi.fn() } },
        { provide: Router, useValue: { navigate: vi.fn() } },
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

    await service.issueMissedCertificates();

    expect(api.updateCertificateConfig).toHaveBeenCalledWith(
      'config-1',
      expect.objectContaining({ issuedTo: 'LECTURER' }),
    );
    expect(api.issueMissedCertificates).toHaveBeenCalledWith('config-1');
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
});
