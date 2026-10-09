import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { CertificateApiService } from '../graphql/certificate-api.service';
import { EventApiService } from '../graphql/event-api.service';
import { EventGroupApiService } from '../graphql/event-group-api.service';
import { MajorEventApiService } from '../graphql/major-event-api.service';
import { PeopleApiService } from '../graphql/people-api.service';
import { CertificateConfigInput } from '@cacic-fct/event-manager-admin-contracts';
import { Permission } from '@cacic-fct/shared-permissions';
import {
  createAdminCertificateConfig,
  createAdminCertificateConfigFromInput,
  createAdminCertificateTemplate,
  createAdminEvent,
  createAdminMajorEvent,
  createAdminPerson,
} from '../testing/admin-entity-fixtures';
import { CertificatesService } from './certificates.service';
import { PermissionsService } from '../permissions/permissions.service';

describe('CertificatesService', () => {
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

  let service: CertificatesService;
  let api: {
    createCertificateConfig: ReturnType<typeof vi.fn>;
    createCertificateFolder: ReturnType<typeof vi.fn>;
    cloneCertificateConfig: ReturnType<typeof vi.fn>;
    getCertificateConfig: ReturnType<typeof vi.fn>;
    getCertificateFolder: ReturnType<typeof vi.fn>;
    issueMissedCertificates: ReturnType<typeof vi.fn>;
    issueManualCertificatesFromCsv: ReturnType<typeof vi.fn>;
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
  let majorEventsApi: { getMajorEvent: ReturnType<typeof vi.fn> };
  let eventsApi: { getEvent: ReturnType<typeof vi.fn> };
  let lastPayload: CertificateConfigInput | null;
  let peopleApi: {
    listPeopleSummaries: ReturnType<typeof vi.fn>;
  };
  let dialog: {
    open: ReturnType<typeof vi.fn>;
  };
  let permissions: {
    has: ReturnType<typeof vi.fn>;
    hasAll: ReturnType<typeof vi.fn>;
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
      getCertificateConfig: vi.fn((id: string) =>
        of(createAdminCertificateConfig({ id, event: createAdminEvent({ id: 'event-1' }) }, certificateTemplate)),
      ),
      getCertificateFolder: vi.fn(() => of(certificateFolderFixture())),
      issueMissedCertificates: vi.fn(() => of([])),
      issueManualCertificatesFromCsv: vi.fn(() =>
        of({
          createdCount: 0,
          duplicateCount: 0,
          failedCount: 0,
          failedValues: [],
          inferredMatchType: 'EMAIL',
          ambiguousValues: [],
        }),
      ),
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
    majorEventsApi = { getMajorEvent: vi.fn(() => throwError(() => new Error('Forbidden'))) };
    eventsApi = { getEvent: vi.fn(() => of(createAdminEvent())) };
    peopleApi = {
      listPeopleSummaries: vi.fn(() => of([])),
    };
    permissions = {
      has: vi.fn((permission: Permission) => permission === Permission.Certificate.Issue),
      hasAll: vi.fn((requestedPermissions: Permission[]) => {
        const grantedPermissions = new Set<Permission>([Permission.Certificate.Read, Permission.Certificate.Issue]);
        return requestedPermissions.every((permission) => grantedPermissions.has(permission));
      }),
    };

    await TestBed.configureTestingModule({
      providers: [
        CertificatesService,
        { provide: CertificateApiService, useValue: api },
        { provide: EventApiService, useValue: eventsApi },
        { provide: EventGroupApiService, useValue: {} },
        { provide: MajorEventApiService, useValue: majorEventsApi },
        { provide: PeopleApiService, useValue: peopleApi },
        { provide: MatDialog, useValue: dialog },
        { provide: MatSnackBar, useValue: { open: vi.fn() } },
        { provide: Router, useValue: { navigate: vi.fn().mockResolvedValue(true) } },
        {
          provide: PermissionsService,
          useValue: permissions,
        },
      ],
    }).compileComponents();

    service = TestBed.inject(CertificatesService);
    await service.loadCertificateTemplates();
    service.selectedTarget.set({ id: 'event-1', name: 'Event' });
    service.certificateConfigForm.name().value.set('Certificate');
    service.certificateConfigForm.certificateTemplateId().value.set(certificateTemplate.id);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('opens an event certificate workspace when parent-event read is forbidden', async () => {
    const event = createAdminEvent({ id: 'scoped-event', majorEventId: 'parent-event' });
    const config = createAdminCertificateConfig({ paymentTiers: ['Aluno'] }, certificateTemplate);
    api.listCertificateConfigs.mockReturnValue(of([config]));

    await expect(service.selectTarget(event)).resolves.toBeUndefined();

    expect(service.selectedTarget()).toEqual({ id: event.id, name: event.name, emoji: event.emoji });
    expect(api.listCertificateConfigs).toHaveBeenCalled();
    expect(api.listCertificates).toHaveBeenCalled();
    expect(service.certificateConfigs()).toEqual([config]);
    expect(service.availablePaymentTiers()).toEqual([]);
    service.selectCertificateConfig(config);
    expect(service.paymentTierOptions()).toEqual(['Aluno']);
    expect(service.certificateConfigForm.paymentTiers().value()).toEqual(['Aluno']);
  });

  it('hydrates a routed certificate configuration independently of the current list page', async () => {
    const event = createAdminEvent({ id: 'event-1' });
    const config = createAdminCertificateConfig(
      { id: 'config-page-2', scope: 'EVENT', eventId: event.id, event },
      certificateTemplate,
    );
    eventsApi.getEvent.mockReturnValue(of(event));
    api.listCertificateConfigs.mockReturnValue(of([]));
    api.getCertificateConfig.mockReturnValue(of(config));

    await service.selectTargetByRoute('event', event.id, config.id);

    expect(api.getCertificateConfig).toHaveBeenCalledWith(config.id);
    expect(service.selectedCertificateConfig()?.id).toBe(config.id);
    expect(service.certificateConfigForm.name().value()).toBe(config.name);
  });

  it('keeps the active certificate editor when its configuration is outside the current page', async () => {
    const config = createAdminCertificateConfig({ id: 'config-page-1' }, certificateTemplate);
    service.selectCertificateConfig(config);
    service.certificateConfigsPagination.hasNextPage.set(true);
    api.listCertificateConfigs.mockReturnValue(of([]));

    await service.nextCertificateConfigsPage();

    expect(service.certificateConfigsPagination.pageIndex()).toBe(1);
    expect(service.selectedCertificateConfig()?.id).toBe(config.id);
    expect(service.certificateConfigForm.name().value()).toBe(config.name);
  });

  it('tracks semantic certificate editor changes against the selected baseline', () => {
    const config = createAdminCertificateConfig({ id: 'config-1' }, certificateTemplate);
    service.selectCertificateConfig(config);
    expect(service.unsavedChanges()).toBe(false);

    service.certificateConfigForm.name().value.set('Nome alterado');
    expect(service.unsavedChanges()).toBe(true);

    service.startNewCertificateConfig();
    expect(service.unsavedChanges()).toBe(false);
  });

  it('ignores late tier options after another certificate target is selected', async () => {
    const tiers = new Subject<{ majorEventPrices: { tiers: { name: string }[] }[] }>();
    majorEventsApi.getMajorEvent.mockReturnValue(tiers);
    const pendingSelection = service.selectTarget(createAdminEvent({ id: 'first', majorEventId: 'parent' }));
    expect(service.selectedTarget()?.id).toBe('first');
    await service.selectTarget(createAdminEvent({ id: 'second', majorEventId: null }));
    tiers.next({ majorEventPrices: [{ tiers: [{ name: 'Stale' }] }] });
    await pendingSelection;
    expect(service.selectedTarget()?.id).toBe('second');
    expect(service.availablePaymentTiers()).toEqual([]);
  });

  it('loads optional tier choices when the parent event is readable', async () => {
    majorEventsApi.getMajorEvent.mockReturnValue(of({ majorEventPrices: [{ tiers: [{ name: 'Aluno' }] }] }));
    await service.selectTarget(createAdminEvent({ majorEventId: 'parent-event' }));
    expect(service.availablePaymentTiers()).toEqual(['Aluno']);
    service.clearSelection();
    expect(service.availablePaymentTiers()).toEqual([]);
  });

  it('defaults to all tiers and saves multiple selected tiers', async () => {
    await service.saveCertificateConfig();
    expect(lastPayload?.paymentTiers).toEqual([]);
    service.certificateConfigForm.paymentTiers().value.set(['Aluno', 'Professor']);
    await service.saveCertificateConfig();
    expect(lastPayload?.paymentTiers).toEqual(['Aluno', 'Professor']);
  });

  it('restores tier selections and clears them when saving non-participant certificates', async () => {
    service.selectCertificateConfig(
      createAdminCertificateConfig({ paymentTiers: ['Aluno', 'Professor'] }, certificateTemplate),
    );
    expect(service.certificateConfigForm.paymentTiers().value()).toEqual(['Aluno', 'Professor']);
    expect(service.showPaymentTiers()).toBe(true);
    service.onCertificateIssuedToChanged('LECTURER_PALESTRA');
    expect(service.showPaymentTiers()).toBe(false);
    await service.saveCertificateConfig();
    expect(lastPayload?.paymentTiers).toEqual([]);
  });

  it('inherits target registration rules by default and persists an explicit restriction', async () => {
    expect(service.certificateConfigForm.attendeeEligibility().value()).toBeNull();
    service.certificateConfigForm.attendeeEligibility().value.set('REGISTERED_ONLY');

    await service.saveCertificateConfig();

    expect(lastPayload?.attendeeEligibility).toBe('REGISTERED_ONLY');

    service.certificateConfigForm.attendeeEligibility().value.set(null);
    await service.saveCertificateConfig();

    expect(lastPayload?.attendeeEligibility).toBeNull();
  });

  it('normalizes the no-extra-requirement option to inherited eligibility', async () => {
    service.certificateConfigForm.attendeeEligibility().value.set('ANYONE');

    await service.saveCertificateConfig();

    expect(lastPayload?.attendeeEligibility).toBeNull();
  });

  it('hides attendee eligibility for nonparticipant certificates and clears it on save', async () => {
    service.certificateConfigForm.attendeeEligibility().value.set('REGISTERED_ONLY');
    service.onCertificateIssuedToChanged('LECTURER_PALESTRA');

    expect(service.showAttendeeEligibility()).toBe(false);
    expect(service.certificateConfigForm.attendeeEligibility().value()).toBeNull();

    await service.saveCertificateConfig();

    expect(lastPayload?.attendeeEligibility).toBeNull();
  });

  it('offers approved registrations for a major-event certificate target', async () => {
    service.targetFiltersForm.controls.scope.setValue('MAJOR_EVENT');
    await service.selectTarget(createAdminMajorEvent({ id: 'major-1', name: 'Semana da Computação' }));

    expect(service.attendeeEligibilityOptions().map((option) => option.value)).toContain('APPROVED_REGISTRATIONS_ONLY');
  });

  it('uses template defaults without materializing them as config overrides', async () => {
    await service.saveCertificateConfig();

    expect(lastPayload?.certificateTypeLabel).toBe('Participação');
    expect(lastPayload?.certificateFieldsJson).toBeNull();
  });

  it('blocks certificate mutations when no registered model is available', async () => {
    api.listCertificateTemplates.mockReturnValueOnce(of([]));

    await service.loadCertificateTemplates();
    await service.saveCertificateConfig();

    expect(service.certificateTemplatesLoadState()).toBe('empty');
    expect(service.certificateOperationsEnabled()).toBe(false);
    expect(api.createCertificateConfig).not.toHaveBeenCalled();
  });

  it('exposes a retryable model-loading error and recovers on retry', async () => {
    api.listCertificateTemplates
      .mockReturnValueOnce(throwError(() => new Error('registry unavailable')))
      .mockReturnValueOnce(of([certificateTemplate]));

    await service.loadCertificateTemplates();

    expect(service.certificateTemplatesLoadState()).toBe('error');
    expect(service.certificateOperationsEnabled()).toBe(false);

    await service.loadCertificateTemplates();

    expect(service.certificateTemplatesLoadState()).toBe('ready');
    expect(service.certificateOperationsEnabled()).toBe(true);
  });

  it('searches certificate targets as the query changes', async () => {
    vi.useFakeTimers();
    api.listCertificateIssuableEvents.mockReturnValueOnce(of([createAdminEvent({ id: 'event-1', name: 'Aula' })]));

    service.targetFiltersForm.controls.query.setValue('aula');

    await vi.advanceTimersByTimeAsync(250);

    expect(api.listCertificateIssuableEvents).toHaveBeenCalledWith({ query: 'aula', skip: 0, take: 51 });
    expect(service.issuableEvents().map((eventItem) => eventItem.id)).toEqual(['event-1']);
  });

  it('keeps only the newest target search response', async () => {
    const staleResponse = new Subject<ReturnType<typeof createAdminEvent>[]>();
    const currentResponse = new Subject<ReturnType<typeof createAdminEvent>[]>();
    api.listCertificateIssuableEvents
      .mockReturnValueOnce(staleResponse)
      .mockReturnValueOnce(currentResponse);
    service.targetFiltersForm.controls.query.setValue('antigo', { emitEvent: false });
    const staleSearch = service.searchTargets();
    service.targetFiltersForm.controls.query.setValue('atual', { emitEvent: false });
    const currentSearch = service.searchTargets();

    currentResponse.next([createAdminEvent({ id: 'current-event', name: 'Atual' })]);
    currentResponse.complete();
    await currentSearch;
    staleResponse.next([createAdminEvent({ id: 'stale-event', name: 'Antigo' })]);
    staleResponse.complete();
    await staleSearch;

    expect(service.issuableEvents().map((eventItem) => eventItem.id)).toEqual(['current-event']);
  });

  it('recovers target search after a failed request', async () => {
    api.listCertificateIssuableEvents
      .mockReturnValueOnce(throwError(() => new Error('offline')))
      .mockReturnValueOnce(of([createAdminEvent({ id: 'event-recovered', name: 'Recuperado' })]));

    await service.searchTargets();
    expect(service.targetSearchLoading()).toBe(false);
    await service.searchTargets();

    expect(service.issuableEvents().map((eventItem) => eventItem.id)).toEqual(['event-recovered']);
    expect(service.targetSearchLoading()).toBe(false);
  });

  it('opens the global certificates route as the standalone folder browser', async () => {
    await service.selectTargetByRoute(null, null, null);

    expect(service.targetFiltersForm.controls.scope.value).toBe('OTHER');
    expect(service.selectedTarget()).toBeNull();
    expect(api.listCertificateFolders).toHaveBeenCalledWith({ query: undefined, skip: 0, take: 51 });
    expect(service.certificateFolders().map((folder) => folder.id)).toEqual(['folder-1']);
    expect(api.listCertificateIssuableEvents).not.toHaveBeenCalled();
  });

  it('does not restore a scoped event after navigation returns to the global folder browser', async () => {
    const staleEvent = new Subject<ReturnType<typeof createAdminEvent>>();
    eventsApi.getEvent.mockReturnValueOnce(staleEvent);

    const staleSelection = service.selectTargetByRoute('event', 'event-old', null);
    await Promise.resolve();
    await Promise.resolve();
    expect(eventsApi.getEvent).toHaveBeenCalledWith('event-old');
    await service.selectTargetByRoute(null, null, null);
    staleEvent.next(createAdminEvent({ id: 'event-old', name: 'Evento antigo' }));
    staleEvent.complete();
    await staleSelection;

    expect(service.targetFiltersForm.controls.scope.value).toBe('OTHER');
    expect(service.selectedTarget()).toBeNull();
    expect(service.certificateConfigs()).toEqual([]);
    expect(service.certificates()).toEqual([]);
  });

  it('ignores certificate configs that finish loading after the target was cleared', async () => {
    const staleConfigs = new Subject<ReturnType<typeof createAdminCertificateConfig>[]>();
    api.listCertificateConfigs.mockReturnValueOnce(staleConfigs);
    service.targetFiltersForm.controls.scope.setValue('EVENT');
    const selection = service.selectTarget(createAdminEvent({ id: 'event-old' }));
    await Promise.resolve();

    await service.selectTargetByRoute(null, null, null);
    staleConfigs.next([createAdminCertificateConfig({ id: 'config-old' }, certificateTemplate)]);
    staleConfigs.complete();
    await selection;

    expect(service.selectedTarget()).toBeNull();
    expect(service.certificateConfigs()).toEqual([]);
  });

  it('searches folders and creates standalone manual certificate configs', async () => {
    await service.selectTarget(createAdminEvent({ id: 'event-1' }));
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

    await service.issueMissedCertificates();

    expect(api.updateCertificateConfig).toHaveBeenCalledWith(
      'config-1',
      expect.objectContaining({ scope: 'OTHER', folderId: 'folder-1', issuedTo: 'OTHER' }),
    );
    expect(api.issueMissedCertificates).toHaveBeenCalledWith('config-1');
  });

  it('keeps certificate edits and the current scope while the scope selector is guarded', async () => {
    const currentScope = service.targetFiltersForm.controls.scope.value;
    service.certificateConfigForm.name().value.set('Edição não salva');
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValueOnce(false);

    await service.onScopeChanged('EVENT_GROUP');

    expect(navigate).not.toHaveBeenCalled();
    expect(service.targetFiltersForm.controls.scope.value).toBe(currentScope);
    expect(service.certificateConfigForm.name().value()).toBe('Edição não salva');
    expect(service.unsavedChanges()).toBe(true);
    expect(api.listCertificateIssuableEventGroups).not.toHaveBeenCalled();
  });

  it('searches manual certificate people as the query changes', async () => {
    vi.useFakeTimers();
    peopleApi.listPeopleSummaries.mockReturnValueOnce(of([createAdminPerson({ id: 'person-1', name: 'Ana' })]));

    service.personLookupForm.controls.query.setValue('ana');

    await vi.advanceTimersByTimeAsync(250);

    expect(peopleApi.listPeopleSummaries).toHaveBeenCalledWith({ query: 'ana', take: 20 });
    expect(service.personSearchResults().map((person) => person.id)).toEqual(['person-1']);
  });

  it('imports people from CSV for manual certificate configurations', async () => {
    service.certificateConfigForm.issuedTo().value.set('OTHER');
    dialog.open
      .mockReturnValueOnce({ afterClosed: () => of('E-mail') })
      .mockReturnValueOnce({ afterClosed: () => of(null) });
    api.issueManualCertificatesFromCsv.mockReturnValueOnce(
      of({
        createdCount: 1,
        duplicateCount: 0,
        failedCount: 0,
        failedValues: [],
        inferredMatchType: 'EMAIL',
        ambiguousValues: [],
      }),
    );

    await service.issueManualCertificatesFromCsv({
      name: 'people.csv',
      text: () => Promise.resolve('E-mail\nana@example.com'),
    } as File);

    expect(api.issueManualCertificatesFromCsv).toHaveBeenCalledWith({
      configId: 'config-1',
      csvContent: 'E-mail\nana@example.com',
      selectedHeader: 'E-mail',
    });
    expect(dialog.open).toHaveBeenLastCalledWith(
      expect.any(Function),
      expect.objectContaining({
        data: expect.objectContaining({ title: 'Emissão de certificados concluída' }),
      }),
    );
  });

  it('uses template defaults in the form without storing them as overrides', async () => {
    expect(service.certificateField('bottom-text')().value()).toBe('como organizador do evento');

    await service.saveCertificateConfig();

    expect(lastPayload?.certificateFieldsJson).toBeNull();
  });

  it('posts edited custom fields as stored overrides', async () => {
    service.certificateField('top-text')().value.set('Certificamos a presença de');

    await service.saveCertificateConfig();

    expect(lastPayload?.certificateFieldsJson).toBe(
      JSON.stringify({
        'top-text': 'Certificamos a presença de',
      }),
    );
  });

  it('posts edited text when it differs by one character from the template default', async () => {
    service.certificateField('bottom-text')().value.set('como organizador do event');

    await service.saveCertificateConfig();

    expect(lastPayload?.certificateFieldsJson).toBe(
      JSON.stringify({
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
            manualPeople: false,
          },
        }),
    });

    await service.cloneCertificateConfig(createAdminCertificateConfig({ id: 'config-1', name: 'Certificate' }));

    expect(dialog.open).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        data: expect.objectContaining({
          canCopyIssuedPeople: true,
          canCopyManualPeople: false,
        }),
      }),
    );
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
        manualPeople: false,
      },
    });
  });

  it('lets the backend choose a unique clone name when the dialog name is unchanged', async () => {
    dialog.open.mockReturnValueOnce({
      afterClosed: () =>
        of({
          name: null,
          scope: 'EVENT_GROUP',
          targetId: 'event-group-1',
          parts: {
            textContent: true,
            recipientData: true,
            activeState: true,
            issuedPeople: false,
          },
        }),
    });

    await service.cloneCertificateConfig(createAdminCertificateConfig({ id: 'config-1', name: 'Certificate' }));

    expect(api.cloneCertificateConfig).toHaveBeenCalledWith(
      'config-1',
      expect.not.objectContaining({
        name: expect.anything(),
      }),
    );
  });

  it('does not enable issued people cloning without certificate read permission', async () => {
    permissions.hasAll.mockReturnValueOnce(false);

    dialog.open.mockReturnValueOnce({
      afterClosed: () => of(null),
    });

    await service.cloneCertificateConfig(createAdminCertificateConfig({ id: 'config-1', name: 'Certificate' }));

    expect(permissions.hasAll).toHaveBeenCalledWith([Permission.Certificate.Read, Permission.Certificate.Issue]);
    expect(dialog.open).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        data: expect.objectContaining({
          canCopyIssuedPeople: false,
        }),
      }),
    );
  });

  it('refreshes target lists for the cloned certificate config scope before selecting it', async () => {
    const folder = certificateFolderFixture();
    dialog.open.mockReturnValueOnce({
      afterClosed: () =>
        of({
          name: 'Certificate (cópia)',
          scope: 'OTHER',
          targetId: folder.id,
          parts: {
            textContent: true,
            recipientData: true,
            activeState: true,
            issuedPeople: false,
          },
        }),
    });
    api.cloneCertificateConfig.mockReturnValueOnce(
      of(
        createAdminCertificateConfig(
          {
            id: 'config-clone',
            name: 'Certificate (cópia)',
            scope: 'OTHER',
            eventId: null,
            folderId: folder.id,
            folder,
          },
          certificateTemplate,
        ),
      ),
    );

    await service.cloneCertificateConfig(createAdminCertificateConfig({ id: 'config-1', name: 'Certificate' }));

    expect(api.listCertificateFolders).toHaveBeenCalledWith({ query: undefined, skip: 0, take: 51 });
    expect(service.targetFiltersForm.controls.scope.value).toBe('OTHER');
    expect(service.certificateFolders().map((item) => item.id)).toEqual([folder.id]);
    expect(service.selectedTarget()).toEqual({
      id: folder.id,
      name: folder.name,
      emoji: folder.emoji,
    });
  });

  it('confirms a folder rename before reissuing its certificates', async () => {
    const folder = certificateFolderFixture();
    service.targetFiltersForm.controls.scope.setValue('OTHER');
    await service.selectTarget(folder);
    service.folderForm.controls.name.setValue('Atividades atualizadas');
    dialog.open.mockReturnValueOnce({
      afterClosed: () => of(true),
    });

    await service.saveCertificateFolder();

    expect(dialog.open).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        data: expect.objectContaining({
          title: 'Renomear pasta e reemitir certificados?',
          confirmLabel: 'Renomear e reemitir',
        }),
      }),
    );
    expect(api.updateCertificateFolder).toHaveBeenCalledWith(folder.id, {
      name: 'Atividades atualizadas',
      emoji: folder.emoji,
      reissueCertificates: true,
    });
  });

  it('keeps the selected folder workspace while drafting and cancelling a new folder', async () => {
    const folder = certificateFolderFixture();
    service.targetFiltersForm.controls.scope.setValue('OTHER');
    await service.selectTarget(folder);

    service.startNewFolder();
    expect(service.selectedTarget()?.id).toBe(folder.id);
    expect(service.folderForm.getRawValue()).toEqual({ id: '', name: '', emoji: '📁' });

    service.cancelFolderEdit();
    expect(service.folderForm.getRawValue()).toEqual({ id: folder.id, name: folder.name, emoji: folder.emoji });
    expect(service.selectedTarget()?.id).toBe(folder.id);
  });

  it('does not save a folder rename when certificate reissuance is cancelled', async () => {
    const folder = certificateFolderFixture();
    service.targetFiltersForm.controls.scope.setValue('OTHER');
    await service.selectTarget(folder);
    service.folderForm.controls.name.setValue('Atividades atualizadas');
    dialog.open.mockReturnValueOnce({
      afterClosed: () => of(false),
    });

    await service.saveCertificateFolder();

    expect(api.updateCertificateFolder).not.toHaveBeenCalled();
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
