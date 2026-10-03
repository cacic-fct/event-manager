import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
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
  let dialog: {
    open: ReturnType<typeof vi.fn>;
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
    dialog = {
      open: vi.fn(() => ({ afterClosed: () => of(true) })),
    };

    await TestBed.configureTestingModule({
      providers: [
        FormsService,
        ShellUiService,
        { provide: EventFormApiService, useValue: formApi },
        { provide: EventApiService, useValue: eventApi },
        { provide: MajorEventApiService, useValue: majorEventApi },
        { provide: MatSnackBar, useValue: { open: vi.fn() } },
        { provide: MatDialog, useValue: dialog },
        { provide: Router, useValue: router },
      ],
    }).compileComponents();

    service = TestBed.inject(FormsService);
  });

  it('disables live results until results are public and retains the selection', () => {
    const { resultsPublic, resultsLive } = service.form.controls;
    expect(resultsLive.disabled).toBe(true);

    resultsPublic.setValue(true);
    expect(resultsLive.enabled).toBe(true);
    resultsLive.setValue(true);

    resultsPublic.setValue(false);
    expect(resultsLive.disabled).toBe(true);
    expect(service.form.getRawValue().resultsLive).toBe(true);

    resultsPublic.setValue(true);
    expect(resultsLive.enabled).toBe(true);
    expect(resultsLive.value).toBe(true);

    service.form.reset();
    expect(resultsLive.disabled).toBe(true);
  });

  it('clears the previous scope inventory and pagination before loading another context', async () => {
    await service.loadForms();
    service.formsPagination.pageIndex.set(2);
    expect(service.forms().length).toBeGreaterThan(0);
    await service.setTargetFilter({ eventId: 'event-1' });
    expect(service.forms()).toEqual([]);
    expect(service.formsPagination.pageIndex()).toBe(0);
  });

  it('loads form targets, opens a form, and loads aggregate results', async () => {
    await service.initialize();

    expect(eventApi.listEvents).toHaveBeenCalledWith({ query: undefined, take: 20 });
    expect(majorEventApi.listMajorEvents).toHaveBeenCalledWith({ query: undefined, take: 20 });
    expect(formApi.listForms).toHaveBeenCalledWith({
      query: undefined,
      eventId: undefined,
      majorEventId: undefined,
      skip: 0,
      take: 51,
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

  it('preserves the event context in a selected form detail URL', async () => {
    await service.setTargetFilter({ eventId: 'event-1' });
    await service.initialize();
    await service.selectForm(service.forms()[0]);
    expect(router.navigate).toHaveBeenCalledWith(['/forms', 'form-1'], { queryParams: { eventId: 'event-1' } });
    expect(service.targetFilter()).toEqual({ eventId: 'event-1' });
  });

  it('selects forms by direct route id without rewriting the URL', async () => {
    await service.initialize();

    await service.selectFormById('form-1', { skipIfCurrent: true });

    expect(formApi.getForm).toHaveBeenCalledWith('form-1');
    expect(router.navigate).not.toHaveBeenCalled();
    expect(service.selectedForm()?.id).toBe('form-1');
  });

  it('restores the collection editor from history without adding a navigation', async () => {
    await service.selectFormById('form-1');
    expect(service.selectedForm()?.id).toBe('form-1');
    router.navigate.mockClear();
    await service.createForm(false);
    expect(service.selectedForm()).toBeNull();
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('keeps edits when starting a new form or selecting another form is cancelled', async () => {
    await service.selectFormById('form-1');
    service.form.controls.description.setValue('Descrição não salva');
    dialog.open.mockReturnValue({ afterClosed: () => of(false) });
    formApi.getForm.mockClear();
    await service.createForm();
    await service.selectForm(createAdminEventForm({ id: 'form-2' }));
    expect(service.form.controls.description.value).toBe('Descrição não salva');
    expect(service.selectedForm()?.id).toBe('form-1');
    expect(service.unsavedChanges()).toBe(true);
    expect(formApi.getForm).not.toHaveBeenCalled();
    expect(router.navigate).not.toHaveBeenCalled();
    expect(dialog.open).toHaveBeenCalledTimes(2);
  });

  it('starts a clean form only after discarding the previous edits', async () => {
    await service.selectFormById('form-1');
    service.form.controls.description.setValue('Descrição não salva');
    await service.createForm();
    expect(dialog.open).toHaveBeenCalledOnce();
    expect(service.selectedForm()).toBeNull();
    expect(service.form.controls.description.value).toBe('');
    expect(service.unsavedChanges()).toBe(false);
  });

  it('ignores delayed form selection after switching the event scope', async () => {
    await service.initialize();
    const pending = new Subject<ReturnType<typeof createAdminEventForm>>();
    formApi.getForm.mockReturnValueOnce(pending);
    const selection = service.selectForm(createAdminEventForm({ id: 'form-old' }));
    await service.setTargetFilter({ eventId: 'event-1' });
    pending.next(createAdminEventForm({ id: 'form-old', ownerEventId: 'event-old' }));
    pending.complete();
    await selection;
    expect(service.selectedForm()).toBeNull();
    expect(service.form.controls.ownerEventId.value).toBe('event-1');
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('keeps the latest selection when form details finish out of order', async () => {
    const pending = new Subject<ReturnType<typeof createAdminEventForm>>();
    formApi.getForm.mockReturnValueOnce(pending).mockReturnValueOnce(of(createAdminEventForm({ id: 'form-new' })));
    const oldSelection = service.selectFormById('form-old');
    await service.selectFormById('form-new');
    pending.next(createAdminEventForm({ id: 'form-old' }));
    pending.complete();
    expect(await oldSelection).toBe(false);
    expect(service.selectedForm()?.id).toBe('form-new');
  });

  it('preserves edits entered while another form is loading', async () => {
    const pending = new Subject<ReturnType<typeof createAdminEventForm>>();
    formApi.getForm.mockReturnValueOnce(pending);
    const selection = service.selectFormById('form-1');
    service.form.controls.description.setValue('Digitado durante a busca');
    pending.next(createAdminEventForm());
    pending.complete();
    expect(await selection).toBe(false);
    expect(service.form.controls.description.value).toBe('Digitado durante a busca');
  });

  it('ignores pending details when the form page is destroyed', async () => {
    const pending = new Subject<ReturnType<typeof createAdminEventForm>>();
    formApi.getForm.mockReturnValueOnce(pending);
    const selection = service.selectFormById('form-1');
    service.cancelPendingSelection();
    pending.next(createAdminEventForm());
    pending.complete();
    expect(await selection).toBe(false);
    expect(service.selectedForm()).toBeNull();
    expect(service.loading()).toBe(false);
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

  it('keeps the newest bounded context search when requests finish out of order', async () => {
    const staleResponse = new Subject<ReturnType<typeof createAdminEvent>[]>();
    const currentResponse = new Subject<ReturnType<typeof createAdminEvent>[]>();
    eventApi.listEvents.mockReturnValueOnce(staleResponse).mockReturnValueOnce(currentResponse);
    service.targetSearchForm.controls.query.setValue('antigo', { emitEvent: false });
    const staleSearch = service.loadTargets();
    service.targetSearchForm.controls.query.setValue('atual', { emitEvent: false });
    const currentSearch = service.loadTargets();

    currentResponse.next([createAdminEvent({ id: 'current-event', name: 'Atual' })]);
    currentResponse.complete();
    await currentSearch;
    staleResponse.next([createAdminEvent({ id: 'stale-event', name: 'Antigo' })]);
    staleResponse.complete();
    await staleSearch;

    expect(service.events().map((event) => event.id)).toEqual(['current-event']);
    expect(eventApi.listEvents).toHaveBeenLastCalledWith({ query: 'atual', take: 20 });
  });

  it('pages on the server without clearing an independently opened form', async () => {
    await service.initialize();
    await service.selectForm(service.forms()[0]);
    formApi.listForms.mockReturnValueOnce(of([]));
    service.formsPagination.pageIndex.set(1);

    await service.loadForms();

    expect(formApi.listForms).toHaveBeenLastCalledWith(
      expect.objectContaining({ skip: 50, take: 51 }),
    );
    expect(service.forms()).toEqual([]);
    expect(service.selectedForm()?.id).toBe('form-1');
  });

  it('clears an opened form when switching to a different operational context', async () => {
    await service.initialize();
    await service.selectForm(service.forms()[0]);

    await service.selectMajorEventScope(createAdminMajorEvent({ id: 'major-event-1' }));

    expect(service.targetFilter()).toEqual({ majorEventId: 'major-event-1' });
    expect(service.selectedForm()).toBeNull();
    expect(service.form.controls.ownerType.value).toBe('MAJOR_EVENT');
    expect(service.form.controls.ownerMajorEventId.value).toBe('major-event-1');
  });

  it('clears retained editor state when route parameters change the scope', async () => {
    await service.initialize();
    await service.selectForm(service.forms()[0]);

    await service.setTargetFilter({ majorEventId: 'major-event-1' });

    expect(service.selectedForm()).toBeNull();
    expect(service.form.controls.ownerMajorEventId.value).toBe('major-event-1');
  });

  it('keeps unsaved questions and links when a context change is cancelled', async () => {
    await service.initialize();
    await service.selectForm(service.forms()[0]);
    const originalElementCount = service.elements().length;
    const originalLinkCount = service.links().length;

    service.updateElements([
      ...service.elements(),
      {
        id: 'unsaved-question',
        type: 'shortText',
        title: 'Pergunta não salva',
        required: false,
        options: [],
      },
    ]);
    service.addLink('EVENT');
    expect(service.unsavedChanges()).toBe(true);

    dialog.open.mockReturnValueOnce({ afterClosed: () => of(false) });
    await expect(service.setTargetFilter({ majorEventId: 'major-event-1' })).resolves.toBe(false);

    expect(service.targetFilter()).toBeNull();
    expect(service.selectedForm()?.id).toBe('form-1');
    expect(service.elements()).toHaveLength(originalElementCount + 1);
    expect(service.links()).toHaveLength(originalLinkCount + 1);
    expect(service.unsavedChanges()).toBe(true);
  });

  it('discards the semantic editor state before changing context', async () => {
    await service.initialize();
    await service.selectForm(service.forms()[0]);
    const savedElementTitles = service.elements().map((element) => element.title);
    service.updateElements([]);
    service.addLink('EVENT');
    expect(service.unsavedChanges()).toBe(true);

    dialog.open.mockReturnValueOnce({ afterClosed: () => of(true) });
    await expect(service.setTargetFilter({ majorEventId: 'major-event-1' })).resolves.toBe(true);

    expect(service.targetFilter()).toEqual({ majorEventId: 'major-event-1' });
    expect(service.selectedForm()).toBeNull();
    expect(service.elements()).toEqual([]);
    expect(service.links()).toEqual([]);
    expect(service.unsavedChanges()).toBe(false);
    expect(savedElementTitles).not.toEqual(service.elements().map((element) => element.title));
  });

  it('clears the guard after a successful save and restores the saved state on discard', async () => {
    await service.initialize();
    await service.selectForm(service.forms()[0]);
    service.form.controls.name.setValue('Nome alterado');
    service.updateElements([]);
    expect(service.unsavedChanges()).toBe(true);

    await service.save();

    expect(service.unsavedChanges()).toBe(false);
    service.form.controls.name.setValue('Outra alteração');
    expect(service.unsavedChanges()).toBe(true);
    service.discardChanges();

    expect(service.form.controls.name.value).toBe('Nome alterado');
    expect(service.elements()).toEqual([]);
    expect(service.unsavedChanges()).toBe(false);
  });

  it('resets the semantic guard after saving a draft', async () => {
    await service.initialize();
    await service.selectForm(service.forms()[0]);
    service.addLink('EVENT');
    expect(service.unsavedChanges()).toBe(true);

    await service.saveDraft();

    expect(formApi.saveDraft).toHaveBeenCalledOnce();
    expect(service.unsavedChanges()).toBe(false);
  });

  it('ignores a late save response after a confirmed context change', async () => {
    await service.initialize();
    await service.selectForm(service.forms()[0]);
    service.form.controls.name.setValue('Alteração do evento antigo');
    const saveResponse = new Subject<ReturnType<typeof createAdminEventForm>>();
    formApi.saveForm.mockReturnValueOnce(saveResponse);

    const saving = service.save();
    await Promise.resolve();
    dialog.open.mockReturnValueOnce({ afterClosed: () => of(true) });
    await service.setTargetFilter({ majorEventId: 'major-event-1' });

    saveResponse.next(createAdminEventForm({ name: 'Resposta tardia do evento antigo' }));
    saveResponse.complete();
    await saving;

    expect(service.targetFilter()).toEqual({ majorEventId: 'major-event-1' });
    expect(service.selectedForm()).toBeNull();
    expect(service.form.controls.id.value).toBe('');
    expect(service.form.controls.name.value).toBe('');
    expect(service.unsavedChanges()).toBe(false);
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

  it('keeps the selected editor independent when the form is outside the current list result', async () => {
    await service.initialize();
    await service.selectForm(service.forms()[0]);
    formApi.listForms.mockReturnValueOnce(of([]));

    await service.loadForms();

    expect(service.forms()).toEqual([]);
    expect(service.selectedForm()?.id).toBe('form-1');
    expect(service.selectedResults()).not.toBeNull();
    expect(service.elements()).not.toEqual([]);
    expect(service.links()).not.toEqual([]);
    expect(service.form.controls.id.value).toBe('form-1');
    expect(service.form.controls.name.value).toBe('Pesquisa de camiseta');
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
      audiences: ['ATTENDEES'],
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
      audiences: ['ATTENDEES'],
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

  it('requires at least one audience on every form link', async () => {
    await service.initialize();
    await service.selectForm(service.forms()[0]);
    service.updateLink('form-link-1', { audiences: [] });

    await service.save();

    expect(formApi.saveForm).not.toHaveBeenCalled();
    expect(service.hasInvalidLinkAudiences()).toBe(true);
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
