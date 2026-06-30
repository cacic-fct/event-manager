import { TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { of, Subject } from 'rxjs';
import { EventApiService } from '../../graphql/event-api.service';
import { EventFormApiService } from '../../graphql/event-form-api.service';
import { MajorEventApiService } from '../../graphql/major-event-api.service';
import {
  createAdminEvent,
  createAdminEventForm,
  createAdminEventFormFromInput,
  createAdminEventFormResults,
  createAdminMajorEvent,
} from '../../testing/admin-entity-fixtures';
import { type EventFormInput } from '@cacic-fct/event-manager-admin-contracts';
import { WorkspaceFormsService } from './workspace-forms.service';
import { WorkspaceUiService } from './workspace-ui.service';

describe('WorkspaceFormsService integration', () => {
  let service: WorkspaceFormsService;
  let savedInput: EventFormInput | null;
  let formApi: {
    listForms: ReturnType<typeof vi.fn>;
    getForm: ReturnType<typeof vi.fn>;
    saveForm: ReturnType<typeof vi.fn>;
    saveDraft: ReturnType<typeof vi.fn>;
    publishForm: ReturnType<typeof vi.fn>;
    unpublishForm: ReturnType<typeof vi.fn>;
    deleteForm: ReturnType<typeof vi.fn>;
    results: ReturnType<typeof vi.fn>;
  };
  let eventApi: {
    listEvents: ReturnType<typeof vi.fn>;
  };
  let majorEventApi: {
    listMajorEvents: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    const event = createAdminEvent({ id: 'event-1', name: 'Oficina de Angular' });
    const majorEvent = createAdminMajorEvent({ id: 'major-event-1', name: 'Semana da Computação' });
    const form = createAdminEventForm({ ownerEventId: event.id });
    savedInput = null;

    formApi = {
      listForms: vi.fn(() => of([form])),
      getForm: vi.fn(() => of(form)),
      saveForm: vi.fn((input: EventFormInput) => {
        savedInput = input;
        return of(createAdminEventFormFromInput(input));
      }),
      saveDraft: vi.fn(() => of(null)),
      publishForm: vi.fn(() => of(form)),
      unpublishForm: vi.fn(() => of(form)),
      deleteForm: vi.fn(() => of(form)),
      results: vi.fn(() => of(createAdminEventFormResults({ form }))),
    };
    eventApi = {
      listEvents: vi.fn(() => of([event])),
    };
    majorEventApi = {
      listMajorEvents: vi.fn(() => of([majorEvent])),
    };

    await TestBed.configureTestingModule({
      providers: [
        WorkspaceFormsService,
        WorkspaceUiService,
        { provide: EventFormApiService, useValue: formApi },
        { provide: EventApiService, useValue: eventApi },
        { provide: MajorEventApiService, useValue: majorEventApi },
        { provide: MatSnackBar, useValue: { open: vi.fn() } },
      ],
    }).compileComponents();

    service = TestBed.inject(WorkspaceFormsService);
  });

  it('loads form targets, opens a form, and loads aggregate results', async () => {
    await service.initialize();

    expect(eventApi.listEvents).toHaveBeenCalledWith({ take: 500 });
    expect(majorEventApi.listMajorEvents).toHaveBeenCalledWith({ take: 500 });
    expect(formApi.listForms).toHaveBeenCalledWith({
      query: undefined,
      eventId: undefined,
      majorEventId: undefined,
    });
    expect(service.forms()).toHaveLength(1);

    await service.selectForm(service.forms()[0]);

    expect(formApi.getForm).toHaveBeenCalledWith('form-1');
    expect(formApi.results).toHaveBeenCalledWith('form-1');
    expect(service.form.controls.name.value).toBe('Pesquisa de camiseta');
    expect(service.form.controls.ownerType.value).toBe('EVENT');
    expect(service.elements()[0]?.title).toBe('Tamanho da camiseta');
    expect(service.links()[0]).toMatchObject({
      targetType: 'EVENT',
      eventId: 'event-1',
      insertInSubscriptionFlow: true,
      requiredInSubscriptionFlow: true,
      notifyOnPublish: false,
      allowLecturerManualPublish: false,
    });
    expect(service.selectedResults()?.responseCount).toBe(1);
  });

  it('ignores stale form list responses and keeps the latest search context', async () => {
    const staleResponse = new Subject<ReturnType<typeof createAdminEventForm>[]>();
    const currentResponse = new Subject<ReturnType<typeof createAdminEventForm>[]>();
    const staleForm = createAdminEventForm({ id: 'stale-form', name: 'Resultado antigo' });
    const currentForm = createAdminEventForm({ id: 'current-form', name: 'Resultado atual' });
    formApi.listForms
      .mockImplementationOnce(() => staleResponse)
      .mockImplementationOnce(() => currentResponse);

    service.filtersForm.controls.query.setValue('antigo');
    const staleLoad = service.loadForms();
    service.filtersForm.controls.query.setValue('atual');
    const currentLoad = service.loadForms();

    currentResponse.next([currentForm]);
    currentResponse.complete();
    await currentLoad;
    staleResponse.next([staleForm]);
    staleResponse.complete();
    await staleLoad;

    expect(service.forms().map((form) => form.id)).toEqual(['current-form']);
  });

  it('reloads selected results when the selected form is refreshed from the list', async () => {
    await service.initialize();
    await service.selectForm(service.forms()[0]);
    formApi.results.mockClear();
    formApi.listForms.mockReturnValueOnce(of([createAdminEventForm({ id: 'form-1', name: 'Pesquisa reidratada' })]));

    await service.loadForms();

    expect(service.form.controls.name.value).toBe('Pesquisa reidratada');
    expect(formApi.results).toHaveBeenCalledWith('form-1');
    expect(service.selectedResults()?.responseCount).toBe(1);
  });

  it('clears stale selected editor state when the selected form disappears', async () => {
    await service.initialize();
    await service.selectForm(service.forms()[0]);
    formApi.listForms.mockReturnValueOnce(of([]));

    await service.loadForms();

    expect(service.selectedForm()).toBeNull();
    expect(service.selectedResults()).toBeNull();
    expect(service.elements()).toEqual([]);
    expect(service.links()).toEqual([]);
    expect(service.form.controls.id.value).toBe('');
    expect(service.form.controls.name.value).toBe('');
  });

  it('saves metadata, element JSON, and target link settings through the form API', async () => {
    await service.initialize();
    await service.selectForm(service.forms()[0]);
    service.form.patchValue({
      name: 'Pesquisa atualizada',
      ownerType: 'MAJOR_EVENT',
      ownerEventId: '',
      ownerMajorEventId: 'major-event-1',
      sigilo: 'ANONYMOUS',
      responseMode: 'MULTIPLE_PER_TARGET',
      resultsPublic: true,
      resultsLive: true,
    });
    service.updateLink('form-link-1', {
      targetType: 'MAJOR_EVENT',
      majorEventId: 'major-event-1',
      audience: 'ATTENDEES',
      insertInSubscriptionFlow: false,
      requiredInSubscriptionFlow: false,
      displayOrder: 3,
      notifyOnPublish: true,
      allowLecturerManualPublish: true,
    });

    await service.save();

    expect(formApi.saveForm).toHaveBeenCalledOnce();
    expect(savedInput).toMatchObject({
      id: 'form-1',
      name: 'Pesquisa atualizada',
      ownerEventId: null,
      ownerMajorEventId: 'major-event-1',
      sigilo: 'ANONYMOUS',
      responseMode: 'MULTIPLE_PER_TARGET',
      resultsPublic: true,
      resultsLive: true,
    });
    expect(savedInput?.elementsJson).toContain('Tamanho da camiseta');
    expect(savedInput?.links?.[0]).toMatchObject({
      id: 'form-link-1',
      targetType: 'MAJOR_EVENT',
      eventId: null,
      majorEventId: 'major-event-1',
      audience: 'ATTENDEES',
      insertInSubscriptionFlow: false,
      requiredInSubscriptionFlow: false,
      enforceRequiredAnswers: true,
      displayOrder: 3,
      allowLecturerManualPublish: false,
    });
  });

  it('normalizes impossible link combinations before saving', async () => {
    await service.initialize();
    await service.selectForm(service.forms()[0]);

    service.updateLink('form-link-1', {
      insertInSubscriptionFlow: true,
      requiredInSubscriptionFlow: true,
      notifyOnPublish: true,
      allowLecturerManualPublish: true,
    });

    await service.save();

    expect(savedInput?.links?.[0]).toMatchObject({
      insertInSubscriptionFlow: true,
      requiredInSubscriptionFlow: true,
      notifyOnPublish: false,
      allowLecturerManualPublish: false,
    });
  });
});
