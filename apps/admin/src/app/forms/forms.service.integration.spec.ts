import { TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { FakeEventSource, installFakeEventSource } from '@cacic-fct/shared-angular/testing';
import { of, Subject, throwError } from 'rxjs';
import { EventApiService } from '../graphql/event-api.service';
import { EventFormApiService } from '../graphql/event-form-api.service';
import { MajorEventApiService } from '../graphql/major-event-api.service';
import {
  createAdminEvent,
  createAdminEventForm,
  createAdminEventFormFromInput,
  createAdminEventFormResults,
  createAdminMajorEvent,
} from '../testing/admin-entity-fixtures';
import { type EventFormInput } from '@cacic-fct/event-manager-admin-contracts';
import type { FormImage } from '@cacic-fct/form-contracts';
import { FormsService } from './forms.service';
import { ShellUiService } from '../app-shell/ui.service';
import { flushAsync } from '../testing/async-test-helpers';

describe('FormsService integration', () => {
  let service: FormsService;
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
    previousSubscriberCount: ReturnType<typeof vi.fn>;
  };
  let eventApi: {
    listEvents: ReturnType<typeof vi.fn>;
  };
  let majorEventApi: {
    listMajorEvents: ReturnType<typeof vi.fn>;
  };
  let router: {
    navigate: ReturnType<typeof vi.fn>;
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
      previousSubscriberCount: vi.fn(() => of(0)),
    };
    eventApi = {
      listEvents: vi.fn(() => of([event])),
    };
    majorEventApi = {
      listMajorEvents: vi.fn(() => of([majorEvent])),
    };
    router = {
      navigate: vi.fn(),
    };

    await TestBed.configureTestingModule({
      providers: [
        FormsService,
        ShellUiService,
        { provide: EventFormApiService, useValue: formApi },
        { provide: EventApiService, useValue: eventApi },
        { provide: MajorEventApiService, useValue: majorEventApi },
        { provide: MatSnackBar, useValue: { open: vi.fn() } },
        { provide: Router, useValue: router },
      ],
    }).compileComponents();

    service = TestBed.inject(FormsService);
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
    expect(router.navigate).toHaveBeenCalledWith(['/forms', 'form-1']);
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

  it('selects forms by direct route id without rewriting the URL', async () => {
    await service.initialize();

    await service.selectFormById('form-1', { skipIfCurrent: true });

    expect(formApi.getForm).toHaveBeenCalledWith('form-1');
    expect(router.navigate).not.toHaveBeenCalled();
    expect(service.selectedForm()?.id).toBe('form-1');
  });

  it('ignores stale form list responses and keeps the latest search context', async () => {
    const staleResponse = new Subject<ReturnType<typeof createAdminEventForm>[]>();
    const currentResponse = new Subject<ReturnType<typeof createAdminEventForm>[]>();
    const staleForm = createAdminEventForm({ id: 'stale-form', name: 'Resultado antigo' });
    const currentForm = createAdminEventForm({ id: 'current-form', name: 'Resultado atual' });
    formApi.listForms.mockImplementationOnce(() => staleResponse).mockImplementationOnce(() => currentResponse);

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

  it('preserves edits made while an image removal is being saved', async () => {
    const image = {
      id: 'image-1',
      url: '/api/event-form-images/image-1',
      width: 1200,
      height: 675,
      altText: 'Mapa do evento',
    } satisfies FormImage;
    const draftForm = createAdminEventForm({ publicationState: 'DRAFT', descriptionImages: [image] });
    formApi.listForms.mockReturnValue(of([draftForm]));
    formApi.getForm.mockReturnValue(of(draftForm));
    await service.initialize();
    await service.selectForm(service.forms()[0]);
    const saveResponse = new Subject<ReturnType<typeof createAdminEventForm>>();
    formApi.saveForm.mockImplementationOnce((input: EventFormInput) => {
      savedInput = input;
      return saveResponse;
    });

    const removal = service.removeImage(image);
    service.form.controls.name.setValue('Nome editado durante o salvamento');
    if (!savedInput) throw new Error('Expected the image removal to start saving the form.');
    saveResponse.next(createAdminEventFormFromInput(savedInput));
    saveResponse.complete();
    await removal;

    expect(service.form.controls.name.value).toBe('Nome editado durante o salvamento');
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

  it('reloads private selected results from the admin live result stream', async () => {
    const restoreEventSource = installFakeEventSource();
    const privateForm = createAdminEventForm({
      id: 'form-1',
      ownerEventId: 'event-1',
      resultsPublic: false,
      resultsLive: false,
    });
    formApi.listForms.mockReturnValue(of([privateForm]));
    formApi.getForm.mockReturnValue(of(privateForm));

    try {
      await service.initialize();
      await service.selectForm(privateForm);

      const source = FakeEventSource.instances[0] as FakeEventSource;
      expect(source.url).toBe('/api/event-forms/form-1/results/events');
      expect(source.init).toEqual({ withCredentials: true });

      formApi.results.mockClear();
      source.emitMessage();
      await new Promise((resolve) => setTimeout(() => resolve(undefined)));

      expect(formApi.results).toHaveBeenCalledWith('form-1');
    } finally {
      restoreEventSource();
    }
  });

  it('coalesces private result invalidations and reconciles response counts without resetting a draft', async () => {
    const restoreEventSource = installFakeEventSource();
    const privateForm = createAdminEventForm({
      id: 'form-1',
      ownerEventId: 'event-1',
      resultsPublic: false,
      resultsLive: false,
    });
    formApi.listForms.mockReturnValue(of([privateForm]));
    formApi.getForm.mockReturnValue(of(privateForm));

    try {
      await service.initialize();
      await service.selectForm(privateForm);
      const source = FakeEventSource.instances[0] as FakeEventSource;
      const refreshedResults = createAdminEventFormResults({ form: privateForm, responseCount: 4 });
      formApi.results.mockClear();
      formApi.results.mockReturnValue(of(refreshedResults));
      service.form.controls.name.setValue('Rascunho local');

      source.emitMessage();
      source.emitMessage();
      source.emitMessage();
      await flushAsync();

      expect(formApi.results).toHaveBeenCalledOnce();
      expect(service.selectedResults()?.responseCount).toBe(4);
      expect(service.selectedForm()?.responseCount).toBe(4);
      expect(service.forms()[0]?.responseCount).toBe(4);
      expect(service.form.controls.name.value).toBe('Rascunho local');
    } finally {
      restoreEventSource();
    }
  });

  it('keeps the last good results while recovering a terminal result stream', async () => {
    const restoreEventSource = installFakeEventSource();
    const privateForm = createAdminEventForm({ id: 'form-1', resultsPublic: false, resultsLive: false });
    formApi.listForms.mockReturnValue(of([privateForm]));
    formApi.getForm.mockReturnValue(of(privateForm));

    try {
      await service.initialize();
      await service.selectForm(privateForm);
      const previousResults = service.selectedResults();
      const firstSource = FakeEventSource.instances[0] as FakeEventSource;
      formApi.results.mockClear();
      formApi.results.mockReturnValueOnce(throwError(() => new Error('Sessão indisponível')));

      firstSource.readyState = FakeEventSource.CLOSED;
      firstSource.emitError();
      await flushAsync();

      expect(service.selectedResults()).toEqual(previousResults);
      expect(formApi.results).toHaveBeenCalledOnce();
      expect(FakeEventSource.instances).toHaveLength(2);
    } finally {
      restoreEventSource();
    }
  });

  it('closes the live result stream when the selected form is no longer live', async () => {
    const restoreEventSource = installFakeEventSource();
    const liveForm = createAdminEventForm({
      id: 'form-1',
      ownerEventId: 'event-1',
      resultsPublic: true,
      resultsLive: true,
    });
    const nonLiveForm = createAdminEventForm({
      id: 'form-2',
      ownerEventId: 'event-1',
      resultsPublic: true,
      resultsLive: false,
    });
    formApi.listForms.mockReturnValue(of([liveForm]));
    formApi.getForm.mockImplementation((id: string) => of(id === liveForm.id ? liveForm : nonLiveForm));

    try {
      await service.initialize();
      await service.selectForm(liveForm);
      const source = FakeEventSource.instances[0] as FakeEventSource;

      await service.selectForm(nonLiveForm);

      expect(source.close).toHaveBeenCalledOnce();
    } finally {
      restoreEventSource();
    }
  });

  it('clears a terminal live result stream without attempting a manual second close', async () => {
    const restoreEventSource = installFakeEventSource();
    const liveForm = createAdminEventForm({
      id: 'form-1',
      ownerEventId: 'event-1',
      resultsPublic: true,
      resultsLive: true,
    });
    formApi.listForms.mockReturnValue(of([liveForm]));
    formApi.getForm.mockReturnValue(of(liveForm));

    try {
      await service.initialize();
      await service.selectForm(liveForm);
      const source = FakeEventSource.instances[0] as FakeEventSource;

      source.readyState = FakeEventSource.CLOSED;
      source.emitError();
      service.closeResultsStream();

      expect(source.close).toHaveBeenCalledOnce();
    } finally {
      restoreEventSource();
    }
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
      allowResponseEdits: true,
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
      allowResponseEdits: true,
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
      notifyOnPublish: true,
      allowLecturerManualPublish: false,
    });
  });

  it('saves a major-event form for one or more selected tiered prices', async () => {
    const tieredMajorEvent = createAdminMajorEvent({
      id: 'major-event-1',
      name: 'Semana da Computação',
      majorEventPrices: [
        {
          id: 'price-1',
          type: 'TIERED',
          tiers: [
            { id: 'tier-student', name: 'Aluno', value: 4000, includesSportsRegistration: false },
            { id: 'tier-professor', name: 'Professor', value: 6000, includesSportsRegistration: false },
          ],
        },
      ],
    });
    majorEventApi.listMajorEvents.mockReturnValue(of([tieredMajorEvent]));
    await service.initialize();
    await service.selectForm(service.forms()[0]);

    service.updateLink('form-link-1', {
      targetType: 'MAJOR_EVENT',
      eventId: null,
      majorEventId: 'major-event-1',
      insertInSubscriptionFlow: true,
      priceTierIds: ['tier-student', 'tier-professor'],
    });
    expect(service.priceTiersForLink(service.links()[0]).map((tier) => tier.id)).toEqual([
      'tier-student',
      'tier-professor',
    ]);
    await service.save();

    expect(savedInput?.links?.[0]).toMatchObject({
      targetType: 'MAJOR_EVENT',
      majorEventId: 'major-event-1',
      insertInSubscriptionFlow: true,
      priceTierIds: ['tier-student', 'tier-professor'],
    });
  });

  it('ignores a stale previous-subscriber count after the link target changes', async () => {
    await service.initialize();
    await service.selectForm(service.forms()[0]);
    const staleResponse = new Subject<number>();
    formApi.previousSubscriberCount.mockClear();
    formApi.previousSubscriberCount.mockImplementationOnce(() => staleResponse).mockImplementationOnce(() => of(7));

    service.updateLink('form-link-1', { displayOrder: 1 });
    service.updateLink('form-link-1', {
      targetType: 'MAJOR_EVENT',
      eventId: null,
      majorEventId: 'major-event-1',
    });
    await Promise.resolve();
    staleResponse.next(99);
    staleResponse.complete();
    await Promise.resolve();

    expect(service.previousSubscriberCount(service.links()[0])).toBe(7);
  });

  it('ignores a stale previous-subscriber count after the link identity or subscription-flow settings change', async () => {
    await service.initialize();
    await service.selectForm(service.forms()[0]);
    const staleResponse = new Subject<number>();
    formApi.previousSubscriberCount.mockClear();
    formApi.previousSubscriberCount.mockImplementationOnce(() => staleResponse);

    service.updateLink('form-link-1', { displayOrder: 1 });
    service.updateLink('form-link-1', {
      id: 'updated-link-id',
      insertInSubscriptionFlow: false,
      requiredInSubscriptionFlow: false,
    });
    staleResponse.next(99);
    staleResponse.complete();
    await Promise.resolve();

    expect(service.previousSubscriberCount(service.links()[0])).toBeNull();
  });
});
