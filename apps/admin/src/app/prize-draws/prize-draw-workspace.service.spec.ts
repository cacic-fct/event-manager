import '@angular/compiler';
import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormBuilder } from '@angular/forms';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import type { Person, PrizeDraw, PrizeDrawEligibleEntry, PrizeDrawSpin } from '@cacic-fct/event-manager-admin-contracts';
import { Subject, of, throwError } from 'rxjs';
import { AdminFeedbackService } from '../feedback/admin-feedback.service';
import { EventApiService } from '../graphql/event-api.service';
import { MajorEventApiService } from '../graphql/major-event-api.service';
import { PeopleApiService } from '../graphql/people-api.service';
import { PrizeDrawApiService } from '../graphql/prize-draw-api.service';
import { PrizeDrawWorkspaceService } from './prize-draw-workspace.service';

const FIXTURE_TIMESTAMP = new Date().toISOString();

describe('PrizeDrawWorkspaceService', () => {
  let api: ReturnType<typeof apiMock>;
  let eventApi: { listEvents: ReturnType<typeof vi.fn> };
  let feedback: { error: ReturnType<typeof vi.fn> };
  let majorEventApi: { listMajorEvents: ReturnType<typeof vi.fn> };
  let peopleApi: { listRelatedPeople: ReturnType<typeof vi.fn> };
  let router: { navigate: ReturnType<typeof vi.fn> };
  let snackbar: { open: ReturnType<typeof vi.fn> };
  let service: PrizeDrawWorkspaceService;

  beforeEach(() => {
    api = apiMock();
    eventApi = { listEvents: vi.fn(() => of([{ id: 'event-1', name: 'Evento' }])) };
    feedback = { error: vi.fn() };
    majorEventApi = { listMajorEvents: vi.fn(() => of([{ id: 'major-1', name: 'Grande evento' }])) };
    peopleApi = { listRelatedPeople: vi.fn(() => of([])) };
    router = { navigate: vi.fn(() => Promise.resolve(true)) };
    snackbar = { open: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        FormBuilder,
        PrizeDrawWorkspaceService,
        { provide: PLATFORM_ID, useValue: 'server' },
        { provide: PrizeDrawApiService, useValue: api },
        { provide: EventApiService, useValue: eventApi },
        { provide: MajorEventApiService, useValue: majorEventApi },
        { provide: PeopleApiService, useValue: peopleApi },
        { provide: AdminFeedbackService, useValue: feedback },
        { provide: Router, useValue: router },
        { provide: MatSnackBar, useValue: snackbar },
      ],
    });
    service = TestBed.inject(PrizeDrawWorkspaceService);
  });

  it('loads all workspace reference data and creates a clean draft when no draw is selected', async () => {
    await service.initialize();

    expect(service.draws()).toEqual([expect.objectContaining({ id: 'draw-1' })]);
    expect(service.events()).toEqual([{ id: 'event-1', name: 'Evento' }]);
    expect(service.majorEvents()).toEqual([{ id: 'major-1', name: 'Grande evento' }]);
    expect(service.selected()).toBeNull();
    expect(service.unsavedChanges()).toBe(false);
    expect(service.loading()).toBe(false);
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('selects a draw, patches every editable collection, loads eligibility, and locks frozen controls', async () => {
    api.get.mockReturnValue(of(drawFixture({ frozenAt: FIXTURE_TIMESTAMP })));
    api.eligibleEntries.mockReturnValue(of([eligibleFixture()]));

    await service.selectById('draw-1', true);

    expect(service.selected()?.id).toBe('draw-1');
    expect(service.plannedSpins()).toHaveLength(1);
    expect(service.manualEntries()).toEqual([expect.objectContaining({ name: 'Convidada' })]);
    expect(service.weightOverrides()).toEqual({ 'person-1': 3 });
    expect(service.excludedPeople()).toEqual([{ personId: 'person-2', displayName: 'Grace Hopper' }]);
    expect(service.eligibleEntries()).toEqual([eligibleFixture()]);
    expect(service.form.controls.includePresent.disabled).toBe(true);
    expect(service.unsavedChanges()).toBe(false);
    expect(router.navigate).toHaveBeenCalledWith(['/draws', 'draw-1']);
  });

  it('keeps the newest draw and people-search result when requests resolve out of order', async () => {
    const firstDraw = new Subject<PrizeDraw>();
    const secondDraw = new Subject<PrizeDraw>();
    api.get.mockReturnValueOnce(firstDraw).mockReturnValueOnce(secondDraw);
    const firstSelection = service.selectById('draw-old', false);
    const secondSelection = service.selectById('draw-new', false);
    secondDraw.next(drawFixture({ id: 'draw-new', title: 'Novo' }));
    secondDraw.complete();
    firstDraw.next(drawFixture({ id: 'draw-old', title: 'Antigo' }));
    firstDraw.complete();
    await Promise.all([firstSelection, secondSelection]);
    expect(service.selected()?.id).toBe('draw-new');

    const firstPeople = new Subject<Person[]>();
    const secondPeople = new Subject<Person[]>();
    peopleApi.listRelatedPeople.mockReturnValueOnce(firstPeople).mockReturnValueOnce(secondPeople);
    const firstSearch = service.searchPeople('Ada');
    const secondSearch = service.searchPeople('Grace');
    secondPeople.next([personFixture({ id: 'person-2', name: 'Grace' })]);
    secondPeople.complete();
    firstPeople.next([personFixture()]);
    firstPeople.complete();
    await Promise.all([firstSearch, secondSearch]);
    expect(service.personQuery()).toBe('Grace');
    expect(service.personResults()).toEqual([expect.objectContaining({ id: 'person-2', name: 'Grace' })]);
  });

  it('maintains contiguous planned spins and normalizes manual and weighted entries', () => {
    service.form.patchValue({
      eventId: 'event-1',
      spinLimitEnabled: true,
      spinLimit: 2,
      defaultSpeed: 'DRAMATIC',
      dramaticCountdownSeconds: 5,
      includeManualEntries: true,
      chanceMode: 'WEIGHTED',
    });
    service.updateSpinLimit();
    expect(service.plannedSpins()).toEqual([
      { position: 1, description: '', speed: 'DRAMATIC', countdownSeconds: 5 },
      { position: 2, description: '', speed: 'DRAMATIC', countdownSeconds: 5 },
    ]);
    service.form.controls.spinLimit.setValue(1);
    service.updateSpinLimit();
    expect(service.plannedSpins().map((spin) => spin.position)).toEqual([1]);

    service.addFreeEntry('  Convidada  ');
    service.addPersonEntry(personFixture());
    service.addPersonEntry(personFixture({ name: 'Ada duplicada' }));
    expect(service.manualEntries()).toEqual([
      { name: 'Convidada', weight: 1 },
      { personId: 'person-1', name: 'Ada Lovelace', weight: 1 },
    ]);
    expect(snackbar.open).toHaveBeenCalledWith('Esta pessoa já está nas entradas manuais.', 'Fechar', { duration: 3000 });

    service.eligibleEntries.set([eligibleFixture()]);
    service.updateWeight(eligibleFixture(), 20_000.9);
    expect(service.weightOverrides()).toEqual({ 'person-1': 10000 });
    expect(service.eligibleEntries()[0].weight).toBe(10000);
  });

  it('sorts exclusions, removes their weight override, and will not mutate a frozen roster', () => {
    service.eligibleEntries.set([
      eligibleFixture(),
      eligibleFixture({ identityKey: 'person:person-2', personId: 'person-2', displayName: 'Bruno' }),
    ]);
    service.weightOverrides.set({ 'person-1': 3, 'person-2': 4 });
    service.excludePerson(service.eligibleEntries()[0]);
    service.excludePerson(service.eligibleEntries()[1]);

    expect(service.excludedPeople().map((person) => person.displayName)).toEqual(['Ada Lovelace', 'Bruno']);
    expect(service.weightOverrides()).toEqual({});
    expect(service.includedEligibleEntries()).toEqual([]);

    service.selected.set(drawFixture({ frozenAt: FIXTURE_TIMESTAMP }));
    service.restorePerson('person-1');
    expect(service.excludedPeople()).toHaveLength(2);
  });

  it('serializes only active configuration modes and refreshes all dependent state after save', async () => {
    service.form.patchValue({
      title: 'Novo sorteio',
      eventId: 'event-1',
      includeManualEntries: true,
      chanceMode: 'WEIGHTED',
      spinLimitEnabled: true,
      spinLimit: 1,
    });
    service.updateSpinLimit();
    service.addFreeEntry('Convidada');
    service.weightOverrides.set({ 'person-1': 4 });
    service.excludedPeople.set([{ personId: 'person-2', displayName: 'Grace Hopper' }]);
    api.save.mockReturnValue(of(drawFixture({ title: 'Novo sorteio' })));

    await service.save();

    expect(api.save).toHaveBeenCalledWith(expect.objectContaining({
      id: null,
      title: 'Novo sorteio',
      eventId: 'event-1',
      majorEventId: null,
      spinLimit: 1,
      plannedSpins: [expect.objectContaining({ position: 1 })],
      manualEntries: [{ name: 'Convidada', weight: 1 }],
      weightOverrides: [{ personId: 'person-1', weight: 4 }],
      excludedPersonIds: ['person-2'],
    }));
    expect(api.list).toHaveBeenCalledTimes(1);
    expect(api.eligibleEntries).toHaveBeenCalledWith('draw-1');
    expect(router.navigate).toHaveBeenCalledWith(['/draws', 'draw-1']);
    expect(snackbar.open).toHaveBeenCalledWith('Configuração do sorteio salva.', 'Fechar', { duration: 3000 });
  });

  it('does not call the API for invalid forms and reports async failures with actionable context', async () => {
    await service.save();
    expect(api.save).not.toHaveBeenCalled();
    expect(snackbar.open).toHaveBeenCalledWith(
      'Revise os campos obrigatórios antes de salvar.',
      'Fechar',
      { duration: 3500 },
    );

    api.list.mockReturnValue(throwError(() => new Error('offline')));
    await service.initialize();
    expect(feedback.error).toHaveBeenCalledWith(expect.any(Error), 'Não foi possível carregar os sorteios.');
    expect(service.loading()).toBe(false);
  });

  it('toggles freeze, undoes the last spin, and deduplicates protected contact requests', async () => {
    api.get.mockReturnValue(of(drawFixture()));
    await service.selectById('draw-1', false);
    api.freeze.mockReturnValue(of(drawFixture({ frozenAt: FIXTURE_TIMESTAMP })));
    await service.toggleFreeze();
    expect(api.freeze).toHaveBeenCalledWith('draw-1');
    expect(service.form.controls.includePresent.disabled).toBe(true);

    api.undoLast.mockReturnValue(of(drawFixture({
      spins: [spinFixture({ undoneAt: new Date(Date.now() + 60_000).toISOString() })],
    })));
    await service.undoLast();
    expect(api.undoLast).toHaveBeenCalledWith('draw-1');
    expect(service.activeSpins()).toEqual([]);

    const contact = { spinId: 'spin-1', fullName: 'Ada Lovelace', email: 'ada@example.com' };
    api.winnerContact.mockReturnValue(of(contact));
    await service.revealContact('spin-1');
    await service.revealContact('spin-1');
    expect(api.winnerContact).toHaveBeenCalledOnce();
    expect(service.contacts()).toEqual({ 'spin-1': contact });
  });
});

