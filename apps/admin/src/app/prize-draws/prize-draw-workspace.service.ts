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
import { firstValueFrom } from 'rxjs';
import { AdminFeedbackService } from '../feedback/admin-feedback.service';
import { EventApiService } from '../graphql/event-api.service';
import { MajorEventApiService } from '../graphql/major-event-api.service';
import { PeopleApiService } from '../graphql/people-api.service';
import { PrizeDrawApiService } from '../graphql/prize-draw-api.service';

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
  readonly canSave = computed(() => {
    this.formStatus();
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
    if (isPlatformBrowser(this.platformId) && typeof matchMedia === 'function') {
      const query = matchMedia('(prefers-reduced-motion: reduce)');
      this.reducedMotion.set(query.matches);
      const listener = (event: MediaQueryListEvent) => this.reducedMotion.set(event.matches);
      query.addEventListener('change', listener);
      this.destroyRef.onDestroy(() => query.removeEventListener('change', listener));
    }
  }

  async initialize(drawId?: string | null): Promise<void> {
    this.loading.set(true);
    try {
      const [draws, events, majorEvents] = await Promise.all([
        firstValueFrom(this.api.list()),
        firstValueFrom(this.eventApi.listEvents({ take: 500 })),
        firstValueFrom(this.majorEventApi.listMajorEvents({ take: 500 })),
      ]);
      this.draws.set(draws);
      this.events.set(events);
      this.majorEvents.set(majorEvents);
      if (drawId) await this.selectById(drawId, false);
      else if (!this.selected()) this.createNew(false);
    } catch (error) {
      this.feedback.error(error, 'Não foi possível carregar os sorteios.');
    } finally {
      this.loading.set(false);
    }
  }

  createNew(navigate = true): void {
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
      targetType: 'EVENT',
      eventId: '',
      majorEventId: '',
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
    if (navigate) void this.router.navigate(['/draws']);
  }

  async select(draw: PrizeDraw): Promise<void> {
    await this.selectById(draw.id, true);
  }

  async selectById(drawId: string, navigate: boolean): Promise<void> {
    this.loading.set(true);
    try {
      const draw = await firstValueFrom(this.api.get(drawId));
      this.patch(draw);
      if (navigate) void this.router.navigate(['/draws', draw.id]);
      await this.loadEligibleEntries();
    } catch (error) {
      this.feedback.error(error, 'Não foi possível abrir o sorteio.');
    } finally {
      this.loading.set(false);
    }
  }

  updateTargetType(): void {
    if (this.form.controls.targetType.value === 'EVENT') this.form.controls.majorEventId.setValue('');
    else this.form.controls.eventId.setValue('');
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
      Array.from({ length: count }, (_, index) =>
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
    this.plannedSpins.update((spins) => spins.map((spin, itemIndex) => itemIndex === index ? { ...spin, ...patch } : spin));
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
    this.manualEntries.update((entries) => entries.map((entry, itemIndex) => itemIndex === index ? { ...entry, ...patch } : entry));
  }

  async searchPeople(query: string): Promise<void> {
    this.personQuery.set(query);
    if (!query) {
      this.personResults.set([]);
      return;
    }
    this.personSearchLoading.set(true);
    try {
      this.personResults.set(await firstValueFrom(this.peopleApi.listPeopleSummaries({ query, take: 12 })));
    } catch (error) {
      this.feedback.error(error, 'Não foi possível buscar pessoas.');
    } finally {
      this.personSearchLoading.set(false);
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
      entries.map((item) => item.identityKey === entry.identityKey ? { ...item, weight: this.normalizeWeight(rawWeight) } : item),
    );
  }

  excludePerson(entry: PrizeDrawEligibleEntry): void {
    const personId = entry.personId;
    if (!personId || this.selected()?.frozenAt) return;
    if (this.excludedPeople().some((person) => person.personId === personId)) return;
    this.unsavedChanges.set(true);
    this.excludedPeople.update((people) =>
      [...people, { personId, displayName: entry.displayName }].sort(
        (left, right) => left.displayName.localeCompare(right.displayName, 'pt-BR'),
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
      void this.router.navigate(['/draws', saved.id]);
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
      this.snackbar.open(draw.frozenAt ? 'Lista descongelada.' : 'Lista de participantes congelada.', 'Fechar', { duration: 3000 });
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
      this.snackbar.open('Último giro desfeito. O histórico de auditoria foi preservado.', 'Fechar', { duration: 4500 });
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
    this.selected.set(draw);
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
      weightOverrides: value.chanceMode === 'WEIGHTED'
        ? Object.entries(this.weightOverrides()).map(([personId, weight]) => ({ personId, weight }))
        : [],
      excludedPersonIds: this.excludedPeople().map((person) => person.personId),
    };
  }

  private async loadEligibleEntries(): Promise<void> {
    const draw = this.selected();
    if (!draw) return;
    try {
      this.eligibleEntries.set(await firstValueFrom(this.api.eligibleEntries(draw.id)));
    } catch (error) {
      this.feedback.error(error, 'Não foi possível atualizar a prévia de participantes.');
    }
  }

  private async refreshList(): Promise<void> {
    this.draws.set(await firstValueFrom(this.api.list()));
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
