import { isPlatformBrowser } from '@angular/common';
import { DestroyRef, PLATFORM_ID, Service, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, Validators } from '@angular/forms';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import {
  Event,
  MajorEvent,
  Person,
  PrizeDraw,
  PrizeDrawEligibleEntry,
  PrizeDrawExcludedPerson,
  PrizeDrawManualEntryInput,
  PrizeDrawPlannedSpinInput,
  PrizeDrawSpeed,
  PrizeDrawWinnerContact,
  SavePrizeDrawInput,
} from '@cacic-fct/event-manager-admin-contracts';
import { Subscription, firstValueFrom } from 'rxjs';
import { AdminFeedbackService } from '../feedback/admin-feedback.service';
import { EventApiService } from '../graphql/event-api.service';
import { MajorEventApiService } from '../graphql/major-event-api.service';
import { PeopleApiService } from '../graphql/people-api.service';
import { PrizeDrawApiService } from '../graphql/prize-draw-api.service';
import { RealtimeApiService } from '../graphql/realtime-api.service';
import { bindLiveSearch } from '../search/live-search';
import type { EventTargetSelection } from '../shared/event-target-picker.component';
import {
  applyPagedResult,
  createWorkspaceListPagination,
  loadNextPage,
  loadPreviousPage,
  pageVariables,
  resetPagination,
} from '../pagination/list-pagination';

@Service()
export class PrizeDrawWorkspaceService {
  private readonly api = inject(PrizeDrawApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly eventApi = inject(EventApiService);
  private readonly feedback = inject(AdminFeedbackService);
  private readonly formBuilder = inject(FormBuilder);
  private readonly majorEventApi = inject(MajorEventApiService);
  private readonly peopleApi = inject(PeopleApiService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly router = inject(Router);
  private readonly snackbar = inject(MatSnackBar);
  private readonly realtime = inject(RealtimeApiService);
  private selectionRequestGeneration = 0;
  private personSearchRequestGeneration = 0;
  private liveSubscription?: Subscription;
  private liveRefreshRunning = false;
  private liveRefreshQueued = false;
  private listRequestGeneration = 0;
  private targetRequestGeneration = 0;

  readonly loading = signal(false);
  readonly draws = signal<PrizeDraw[]>([]);
  readonly selected = signal<PrizeDraw | null>(null);
  readonly events = signal<Event[]>([]);
  readonly majorEvents = signal<MajorEvent[]>([]);
  readonly plannedSpins = signal<PrizeDrawPlannedSpinInput[]>([]);
  readonly manualEntries = signal<PrizeDrawManualEntryInput[]>([]);
  readonly weightOverrides = signal<Record<string, number>>({});
  readonly excludedPeople = signal<PrizeDrawExcludedPerson[]>([]);
  readonly eligibleEntries = signal<PrizeDrawEligibleEntry[]>([]);
  readonly personQuery = signal('');
  readonly personResults = signal<Person[]>([]);
  readonly personSearchLoading = signal(false);
  readonly contacts = signal<Record<string, PrizeDrawWinnerContact>>({});
  readonly contactLoadingSpinId = signal<string | null>(null);
  readonly reducedMotion = signal(false);
  readonly unsavedChanges = signal(false);
  readonly listFiltersForm = this.formBuilder.nonNullable.group({ query: [''] });
  readonly targetSearchForm = this.formBuilder.nonNullable.group({ query: [''] });
  readonly scopeFilter = signal<{ eventId?: string; majorEventId?: string } | null>(null);
  readonly drawsPagination = createWorkspaceListPagination();
  readonly targetSearchLoading = signal(false);
  readonly scopeFilterId = computed(() => {
    const filter = this.scopeFilter();
    return filter?.eventId ? `event:${filter.eventId}` : filter?.majorEventId ? `major-event:${filter.majorEventId}` : null;
  });
  readonly scopeFilterLabel = computed(() => {
    const filter = this.scopeFilter();
    if (filter?.eventId) return this.events().find((event) => event.id === filter.eventId)?.name ?? 'Evento selecionado';
    if (filter?.majorEventId) {
      return this.majorEvents().find((event) => event.id === filter.majorEventId)?.name ?? 'Grande evento selecionado';
    }
    return 'Todos os sorteios';
  });

  readonly form = this.formBuilder.nonNullable.group({
    title: ['', [Validators.required, Validators.pattern(/\S/), Validators.maxLength(160)]],
    description: ['', [Validators.maxLength(2000)]],
    targetType: ['EVENT' as 'EVENT' | 'MAJOR_EVENT'],
    eventId: [''],
    majorEventId: [''],
    includePresent: [true],
    includeSubscribers: [false],
    includeManualEntries: [false],
    chanceMode: ['EQUAL' as 'EQUAL' | 'WEIGHTED'],
    spinLimitEnabled: [false],
    spinLimit: [1, [Validators.min(1), Validators.max(1000)]],
    removeWinnerAfterDraw: [false],
    defaultSpeed: ['QUICK' as PrizeDrawSpeed],
    dramaticCountdownSeconds: [3 as 3 | 5],
    notifyWinner: [false],
  });
  private readonly formStatus = toSignal(this.form.statusChanges, { initialValue: this.form.status });
  private readonly formValue = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });
  private readonly selectedTargetSummary = signal<EventTargetSelection | null>(null);
  readonly targetSummary = computed(() => {
    this.formValue();
    const value = this.form.getRawValue();
    const id = value.targetType === 'EVENT' ? value.eventId : value.majorEventId;
    const summary = this.selectedTargetSummary();
    if (summary?.id === id) return summary;
    return (value.targetType === 'EVENT' ? this.events() : this.majorEvents()).find((target) => target.id === id) ?? null;
  });
  readonly canSave = computed(() => {
    this.formStatus();
    this.formValue();
    const value = this.form.getRawValue();
    const targetSelected = value.targetType === 'EVENT' ? Boolean(value.eventId) : Boolean(value.majorEventId);
    const hasEligibility = value.includePresent || value.includeSubscribers || value.includeManualEntries;
    const spinsValid = !value.spinLimitEnabled || this.plannedSpins().length === value.spinLimit;
    return this.form.valid && targetSelected && hasEligibility && spinsValid;
  });
  readonly activeSpins = computed(() => this.selected()?.spins.filter((spin) => !spin.undoneAt) ?? []);
  readonly includedEligibleEntries = computed(() => {
    const excludedIds = new Set(this.excludedPeople().map((person) => person.personId));
    return this.eligibleEntries().filter((entry) => !entry.personId || !excludedIds.has(entry.personId));
  });