function apiMock() {
  return {
    list: vi.fn(() => of([drawFixture()])),
    get: vi.fn(() => of(drawFixture())),
    save: vi.fn(() => of(drawFixture())),
    eligibleEntries: vi.fn(() => of<PrizeDrawEligibleEntry[]>([])),
    freeze: vi.fn(() => of(drawFixture())),
    unfreeze: vi.fn(() => of(drawFixture())),
    undoLast: vi.fn(() => of(drawFixture())),
    winnerContact: vi.fn(() => of({ spinId: 'spin-1', fullName: 'Ada Lovelace' })),
  };
}

function personFixture(patch: Partial<Person> = {}): Person {
  return {
    id: 'person-1',
    name: 'Ada Lovelace',
    createdAt: FIXTURE_TIMESTAMP,
    updatedAt: FIXTURE_TIMESTAMP,
    ...patch,
  };
}

function eligibleFixture(patch: Partial<PrizeDrawEligibleEntry> = {}): PrizeDrawEligibleEntry {
  return {
    identityKey: 'person:person-1',
    personId: 'person-1',
    displayName: 'Ada Lovelace',
    weight: 3,
    sources: ['ATTENDANCE'],
    ...patch,
  };
}

function drawFixture(patch: Partial<PrizeDraw> = {}): PrizeDraw {
  return {
    id: 'draw-1',
    title: 'Sorteio',
    description: null,
    target: { type: 'EVENT', id: 'event-1', name: 'Evento' },
    includePresent: true,
    includeSubscribers: false,
    includeManualEntries: true,
    chanceMode: 'WEIGHTED',
    spinLimit: 1,
    removeWinnerAfterDraw: true,
    defaultSpeed: 'QUICK',
    dramaticCountdownSeconds: 3,
    notifyWinner: true,
    frozenAt: null,
    unfrozenAt: null,
    revision: 1,
    plannedSpins: [{ id: 'planned-1', position: 1, description: 'Prêmio', speed: 'QUICK', countdownSeconds: null }],
    manualEntries: [{ id: 'manual-1', personId: null, name: 'Convidada', weight: 2 }],
    weightOverrides: [{ personId: 'person-1', weight: 3 }],
    excludedPeople: [{ personId: 'person-2', displayName: 'Grace Hopper' }],
    spins: [spinFixture()],
    eligibleEntrantCount: 2,
    eligibleTotalWeight: 4,
    eligibleDuplicateEntryCount: 2,
    createdAt: FIXTURE_TIMESTAMP,
    updatedAt: FIXTURE_TIMESTAMP,
    ...patch,
  };
}

function spinFixture(patch: Partial<PrizeDrawSpin> = {}): PrizeDrawSpin {
  return {
      id: 'spin-1',
      sequence: 1,
      speed: 'QUICK',
      chanceMode: 'WEIGHTED',
      removeWinnerAfterDraw: true,
      winnerDisplayName: 'Ada Lovelace',
      winnerPersonId: 'person-1',
      winnerWeight: 3,
      entrantCount: 2,
      totalWeight: 4,
      duplicateEntryCount: 2,
      weightBreakdown: [{ weight: 1, peopleCount: 1 }, { weight: 3, peopleCount: 1 }],
      drawnAt: FIXTURE_TIMESTAMP,
      undoneAt: null,
      notificationStatus: 'SENT',
    ...patch,
  };
}
