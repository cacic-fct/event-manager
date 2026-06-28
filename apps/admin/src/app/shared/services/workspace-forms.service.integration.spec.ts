import { TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { of } from 'rxjs';
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
      allowLecturerManualPublish: true,
    });
    expect(service.selectedResults()?.responseCount).toBe(1);
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
    });

    await service.save();

    expect(formApi.saveForm).toHaveBeenCalledOnce();
    expect(savedInput).toMatchObject({
      id: 'form-1',
      name: 'Pesquisa atualizada',
      ownerEventId: null,
      ownerMajorEventId: 'major-event-1',
      sigilo: 'ANONYMOUS',
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
});