  constructor() {
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.unsavedChanges.set(true));
    bindLiveSearch({
      control: this.listFiltersForm.controls.query,
      destroyRef: this.destroyRef,
      search: () => this.applyListFilters(),
    });
    bindLiveSearch({
      control: this.targetSearchForm.controls.query,
      destroyRef: this.destroyRef,
      search: () => this.loadTargets(),
    });
    if (isPlatformBrowser(this.platformId) && typeof matchMedia === 'function') {
      const query = matchMedia('(prefers-reduced-motion: reduce)');
      this.reducedMotion.set(query.matches);
      const listener = (event: MediaQueryListEvent) => this.reducedMotion.set(event.matches);
      query.addEventListener('change', listener);
      this.destroyRef.onDestroy(() => query.removeEventListener('change', listener));
    }
    this.liveSubscription = this.realtime.watchWorkspace().subscribe(() => void this.refreshFromRealtime());
    this.destroyRef.onDestroy(() => this.liveSubscription?.unsubscribe());
  }

  async initialize(drawId?: string | null): Promise<void> {
    const generation = ++this.selectionRequestGeneration;
    this.loading.set(true);
    try {
      await Promise.all([this.loadDraws(), this.loadTargets()]);
      if (generation !== this.selectionRequestGeneration) return;
      if (drawId && this.selected()?.id !== drawId) await this.selectById(drawId, false);
      else if (!drawId && !this.unsavedChanges()) this.createNew(false);
    } catch (error) {
      this.feedback.error(error, 'Não foi possível carregar os sorteios.');
    } finally {
      this.loading.set(false);
    }
  }

  private async refreshFromRealtime(): Promise<void> {
    if (this.liveRefreshRunning) {
      this.liveRefreshQueued = true;
      return;
    }
    this.liveRefreshRunning = true;
    try {
      do {
        this.liveRefreshQueued = false;
        const selectedId = this.selected()?.id;
        const selectionGeneration = this.selectionRequestGeneration;
        const hadUnsavedChanges = this.unsavedChanges();
        if (!(await this.loadDraws())) {
          throw new Error('Prize draw list refresh failed.');
        }
        if (
          !selectedId ||
          hadUnsavedChanges ||
          selectionGeneration !== this.selectionRequestGeneration ||
          this.selected()?.id !== selectedId ||
          this.unsavedChanges()
        ) {
          continue;
        }
        const requestGeneration = selectionGeneration;
        const draw = await firstValueFrom(this.api.get(selectedId));
        if (
          requestGeneration !== this.selectionRequestGeneration ||
          this.selected()?.id !== selectedId ||
          this.unsavedChanges()
        ) {
          continue;
        }
        this.patch(draw);
        await this.loadEligibleEntries(requestGeneration);
      } while (this.liveRefreshQueued);
    } catch {
      this.snackbar.open('Não foi possível aplicar uma atualização ao vivo.', 'Fechar', { duration: 4000 });
    } finally {
      this.liveRefreshRunning = false;
      if (this.liveRefreshQueued) {
        this.liveRefreshQueued = false;
        void this.refreshFromRealtime();
      }
    }
  }

  createNew(navigate = true): void {
    this.selectedTargetSummary.set(null);
    this.selectionRequestGeneration += 1;
    this.selected.set(null);
    this.plannedSpins.set([]);
    this.manualEntries.set([]);
    this.weightOverrides.set({});
    this.excludedPeople.set([]);
    this.eligibleEntries.set([]);
    this.contacts.set({});
    this.form.reset({
      title: '',
      description: '',
      targetType: this.scopeFilter()?.majorEventId ? 'MAJOR_EVENT' : 'EVENT',
      eventId: this.scopeFilter()?.eventId ?? '',
      majorEventId: this.scopeFilter()?.majorEventId ?? '',
      includePresent: true,
      includeSubscribers: false,
      includeManualEntries: false,
      chanceMode: 'EQUAL',
      spinLimitEnabled: false,
      spinLimit: 1,
      removeWinnerAfterDraw: false,
      defaultSpeed: 'QUICK',
      dramaticCountdownSeconds: 3,
      notifyWinner: false,
    });
    this.setEligibilityControlsDisabled(false);
    this.unsavedChanges.set(false);
    if (navigate) this.navigateToDraw();
  }

  discardChanges(): void {
    const saved = this.selected();
    if (saved) this.patch(saved);
    else this.createNew(false);
  }

  async select(draw: PrizeDraw): Promise<void> {
    await this.selectById(draw.id, true);
  }

  async selectById(drawId: string, navigate: boolean): Promise<void> {
    const requestGeneration = ++this.selectionRequestGeneration;
    this.loading.set(true);
    try {
      const draw = await firstValueFrom(this.api.get(drawId));
      if (requestGeneration !== this.selectionRequestGeneration) return;
      this.patch(draw);
      if (navigate) this.navigateToDraw(draw.id);
      await this.loadEligibleEntries(requestGeneration);
    } catch (error) {
      if (requestGeneration === this.selectionRequestGeneration) {
        this.feedback.error(error, 'Não foi possível abrir o sorteio.');
      }
    } finally {
      if (requestGeneration === this.selectionRequestGeneration) this.loading.set(false);
    }
  }

  updateTargetType(): void {
    this.selectedTargetSummary.set(null);
    if (this.form.controls.targetType.value === 'EVENT') this.form.controls.majorEventId.setValue('');
    else this.form.controls.eventId.setValue('');
  }

  selectTarget(target: EventTargetSelection): void {
    const type = this.form.controls.targetType.value;
    if (this.form.controls[type === 'EVENT' ? 'eventId' : 'majorEventId'].disabled) return;
    this.selectedTargetSummary.set(target);
    this.form.patchValue(type === 'EVENT' ? { eventId: target.id, majorEventId: '' } : { eventId: '', majorEventId: target.id });
  }

  async selectAllDraws(): Promise<void> {
    await this.changeScope(null);
  }

  async selectEventScope(event: Event): Promise<void> {
    await this.changeScope({ eventId: event.id });
  }

  async selectMajorEventScope(majorEvent: MajorEvent): Promise<void> {
    await this.changeScope({ majorEventId: majorEvent.id });
  }

  async applyListFilters(): Promise<void> {
    resetPagination(this.drawsPagination);
    await this.loadDraws();
  }

  async previousDrawsPage(): Promise<void> {
    await loadPreviousPage(this.drawsPagination, async () => {
      await this.loadDraws();
    });
  }

  async nextDrawsPage(): Promise<void> {
    await loadNextPage(this.drawsPagination, async () => {
      await this.loadDraws();
    });
  }

  updateSpinLimit(): void {
    const value = this.form.getRawValue();
    if (!value.spinLimitEnabled) {
      this.plannedSpins.set([]);
      return;
    }
    const count = Math.min(Math.max(Math.trunc(value.spinLimit || 1), 1), 1000);
    const existing = this.plannedSpins();
    this.plannedSpins.set(
      Array.from(
        { length: count },
        (_, index) =>
          existing[index] ?? {
            position: index + 1,
            description: '',
            speed: value.defaultSpeed,
            countdownSeconds: value.dramaticCountdownSeconds,
          },
      ).map((spin, index) => ({ ...spin, position: index + 1 })),
    );
  }

  updatePlannedSpin(index: number, patch: Partial<PrizeDrawPlannedSpinInput>): void {
    this.unsavedChanges.set(true);
    this.plannedSpins.update((spins) =>
      spins.map((spin, itemIndex) => (itemIndex === index ? { ...spin, ...patch } : spin)),
    );
  }

  addFreeEntry(name: string): void {
    const normalized = name.trim();
    if (!normalized) return;
    this.unsavedChanges.set(true);
    this.manualEntries.update((entries) => [...entries, { name: normalized, weight: 1 }]);
  }

  addPersonEntry(person: Person): void {
    if (this.manualEntries().some((entry) => entry.personId === person.id)) {
      this.snackbar.open('Esta pessoa já está nas entradas manuais.', 'Fechar', { duration: 3000 });
      return;
    }
    this.unsavedChanges.set(true);
    this.manualEntries.update((entries) => [...entries, { personId: person.id, name: person.name, weight: 1 }]);
    this.personQuery.set('');
    this.personResults.set([]);
  }

  removeManualEntry(index: number): void {
    this.unsavedChanges.set(true);
    this.manualEntries.update((entries) => entries.filter((_, itemIndex) => itemIndex !== index));
  }

  updateManualEntry(index: number, patch: Partial<PrizeDrawManualEntryInput>): void {
    this.unsavedChanges.set(true);
    this.manualEntries.update((entries) =>
      entries.map((entry, itemIndex) => (itemIndex === index ? { ...entry, ...patch } : entry)),
    );
  }

  async searchPeople(query: string): Promise<void> {
    const requestGeneration = ++this.personSearchRequestGeneration;
    this.personQuery.set(query);
    if (!query) {
      this.personResults.set([]);
      this.personSearchLoading.set(false);
      return;
    }
    this.personSearchLoading.set(true);
    try {
      const target = this.form.getRawValue();
      const people = await firstValueFrom(
        this.peopleApi.listRelatedPeople({
          query,
          take: 12,
          eventId: target.targetType === 'EVENT' ? target.eventId : undefined,
          majorEventId: target.targetType === 'MAJOR_EVENT' ? target.majorEventId : undefined,
        }),
      );
      if (requestGeneration === this.personSearchRequestGeneration) this.personResults.set(people);
    } catch (error) {
      if (requestGeneration === this.personSearchRequestGeneration) {
        this.feedback.error(error, 'Não foi possível buscar pessoas.');
      }
    } finally {
      if (requestGeneration === this.personSearchRequestGeneration) this.personSearchLoading.set(false);
    }
  }

  updateWeight(entry: PrizeDrawEligibleEntry, rawWeight: number): void {
    this.unsavedChanges.set(true);
    if (!entry.personId) {
      const manualIndex = this.manualEntries().findIndex((manual) => entry.identityKey === `manual:${manual.id}`);
      if (manualIndex >= 0) this.updateManualEntry(manualIndex, { weight: this.normalizeWeight(rawWeight) });
      return;
    }
    const personId = entry.personId;
    if (!personId) return;
    this.weightOverrides.update((overrides) => ({ ...overrides, [personId]: this.normalizeWeight(rawWeight) }));
    this.eligibleEntries.update((entries) =>
      entries.map((item) =>
        item.identityKey === entry.identityKey ? { ...item, weight: this.normalizeWeight(rawWeight) } : item,
      ),
    );
  }

  excludePerson(entry: PrizeDrawEligibleEntry): void {
    const personId = entry.personId;
    if (!personId || this.selected()?.frozenAt) return;
    if (this.excludedPeople().some((person) => person.personId === personId)) return;
    this.unsavedChanges.set(true);
    this.excludedPeople.update((people) =>
      [...people, { personId, displayName: entry.displayName }].sort((left, right) =>
        left.displayName.localeCompare(right.displayName, 'pt-BR'),
      ),
    );
    this.weightOverrides.update((overrides) =>
      Object.fromEntries(Object.entries(overrides).filter(([id]) => id !== personId)),
    );
  }

  restorePerson(personId: string): void {
    if (this.selected()?.frozenAt) return;
    this.unsavedChanges.set(true);
    this.excludedPeople.update((people) => people.filter((person) => person.personId !== personId));
  }

  async save(): Promise<void> {
    if (!this.canSave()) {
      this.form.markAllAsTouched();
      this.snackbar.open('Revise os campos obrigatórios antes de salvar.', 'Fechar', { duration: 3500 });
      return;
    }
    this.loading.set(true);
    try {
      const saved = await firstValueFrom(this.api.save(this.toInput()));
      this.patch(saved);
      await this.refreshList();
      await this.loadEligibleEntries();
      this.navigateToDraw(saved.id);
      this.snackbar.open('Configuração do sorteio salva.', 'Fechar', { duration: 3000 });
    } catch (error) {
      this.feedback.error(error, 'Não foi possível salvar o sorteio.');
    } finally {
      this.loading.set(false);
    }
  }

  async toggleFreeze(): Promise<void> {
    const draw = this.selected();
    if (!draw) return;
    this.loading.set(true);
    try {
      const updated = await firstValueFrom(draw.frozenAt ? this.api.unfreeze(draw.id) : this.api.freeze(draw.id));
      this.patch(updated);
      await this.refreshList();
      await this.loadEligibleEntries();
      this.snackbar.open(draw.frozenAt ? 'Lista descongelada.' : 'Lista de participantes congelada.', 'Fechar', {
        duration: 3000,
      });
    } catch (error) {
      this.feedback.error(error, 'Não foi possível alterar o congelamento da lista.');
    } finally {
      this.loading.set(false);
    }
  }

  async undoLast(): Promise<void> {
    const draw = this.selected();
    if (!draw) return;
    this.loading.set(true);
    try {
      const updated = await firstValueFrom(this.api.undoLast(draw.id));
      this.patch(updated);
      await this.refreshList();
      await this.loadEligibleEntries();
      this.snackbar.open('Último giro desfeito. O histórico de auditoria foi preservado.', 'Fechar', {
        duration: 4500,
      });
    } catch (error) {
      this.feedback.error(error, 'Não foi possível desfazer o último giro.');
    } finally {
      this.loading.set(false);
    }
  }

  async revealContact(spinId: string): Promise<void> {
    if (this.contacts()[spinId] || this.contactLoadingSpinId()) return;
    this.contactLoadingSpinId.set(spinId);
    try {
      const contact = await firstValueFrom(this.api.winnerContact(spinId));
      this.contacts.update((contacts) => ({ ...contacts, [spinId]: contact }));
    } catch (error) {
      this.feedback.error(error, 'Não foi possível exibir os dados de contato.');
    } finally {
      this.contactLoadingSpinId.set(null);
    }
  }

  sourceLabel(source: string): string {
    return { ATTENDANCE: 'Presença', SUBSCRIPTION: 'Inscrição', MANUAL: 'Manual' }[source] ?? source;
  }

  private patch(draw: PrizeDraw): void {
    this.selectedTargetSummary.set(null);
    this.selected.set(draw);
    if (draw.target.type === 'EVENT' && !this.events().some((event) => event.id === draw.target.id)) {
      this.events.update((events) => [{ id: draw.target.id, name: draw.target.name } as Event, ...events]);
    }
    if (draw.target.type === 'MAJOR_EVENT' && !this.majorEvents().some((event) => event.id === draw.target.id)) {
      this.majorEvents.update((events) => [{ id: draw.target.id, name: draw.target.name } as MajorEvent, ...events]);
    }
    this.plannedSpins.set(draw.plannedSpins.map((spin) => ({ ...spin })));
    this.manualEntries.set(draw.manualEntries.map((entry) => ({ ...entry })));
    this.weightOverrides.set(Object.fromEntries(draw.weightOverrides.map((entry) => [entry.personId, entry.weight])));
    this.excludedPeople.set(draw.excludedPeople.map((person) => ({ ...person })));
    this.contacts.set({});
    this.form.reset({
      title: draw.title,
      description: draw.description ?? '',
      targetType: draw.target.type,
      eventId: draw.target.type === 'EVENT' ? draw.target.id : '',
      majorEventId: draw.target.type === 'MAJOR_EVENT' ? draw.target.id : '',
      includePresent: draw.includePresent,
      includeSubscribers: draw.includeSubscribers,
      includeManualEntries: draw.includeManualEntries,
      chanceMode: draw.chanceMode,
      spinLimitEnabled: draw.spinLimit !== null && draw.spinLimit !== undefined,
      spinLimit: draw.spinLimit ?? 1,
      removeWinnerAfterDraw: draw.removeWinnerAfterDraw,
      defaultSpeed: draw.defaultSpeed,
      dramaticCountdownSeconds: draw.dramaticCountdownSeconds as 3 | 5,
      notifyWinner: draw.notifyWinner,
    });
    this.setEligibilityControlsDisabled(Boolean(draw.frozenAt));
    this.unsavedChanges.set(false);
  }

  private toInput(): SavePrizeDrawInput {
    const value = this.form.getRawValue();
    return {
      id: this.selected()?.id ?? null,
      title: value.title,
      description: value.description || null,
      targetType: value.targetType,
      eventId: value.targetType === 'EVENT' ? value.eventId : null,
      majorEventId: value.targetType === 'MAJOR_EVENT' ? value.majorEventId : null,
      includePresent: value.includePresent,
      includeSubscribers: value.includeSubscribers,
      includeManualEntries: value.includeManualEntries,
      chanceMode: value.chanceMode,
      spinLimit: value.spinLimitEnabled ? value.spinLimit : null,
      removeWinnerAfterDraw: value.removeWinnerAfterDraw,
      defaultSpeed: value.defaultSpeed,
      dramaticCountdownSeconds: value.dramaticCountdownSeconds,
      notifyWinner: value.notifyWinner,
      plannedSpins: value.spinLimitEnabled ? this.plannedSpins() : [],
      manualEntries: value.includeManualEntries ? this.manualEntries() : [],
      weightOverrides:
        value.chanceMode === 'WEIGHTED'
          ? Object.entries(this.weightOverrides()).map(([personId, weight]) => ({ personId, weight }))
          : [],
      excludedPersonIds: this.excludedPeople().map((person) => person.personId),
    };
  }

  private async loadEligibleEntries(selectionGeneration = this.selectionRequestGeneration): Promise<void> {
    const draw = this.selected();
    if (!draw) return;
    try {
      const entries = await firstValueFrom(this.api.eligibleEntries(draw.id));
      if (selectionGeneration !== this.selectionRequestGeneration || this.selected()?.id !== draw.id) return;
      this.eligibleEntries.set(entries);
    } catch (error) {
      if (selectionGeneration === this.selectionRequestGeneration && this.selected()?.id === draw.id) {
        this.feedback.error(error, 'Não foi possível atualizar a prévia de participantes.');
      }
    }
  }

  async loadTargets(): Promise<void> {
    const requestGeneration = ++this.targetRequestGeneration;
    this.targetSearchLoading.set(true);
    try {
      const query = this.targetSearchForm.controls.query.value.trim() || undefined;
      const [events, majorEvents] = await Promise.all([
        firstValueFrom(this.eventApi.listEvents({ query, take: 20 })),
        firstValueFrom(this.majorEventApi.listMajorEvents({ query, take: 20 })),
      ]);
      const value = this.form.getRawValue();
      const eventId = value.eventId || this.scopeFilter()?.eventId;
      const majorEventId = value.majorEventId || this.scopeFilter()?.majorEventId;
      const [scopedEvent, scopedMajorEvent] = await Promise.all([
        eventId && !events.some((event) => event.id === eventId)
          ? firstValueFrom(this.eventApi.getEvent(eventId)) : Promise.resolve(null),
        majorEventId && !majorEvents.some((event) => event.id === majorEventId)
          ? firstValueFrom(this.majorEventApi.getMajorEvent(majorEventId)) : Promise.resolve(null),
      ]);
      if (requestGeneration !== this.targetRequestGeneration) return;
      if (scopedEvent) events.unshift(scopedEvent);
      if (scopedMajorEvent) majorEvents.unshift(scopedMajorEvent);
      const selected = this.selected();
      const selectedEvent =
        selected?.target.type === 'EVENT' ? ({ id: selected.target.id, name: selected.target.name } as Event) : null;
      const selectedMajorEvent =
        selected?.target.type === 'MAJOR_EVENT'
          ? ({ id: selected.target.id, name: selected.target.name } as MajorEvent)
          : null;
      this.events.set(selectedEvent && !events.some((event) => event.id === selectedEvent.id) ? [selectedEvent, ...events] : events);
      this.majorEvents.set(
        selectedMajorEvent && !majorEvents.some((event) => event.id === selectedMajorEvent.id)
          ? [selectedMajorEvent, ...majorEvents]
          : majorEvents,
      );
    } catch (error) {
      if (requestGeneration === this.targetRequestGeneration) {
        this.feedback.error(error, 'Não foi possível buscar eventos para o sorteio.');
      }
    } finally {
      if (requestGeneration === this.targetRequestGeneration) this.targetSearchLoading.set(false);
    }
  }

  async loadDraws(): Promise<boolean> {
    const requestGeneration = ++this.listRequestGeneration;
    const context = this.listRequestContext();
    try {
      const draws = await firstValueFrom(this.api.list(context));
      if (requestGeneration !== this.listRequestGeneration || !this.isCurrentListContext(context)) return false;
      this.draws.set(applyPagedResult(draws, this.drawsPagination));
      return true;
    } catch (error) {
      if (requestGeneration === this.listRequestGeneration && this.isCurrentListContext(context)) {
        this.feedback.error(error, 'Não foi possível carregar os sorteios.');
      }
      return false;
    }
  }

  private async refreshList(): Promise<void> {
    await this.loadDraws();
  }

  private navigateToDraw(drawId?: string): void {
    const commands = drawId ? ['/draws', drawId] : ['/draws'];
    const scope = this.scopeFilter();
    if (scope) void this.router.navigate(commands, { queryParams: scope });
    else void this.router.navigate(commands);
  }

  async setScopeFromRoute(filter: { eventId?: string; majorEventId?: string } | null): Promise<boolean> {
    return this.changeScope(filter, false);
  }

  private async changeScope(filter: { eventId?: string; majorEventId?: string } | null, navigate = true): Promise<boolean> {
    const current = this.scopeFilter();
    if (current?.eventId === filter?.eventId && current?.majorEventId === filter?.majorEventId) return true;
    if (this.unsavedChanges()) {
      this.snackbar.open('Salve ou descarte as alterações antes de trocar o contexto.', 'Fechar', { duration: 3500 });
      return false;
    }
    this.scopeFilter.set(filter);
    this.draws.set([]);
    resetPagination(this.drawsPagination);
    this.createNew(false);
    await this.loadDraws();
    if (navigate) this.navigateToDraw();
    return true;
  }

  private listRequestContext(): {
    query?: string;
    eventId?: string;
    majorEventId?: string;
    skip: number;
    take: number;
  } {
    const filter = this.scopeFilter();
    return {
      query: this.listFiltersForm.controls.query.value.trim() || undefined,
      eventId: filter?.eventId,
      majorEventId: filter?.majorEventId,
      ...pageVariables(this.drawsPagination.pageIndex()),
    };
  }

  private isCurrentListContext(context: ReturnType<PrizeDrawWorkspaceService['listRequestContext']>): boolean {
    const current = this.listRequestContext();
    return (
      current.query === context.query &&
      current.eventId === context.eventId &&
      current.majorEventId === context.majorEventId &&
      current.skip === context.skip &&
      current.take === context.take
    );
  }

  private normalizeWeight(value: number): number {
    return Math.min(Math.max(Math.trunc(Number(value) || 1), 1), 10000);
  }

  private setEligibilityControlsDisabled(disabled: boolean): void {
    const controls = [
      this.form.controls.includePresent,
      this.form.controls.includeSubscribers,
      this.form.controls.includeManualEntries,
      this.form.controls.chanceMode,
    ];
    for (const control of controls) {
      if (disabled) control.disable({ emitEvent: false });
      else control.enable({ emitEvent: false });
    }
  }
}
