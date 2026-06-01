import { TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { CertificateApiService } from '../../graphql/certificate-api.service';
import { EventApiService } from '../../graphql/event-api.service';
import { EventGroupApiService } from '../../graphql/event-group-api.service';
import { MajorEventApiService } from '../../graphql/major-event-api.service';
import { PeopleApiService } from '../../graphql/people-api.service';
import { CertificateConfig, CertificateConfigInput, CertificateTemplate } from '../../graphql/models';
import { WorkspaceCertificatesService } from './workspace-certificates.service';

describe('WorkspaceCertificatesService', () => {
  const certificateTemplate = {
    id: 'template-1',
    name: 'Template',
    description: null,
    version: 1,
    isActive: true,
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
    createdAt: '2026-05-05T00:00:00.000Z',
    updatedAt: '2026-05-05T00:00:00.000Z',
  } satisfies CertificateTemplate;

  let service: WorkspaceCertificatesService;
  let api: {
    createCertificateConfig: ReturnType<typeof vi.fn>;
    issueMissedCertificates: ReturnType<typeof vi.fn>;
    listCertificateConfigs: ReturnType<typeof vi.fn>;
    listCertificateIssuableEvents: ReturnType<typeof vi.fn>;
    listCertificateTemplates: ReturnType<typeof vi.fn>;
    listCertificates: ReturnType<typeof vi.fn>;
    updateCertificateConfig: ReturnType<typeof vi.fn>;
  };
  let lastPayload: CertificateConfigInput | null;

  beforeEach(async () => {
    lastPayload = null;
    api = {
      createCertificateConfig: vi.fn((payload: CertificateConfigInput) => {
        lastPayload = payload;
        return of({
          id: 'config-1',
          name: payload.name ?? 'Certificate',
          scope: payload.scope ?? 'EVENT',
          majorEventId: payload.majorEventId,
          eventGroupId: payload.eventGroupId,
          eventId: payload.eventId,
          certificateTemplateId: payload.certificateTemplateId ?? certificateTemplate.id,
          certificateTemplate,
          certificateText: payload.certificateText,
          shouldAutofillSecondPage: payload.shouldAutofillSecondPage ?? true,
          secondPageText: payload.secondPageText,
          isActive: payload.isActive ?? true,
          issuedTo: payload.issuedTo ?? 'ATTENDEE',
          certificateFieldsJson: payload.certificateFieldsJson,
          createdAt: '2026-05-05T00:00:00.000Z',
          updatedAt: '2026-05-05T00:00:00.000Z',
        } satisfies CertificateConfig);
      }),
      issueMissedCertificates: vi.fn(() => of([])),
      listCertificateConfigs: vi.fn(() => of([])),
      listCertificateIssuableEvents: vi.fn(() => of([])),
      listCertificateTemplates: vi.fn(() => of([certificateTemplate])),
      listCertificates: vi.fn(() => of([])),
      updateCertificateConfig: vi.fn((id: string, payload: CertificateConfigInput) => {
        lastPayload = payload;
        return of({
          id,
          name: payload.name ?? 'Certificate',
          scope: payload.scope ?? 'EVENT',
          majorEventId: payload.majorEventId,
          eventGroupId: payload.eventGroupId,
          eventId: payload.eventId,
          certificateTemplateId: payload.certificateTemplateId ?? certificateTemplate.id,
          certificateTemplate,
          certificateText: payload.certificateText,
          shouldAutofillSecondPage: payload.shouldAutofillSecondPage ?? true,
          secondPageText: payload.secondPageText,
          isActive: payload.isActive ?? true,
          issuedTo: payload.issuedTo ?? 'ATTENDEE',
          certificateFieldsJson: payload.certificateFieldsJson,
          createdAt: '2026-05-05T00:00:00.000Z',
          updatedAt: '2026-05-05T00:00:00.000Z',
        } satisfies CertificateConfig);
      }),
    };

    await TestBed.configureTestingModule({
      providers: [
        WorkspaceCertificatesService,
        { provide: CertificateApiService, useValue: api },
        { provide: EventApiService, useValue: {} },
        { provide: EventGroupApiService, useValue: {} },
        { provide: MajorEventApiService, useValue: {} },
        { provide: PeopleApiService, useValue: {} },
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

  it('does not post template defaults as stored custom fields', async () => {
    await service.saveCertificateConfig();

    expect(lastPayload?.certificateFieldsJson).toBeNull();
  });

  it('uses template defaults in the form while still omitting unchanged defaults from the payload', async () => {
    expect(service.certificateField('bottom-text')().value()).toBe('como organizador do evento');

    await service.saveCertificateConfig();

    expect(lastPayload?.certificateFieldsJson).toBeNull();
  });

  it('posts edited custom fields as stored overrides', async () => {
    service.certificateField('top-text')().value.set('Certificamos a presença de');

    await service.saveCertificateConfig();

    expect(lastPayload?.certificateFieldsJson).toBe(JSON.stringify({ 'top-text': 'Certificamos a presença de' }));
  });

  it('posts edited text when it differs by one character from the template default', async () => {
    service.certificateField('bottom-text')().value.set('como organizador do event');

    await service.saveCertificateConfig();

    expect(lastPayload?.certificateFieldsJson).toBe(
      JSON.stringify({ 'bottom-text': 'como organizador do event' }),
    );
  });

  it('persists current recipient type before issuing pending certificates', async () => {
    service.selectCertificateConfig({
      id: 'config-1',
      name: 'Certificate',
      scope: 'EVENT',
      majorEventId: null,
      eventGroupId: null,
      eventId: 'event-1',
      certificateTemplateId: certificateTemplate.id,
      certificateTemplate,
      certificateText: null,
      shouldAutofillSecondPage: true,
      secondPageText: null,
      isActive: true,
      issuedTo: 'ATTENDEE',
      certificateFieldsJson: null,
      createdAt: '2026-05-05T00:00:00.000Z',
      updatedAt: '2026-05-05T00:00:00.000Z',
    });
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
