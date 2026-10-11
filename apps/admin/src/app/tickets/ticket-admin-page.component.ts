import { WorkspacePendingChangesService } from '../app-shell/workspace-pending-changes.service';
import { RealtimeApiService } from '../graphql/realtime-api.service';
import { DatePipe } from '@angular/common';
import { Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormArray, FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog } from '@angular/material/dialog';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTabsModule } from '@angular/material/tabs';
import { Permission } from '@cacic-fct/shared-permissions';
import { TwemojiComponent } from '@cacic-fct/shared-angular';
import type { Event, MajorEventPriceTier } from '@cacic-fct/event-manager-admin-contracts';
import {
  TicketExpirationMode,
  TicketLifecycleState,
  TicketSubscriptionRequirement,
  type AdminEventTicket,
  type AdminEventTicketList,
  type AdminTicketConfig,
  type TicketConfigInput,
  type TicketPriceOption,
} from '@cacic-fct/shared-ticketing';
import { debounceTime, distinctUntilChanged, firstValueFrom, merge } from 'rxjs';
import { EventApiService } from '../graphql/event-api.service';
import { MajorEventApiService } from '../graphql/major-event-api.service';
import { TicketAdminApiService } from '../graphql/ticket-admin-api.service';
import { AdminFeedbackService } from '../feedback/admin-feedback.service';
import { getErrorMessage } from '../feedback/error-message';
import { PermissionsService } from '../permissions/permissions.service';
import { EventContextPickerComponent, type EventContextRef } from '../shared/event-context-picker.component';
import { TicketAdminPersonActionDialogComponent, type TicketAdminPersonActionData } from './ticket-admin-person-action-dialog.component';
import { TicketAdminReasonDialogComponent } from './ticket-admin-reason-dialog.component';
import { TicketHistoryDialogComponent } from './ticket-history-dialog.component';
import { AdminRouteResourceErrorService } from '../shared/admin-route-resource-error.service';

interface EventWorkspaceSummary {
  id: string;
  name: string;
  emoji: string;
  startDate: string;
  endDate: string;
  majorEventId: string | null;
}

interface TicketPriceRowControls {
  id: FormControl<string>;
  priceTierId: FormControl<string>;
  label: FormControl<string>;
  amount: FormControl<string>;
}

type TicketPriceRow = FormGroup<TicketPriceRowControls>;

@Component({
  selector: 'app-ticket-admin-page',
  imports: [
    DatePipe,
    EventContextPickerComponent,
    MatButtonModule,
    MatCardModule,
    MatCheckboxModule,
    MatChipsModule,
    MatDividerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatListModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatTabsModule,
    ReactiveFormsModule,
    RouterLink,
    TwemojiComponent,
  ],
  templateUrl: './ticket-admin-page.component.html',
  styleUrls: [
    '../app-shell/layout/workspace-tabs.shared.scss',
    './ticket-admin-page.component.scss',
  ],
})
export class TicketAdminPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly formBuilder = inject(FormBuilder);
  private readonly api = inject(TicketAdminApiService);
  private readonly realtime = inject(RealtimeApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly pendingChanges = inject(WorkspacePendingChangesService);
  private readonly pendingRegistration = this.pendingChanges.register();
  private liveRequest = 0;
  private readonly eventsApi = inject(EventApiService);
  private readonly majorEventsApi = inject(MajorEventApiService);
  private readonly dialog = inject(MatDialog);
  private readonly snackbar = inject(MatSnackBar);
  private readonly feedback = inject(AdminFeedbackService);
  private readonly routeResourceErrors = inject(AdminRouteResourceErrorService);
  protected readonly permissions = inject(PermissionsService);

  private readonly routeScope = signal({
    eventId: this.route.snapshot.paramMap.get('eventId'),
    majorEventId: this.route.snapshot.paramMap.get('majorEventId'),
  });
  private get routeEventId() { return this.routeScope().eventId; }
  private get routeMajorEventId() { return this.routeScope().majorEventId; }
  private listRequest = 0;
  private configRequest = 0;
  protected readonly cursorHistory = signal<(string | null)[]>([null]);

  protected readonly isMajorScope = computed(() => Boolean(this.routeMajorEventId));
  protected readonly eventSummary = signal<EventWorkspaceSummary | null>(null);
  protected readonly majorEventName = signal('');
  protected readonly configs = signal<AdminTicketConfig[]>([]);
  protected readonly selectedConfig = signal<AdminTicketConfig | null>(null);
  protected readonly priceTiers = signal<MajorEventPriceTier[]>([]);
  protected readonly ticketPage = signal<AdminEventTicketList>({ tickets: [], nextCursor: null, totalCount: 0 });
  protected readonly loading = signal(true);
  protected readonly configLoading = signal(false);
  protected readonly ticketsLoading = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly configError = signal<string | null>(null);
  protected readonly operationError = signal<string | null>(null);
  protected readonly ticketsError = signal<string | null>(null);
  protected readonly priceMode = new FormControl<'SINGLE' | 'PER_TIER'>('SINGLE', { nonNullable: true });
  protected readonly singlePrice = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.min(0.01)],
  });
  protected readonly priceRows = new FormArray<TicketPriceRow>([]);
  protected readonly ticketSearch = new FormControl('', { nonNullable: true });
  protected readonly ticketStatus = new FormControl<TicketLifecycleState | 'ALL'>('ALL', { nonNullable: true });
  protected readonly expirationModeOptions = [
    { value: TicketExpirationMode.EventEnd, label: 'No fim do evento' },
    { value: TicketExpirationMode.Custom, label: 'Em uma data personalizada' },
  ];
  protected readonly subscriptionRequirementOptions = [
    { value: TicketSubscriptionRequirement.Any, label: 'Com ou sem inscrição' },
    { value: TicketSubscriptionRequirement.Required, label: 'Somente pessoas inscritas' },
    { value: TicketSubscriptionRequirement.None, label: 'Somente pessoas sem inscrição' },
  ];
  protected readonly courseOptions = [
    { code: '12', label: 'Ciência da Computação' },
  ];
  protected readonly ticketStatuses = [
    { value: TicketLifecycleState.Active, label: 'Ativo' },
    { value: TicketLifecycleState.Consumed, label: 'Utilizado' },
    { value: TicketLifecycleState.Revoked, label: 'Revogado' },
    { value: TicketLifecycleState.Expired, label: 'Expirado' },
    { value: TicketLifecycleState.Unavailable, label: 'Indisponível' },
  ];

  protected readonly configForm = this.formBuilder.nonNullable.group({
    enabled: false,
    displayName: this.formBuilder.nonNullable.control('', [Validators.required, Validators.maxLength(120)]),
    displayEmoji: '',
    description: '',
    transferEligibilityDescription: '',
    transferable: true,
    issueOnEventSubscription: false,
    issueOnMajorEventSubscription: false,
    includedPriceTierIds: this.formBuilder.nonNullable.control<string[]>([]),
    recipientPolicy: this.createPolicyGroup(),
    purchaseEnabled: false,
    purchaseUnlimited: true,
    purchaseLimit: this.formBuilder.nonNullable.control({ value: 100, disabled: true }, [
      Validators.required, Validators.min(1), Validators.max(2_147_483_647), Validators.pattern(/^\d+$/),
    ]),
    purchaseVisibility: this.createPolicyGroup(),
    expirationMode: this.formBuilder.nonNullable.control<TicketExpirationMode>(TicketExpirationMode.EventEnd),
    customExpiresAt: this.formBuilder.nonNullable.control('', Validators.required),
  });

  protected readonly eventId = computed(() => this.routeEventId ?? this.selectedConfig()?.eventId ?? null);
  protected readonly majorEventId = computed(() =>
    this.routeMajorEventId ?? this.eventSummary()?.majorEventId ?? this.selectedConfig()?.majorEventId ?? null,
  );
  protected readonly canEditConfig = computed(() =>
    this.permissions.has(this.selectedConfig() ? Permission.TicketConfig.Update : Permission.TicketConfig.Create),
  );
  protected readonly canReadTickets = computed(() => this.permissions.has(Permission.Ticket.Read));
  protected readonly canIssueTickets = computed(() => this.permissions.has(Permission.Ticket.Issue));
  protected readonly canIssueSelectedConfig = computed(() =>
    this.canIssueTickets() && this.selectedConfig()?.enabled === true,
  );
  protected readonly canRevokeTickets = computed(() => this.permissions.has(Permission.Ticket.Revoke));
  protected readonly canManageTransfers = computed(() => this.permissions.has(Permission.TicketTransfer.Manage));
  protected readonly canReadHistory = computed(() => this.permissions.has(Permission.TicketTransfer.Read));
  protected readonly majorParentContext = computed(() =>
    this.routeMajorEventId ? { kind: 'major-event' as const, id: this.routeMajorEventId } : null,
  );
  constructor() {
    this.destroyRef.onDestroy(() => this.pendingRegistration.destroy());
    merge(this.configForm.events, this.priceMode.events, this.singlePrice.events, this.priceRows.events)
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.pendingRegistration.set(this.hasUnsavedChanges()));
    effect((onCleanup) => {
      const eventId = this.eventId();
      if (!eventId) return;
      const subscription = this.realtime.watchEventTickets(eventId)
        .pipe(debounceTime(150))
        .subscribe(() => void this.refreshLiveEvent(eventId));
      onCleanup(() => subscription.unsubscribe());
    });
    merge(
      this.configForm.controls.purchaseUnlimited.valueChanges,
      this.configForm.controls.purchaseEnabled.valueChanges,
    ).pipe(takeUntilDestroyed()).subscribe(() => {
      const controls = this.configForm.controls;
      if (controls.purchaseUnlimited.value || !controls.purchaseEnabled.value) controls.purchaseLimit.disable();
      else controls.purchaseLimit.enable();
    });
    this.configForm.controls.expirationMode.valueChanges.pipe(takeUntilDestroyed()).subscribe((mode) => {
      const expiry = this.configForm.controls.customExpiresAt;
      if (mode === TicketExpirationMode.Custom) expiry.addValidators(Validators.required);
      else expiry.removeValidators(Validators.required);
      expiry.updateValueAndValidity({ emitEvent: false });
    });
    this.ticketSearch.valueChanges
      .pipe(debounceTime(320), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe(() => this.resetTicketPage());
    this.ticketStatus.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.resetTicketPage());
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const next = { eventId: params.get('eventId'), majorEventId: params.get('majorEventId') };
      if (next.eventId === this.routeEventId && next.majorEventId === this.routeMajorEventId) return;
      this.routeScope.set(next);
      this.selectedConfig.set(null);
      this.eventSummary.set(null);
      this.configs.set([]);
      this.cursorHistory.set([null]);
      this.liveRequest += 1;
      this.listRequest += 1;
      void this.loadInitialData();
    });
    void this.loadInitialData();
  }

  protected eventContextChanged(context: EventContextRef): void {
    void this.router.navigate(['/tickets', context.kind, context.id]);
  }

  protected isTicketEnabled(): boolean {
    return this.configForm.controls.enabled.value;
  }

  protected isPurchaseEnabled(): boolean {
    return this.configForm.controls.purchaseEnabled.value;
  }

  protected isTransferable(): boolean {
    return this.configForm.controls.transferable.value;
  }

  protected isCustomExpiry(): boolean {
    return this.configForm.controls.expirationMode.value === TicketExpirationMode.Custom;
  }

  protected canSaveConfig(): boolean {
    if (!this.canEditConfig() || this.saving() || this.configForm.invalid || !this.configForm.controls.displayName.value.trim()) return false;
    if (this.selectedConfig() && !this.hasUnsavedChanges()) return false;
    if (this.isCustomExpiry() && !this.configForm.controls.customExpiresAt.value) return false;
    if (!this.isPurchaseEnabled()) return true;
    if (this.priceMode.value === 'SINGLE') return this.singlePrice.valid && this.priceInCents(this.singlePrice.value) !== null;
    const rowsValid = this.priceRows.length > 0 && this.priceRows.controls.every((row) =>
      Boolean(row.controls.priceTierId.value) && this.priceInCents(row.controls.amount.value) !== null,
    );
    if (!rowsValid) return false;
    const visibleTierIds = this.configForm.controls.purchaseVisibility.controls.allowedPriceTierIds.value;
    const coveredTierIds = new Set(this.priceRows.controls.map((row) => row.controls.priceTierId.value));
    const requiredTierIds = visibleTierIds.length ? visibleTierIds : this.priceTiers().map((tier) => tier.id);
    return requiredTierIds.length > 0 && requiredTierIds.every((tierId) => coveredTierIds.has(tierId));
  }

  protected isPriceTierAlreadySelected(tierId: string, currentIndex: number): boolean {
    return this.priceRows.controls.some((row, index) => index !== currentIndex && row.controls.priceTierId.value === tierId);
  }

  protected hasUnsavedChanges(): boolean {
    return this.configForm.dirty || this.priceMode.dirty || this.singlePrice.dirty || this.priceRows.dirty;
  }

  protected priceTierLabel(id: string): string {
    return this.priceTiers().find((tier) => tier.id === id)?.name ?? id;
  }

  protected async selectConfig(config: AdminTicketConfig): Promise<void> {
    if (this.saving()) return;
    await this.pendingChanges.navigate(async () => {
      this.liveRequest += 1;
      this.selectedConfig.set(config);
      this.eventSummary.set({
        id: config.event.id,
        name: config.event.name,
        emoji: config.event.emoji,
        startDate: config.event.startsAt,
        endDate: config.event.endsAt,
        majorEventId: config.majorEventId,
      });
      this.populateForm(config);
      void this.loadPriceTiers(config.majorEventId);
      await this.resetTicketPage();
      return true;
    });
  }

  protected async saveConfig(): Promise<void> {
    const eventId = this.eventId();
    if (!eventId || !this.canSaveConfig()) return;

    this.saving.set(true);
    this.configError.set(null);
    this.operationError.set(null);
    try {
      const input = this.buildConfigInput(eventId);
      const saved = await firstValueFrom(this.api.saveConfig(input));
      this.configs.update((items) => [...items.filter((item) => item.eventId !== saved.eventId), saved]);
      this.selectedConfig.set(saved);
      this.populateForm(saved);
      this.snackbar.open('Configuração de bilhetes salva.', 'Fechar', { duration: 3000 });
      await this.resetTicketPage();
    } catch (error) {
      this.configError.set(getErrorMessage(error, 'Não foi possível salvar a configuração dos bilhetes.'));
      this.feedback.showErrorMessage(this.configError() ?? 'Não foi possível salvar a configuração dos bilhetes.');
    } finally {
      this.saving.set(false);
    }
  }

  protected addPriceOption(): void {
    const used = new Set(this.priceRows.controls.map((row) => row.controls.priceTierId.value));
    const nextTier = this.priceTiers().find((tier) => !used.has(tier.id));
    if (!nextTier) return;
    this.priceRows.push(this.createPriceRow(nextTier, null));
    this.priceRows.markAsDirty();
  }

  protected removePriceOption(index: number): void {
    this.priceRows.removeAt(index);
    this.priceRows.markAsDirty();
  }

  protected async openManualIssue(): Promise<void> {
    const eventId = this.eventId();
    const config = this.selectedConfig();
    if (!eventId || !config?.enabled || !this.canIssueTickets()) return;
    await this.openPersonActionDialog({
      action: 'ISSUE',
      eventId,
      eventName: config.event.name,
      ticketName: config.displayName || config.event.name,
    });
  }

  protected async openAdminTransfer(ticket: AdminEventTicket): Promise<void> {
    if (!this.canManageTransfers()) return;
    await this.openPersonActionDialog({
      action: 'TRANSFER',
      eventId: ticket.eventId,
      ticketId: ticket.id,
      eventName: ticket.event.name,
      ticketName: ticket.name,
      holderName: ticket.holder?.fullName ?? 'titular atual',
    });
  }

  protected async revoke(ticket: AdminEventTicket): Promise<void> {
    if (!this.canRevokeTickets()) return;
    this.operationError.set(null);
    const reference = this.dialog.open(TicketAdminReasonDialogComponent, {
      width: 'min(28rem, calc(100vw - 2rem))',
      maxWidth: 'calc(100vw - 2rem)',
      data: { title: 'Revogar bilhete', actionLabel: 'Revogar bilhete', description: `O bilhete de ${ticket.holder?.fullName ?? 'titular atual'} deixará de ser válido. Registre o motivo para auditoria.` },
    });
    const reason = await firstValueFrom(reference.afterClosed());
    if (typeof reason !== 'string' || !reason.trim()) return;

    this.saving.set(true);
    try {
      await firstValueFrom(this.api.revokeTicket({ ticketId: ticket.id, reason: reason.trim() }));
      this.snackbar.open('Bilhete revogado.', 'Fechar', { duration: 3000 });
      await this.loadTickets(this.cursorHistory().at(-1) ?? null);
    } catch (error) {
      this.showError(error, 'Não foi possível revogar o bilhete.');
    } finally {
      this.saving.set(false);
    }
  }

  protected async showHistory(ticket: AdminEventTicket): Promise<void> {
    if (!this.canReadHistory()) return;
    this.operationError.set(null);
    try {
      const history = await firstValueFrom(this.api.getHistory(ticket.id));
      this.dialog.open(TicketHistoryDialogComponent, {
        width: 'min(48rem, calc(100vw - 2rem))',
        maxWidth: 'calc(100vw - 2rem)',
        data: { ticket, history },
      });
    } catch (error) {
      this.showError(error, 'Não foi possível carregar o histórico deste bilhete.');
    }
  }

  protected ticketStatusLabel(status: TicketLifecycleState): string {
    return {
      [TicketLifecycleState.Active]: 'Ativo',
      [TicketLifecycleState.Consumed]: 'Utilizado',
      [TicketLifecycleState.Revoked]: 'Revogado',
      [TicketLifecycleState.Expired]: 'Expirado',
      [TicketLifecycleState.Unavailable]: 'Indisponível',
    }[status];
  }

  protected nextTicketPage(): void {
    const cursor = this.ticketPage().nextCursor;
    if (!cursor) return;
    this.cursorHistory.update((history) => [...history, cursor]);
    void this.loadTickets(cursor);
  }

  protected retryTicketPage(): void {
    void this.loadTickets(this.cursorHistory().at(-1) ?? null);
  }

  protected previousTicketPage(): void {
    if (this.cursorHistory().length <= 1) return;
    const nextHistory = this.cursorHistory().slice(0, -1);
    this.cursorHistory.set(nextHistory);
    void this.loadTickets(nextHistory.at(-1) ?? null);
  }

  private async refreshLiveEvent(eventId: string): Promise<void> {
    if (eventId !== this.eventId()) return;
    const request = ++this.liveRequest;
    await this.loadTickets(this.cursorHistory().at(-1) ?? null);
    if (request !== this.liveRequest || eventId !== this.eventId() || this.hasUnsavedChanges() || this.saving()) return;
    try {
      const configs = await firstValueFrom(this.api.getConfigs({ eventId }));
      if (request !== this.liveRequest || eventId !== this.eventId() || this.hasUnsavedChanges() || this.saving()) return;
      const current = configs.find((config) => config.eventId === eventId) ?? null;
      this.selectedConfig.set(current);
      this.configs.update((previous) => [...previous.filter((config) => config.eventId !== eventId), ...configs]);
      this.populateForm(current);
    } catch {
      // The holder list has its own visible retry state; keep the current editor.
    }
  }

  private async loadInitialData(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    const request = ++this.configRequest;
    try {
      if (this.routeEventId) {
        const [configs, event] = await Promise.all([
          firstValueFrom(this.api.getConfigs({ eventId: this.routeEventId })),
          firstValueFrom(this.eventsApi.getEvent(this.routeEventId)),
        ]);
        if (request !== this.configRequest) return;
        this.eventSummary.set(this.eventSummaryFrom(event));
        this.configs.set(configs);
        const config = configs.find((candidate) => candidate.eventId === this.routeEventId) ?? null;
        this.selectedConfig.set(config);
        await this.loadPriceTiers(event.majorEventId ?? null, request);
        if (request !== this.configRequest) return;
        this.populateForm(config);
        await this.resetTicketPage();
      } else if (this.routeMajorEventId) {
        const [configs, majorEvent] = await Promise.all([
          firstValueFrom(this.api.getConfigs({ majorEventId: this.routeMajorEventId })),
          firstValueFrom(this.majorEventsApi.getMajorEvent(this.routeMajorEventId)),
        ]);
        if (request !== this.configRequest) return;
        this.configs.set(configs);
        this.majorEventName.set(majorEvent.name);
        this.priceTiers.set(majorEvent.majorEventPrices.flatMap((price) => price.tiers));
      }
    } catch (error) {
      if (request === this.configRequest && !this.routeResourceErrors.redirectIfUnavailable(error)) {
        this.error.set(getErrorMessage(error, 'Não foi possível carregar os bilhetes deste contexto.'));
        this.feedback.showErrorMessage(this.error() ?? 'Não foi possível carregar os bilhetes deste contexto.');
      }
    } finally {
      if (request === this.configRequest) this.loading.set(false);
    }
  }

  private async loadPriceTiers(majorEventId: string | null, request = this.configRequest): Promise<void> {
    if (!majorEventId) {
      this.priceTiers.set([]);
      return;
    }
    try {
      const majorEvent = await firstValueFrom(this.majorEventsApi.getMajorEvent(majorEventId));
      if (request === this.configRequest) this.priceTiers.set(majorEvent.majorEventPrices.flatMap((price) => price.tiers));
    } catch {
      if (request === this.configRequest) this.priceTiers.set([]);
    }
  }

  private async loadTickets(cursor: string | null): Promise<void> {
    const eventId = this.eventId();
    if (!eventId || !this.canReadTickets()) {
      this.ticketPage.set({ tickets: [], nextCursor: null, totalCount: 0 });
      return;
    }
    const request = ++this.listRequest;
    this.ticketsLoading.set(true);
    this.ticketsError.set(null);
    try {
      const status = this.ticketStatus.value === 'ALL' ? null : this.ticketStatus.value;
      const page = await firstValueFrom(this.api.getEventTickets({
        eventId,
        status,
        search: this.ticketSearch.value.trim() || undefined,
        take: 50,
        cursor: cursor ?? undefined,
      }));
      if (request === this.listRequest) this.ticketPage.set(page);
    } catch (error) {
      if (request === this.listRequest) this.ticketsError.set(getErrorMessage(error, 'Não foi possível carregar os bilhetes.'));
    } finally {
      if (request === this.listRequest) this.ticketsLoading.set(false);
    }
  }

  private resetTicketPage(): Promise<void> {
    this.cursorHistory.set([null]);
    return this.loadTickets(null);
  }

  private populateForm(config: AdminTicketConfig | null): void {
    const context = this.eventSummary();
    const defaultPolicy = {
      subscriptionRequirement: TicketSubscriptionRequirement.Any,
      requiresUnesp: false,
      requiredAcademicIdPrefixes: '',
      requiredCourseCodes: [] as string[],
      requiresAccountManagerVerification: false,
      allowedPriceTierIds: [] as string[],
    };
    const recipientPolicy = config?.recipientPolicy;
    const purchaseVisibility = config?.purchaseVisibility;
    this.configForm.setValue({
      enabled: config?.enabled ?? false,
      displayName: config?.displayName ?? context?.name ?? '',
      displayEmoji: config?.displayEmoji ?? context?.emoji ?? '',
      description: config?.description ?? '',
      transferEligibilityDescription: config?.transferEligibilityDescription ?? '',
      transferable: config?.transferable ?? true,
      issueOnEventSubscription: config?.issueOnEventSubscription ?? false,
      issueOnMajorEventSubscription: config?.issueOnMajorEventSubscription ?? false,
      includedPriceTierIds: [...(config?.includedPriceTierIds ?? [])],
      recipientPolicy: {
        subscriptionRequirement: recipientPolicy?.subscriptionRequirement ?? defaultPolicy.subscriptionRequirement,
        requiresUnesp: recipientPolicy?.requiresUnesp ?? defaultPolicy.requiresUnesp,
        requiredAcademicIdPrefixes: (recipientPolicy?.requiredAcademicIdPrefixes ?? []).join('\n'),
        requiredCourseCodes: [...(recipientPolicy?.requiredCourseCodes ?? [])],
        requiresAccountManagerVerification: recipientPolicy?.requiresAccountManagerVerification ?? defaultPolicy.requiresAccountManagerVerification,
        allowedPriceTierIds: [...(recipientPolicy?.allowedPriceTierIds ?? [])],
      },
      purchaseEnabled: config?.purchaseEnabled ?? false,
      purchaseUnlimited: config?.purchaseLimit == null,
      purchaseLimit: config?.purchaseLimit ?? 100,
      purchaseVisibility: {
        subscriptionRequirement: TicketSubscriptionRequirement.Required,
        requiresUnesp: purchaseVisibility?.requiresUnesp ?? defaultPolicy.requiresUnesp,
        requiredAcademicIdPrefixes: (purchaseVisibility?.requiredAcademicIdPrefixes ?? []).join('\n'),
        requiredCourseCodes: [...(purchaseVisibility?.requiredCourseCodes ?? [])],
        requiresAccountManagerVerification: purchaseVisibility?.requiresAccountManagerVerification ?? defaultPolicy.requiresAccountManagerVerification,
        allowedPriceTierIds: [...(purchaseVisibility?.allowedPriceTierIds ?? [])],
      },
      expirationMode: config?.expirationMode ?? TicketExpirationMode.EventEnd,
      customExpiresAt: config?.customExpiresAt ? this.toLocalDateTime(config.customExpiresAt) : '',
    });
    const customExpiry = this.configForm.controls.customExpiresAt;
    if (this.configForm.controls.expirationMode.value === TicketExpirationMode.Custom) {
      customExpiry.addValidators(Validators.required);
    } else {
      customExpiry.removeValidators(Validators.required);
    }
    customExpiry.updateValueAndValidity({ emitEvent: false });

    const priceOptions = config?.priceOptions ?? [];
    const tierOptions = priceOptions.filter((option) => option.priceTierId !== null);
    const singleOption = priceOptions.find((option) => option.priceTierId === null);
    this.priceMode.setValue(tierOptions.length > 0 ? 'PER_TIER' : 'SINGLE', { emitEvent: false });
    this.singlePrice.setValue(singleOption ? (singleOption.amountCents / 100).toFixed(2) : '', { emitEvent: false });
    this.priceRows.clear();
    for (const option of tierOptions) {
      const tier = this.priceTiers().find((candidate) => candidate.id === option.priceTierId);
      if (tier) this.priceRows.push(this.createPriceRow(tier, option));
    }
    this.configForm.markAsPristine();
    this.priceMode.markAsPristine();
    this.singlePrice.markAsPristine();
    this.priceRows.markAsPristine();
  }

  private buildConfigInput(eventId: string): TicketConfigInput {
    const value = this.configForm.getRawValue();
    const customExpiresAt = value.expirationMode === TicketExpirationMode.Custom
      ? new Date(value.customExpiresAt).toISOString()
      : null;
    return {
      eventId,
      enabled: value.enabled,
      displayName: value.displayName.trim() || null,
      displayEmoji: value.displayEmoji.trim() || null,
      description: value.description.trim() || null,
      transferEligibilityDescription: value.transferEligibilityDescription.trim() || null,
      transferable: value.transferable,
      issueOnEventSubscription: value.issueOnEventSubscription,
      issueOnMajorEventSubscription: value.issueOnMajorEventSubscription && Boolean(this.majorEventId()),
      includedPriceTierIds: value.issueOnMajorEventSubscription ? [...value.includedPriceTierIds] : [],
      recipientPolicy: this.policyFromForm(value.recipientPolicy),
      purchaseEnabled: value.purchaseEnabled && value.enabled && Boolean(this.majorEventId()),
      purchaseLimit: value.purchaseUnlimited || !value.purchaseEnabled ? null : value.purchaseLimit,
      purchaseVisibility: {
        ...this.policyFromForm(value.purchaseVisibility),
        subscriptionRequirement: TicketSubscriptionRequirement.Required,
        requiresValidatedSubscription: true,
      },
      priceOptions: this.buildPriceOptions(),
      expirationMode: value.expirationMode,
      customExpiresAt,
    };
  }

  private buildPriceOptions(): TicketPriceOption[] {
    if (this.priceMode.value === 'PER_TIER') {
      return this.priceRows.getRawValue().flatMap((row) => {
        const amount = this.priceInCents(row.amount);
        return row.priceTierId && amount !== null
          ? [{ id: row.id || `ticket-tier-${row.priceTierId}`, priceTierId: row.priceTierId, label: row.label, amountCents: amount }]
          : [];
      });
    }
    const amountCents = this.priceInCents(this.singlePrice.value);
    return amountCents === null ? [] : [{
      id: this.selectedConfig()?.priceOptions.find((option) => option.priceTierId === null)?.id ?? `ticket-price-${this.eventId()}`,
      priceTierId: null,
      label: 'Preço único',
      amountCents,
    }];
  }

  private priceInCents(value: string): number | null {
    if (!value.trim()) return null;
    const amount = Number(value.replace(',', '.'));
    const amountCents = Math.round(amount * 100);
    return Number.isSafeInteger(amountCents) && amountCents > 0 ? amountCents : null;
  }

  private policyFromForm(value: {
    subscriptionRequirement: TicketSubscriptionRequirement;
    requiresUnesp: boolean;
    requiredAcademicIdPrefixes: string;
    requiredCourseCodes: string[];
    requiresAccountManagerVerification: boolean;
    allowedPriceTierIds: string[];
  }) {
    return {
      subscriptionRequirement: value.subscriptionRequirement,
      requiresUnesp: value.requiresUnesp,
      requiredAcademicIdPrefixes: [...new Set(value.requiredAcademicIdPrefixes.split(/[\n,;]/).map((item) => item.trim()).filter(Boolean))],
      requiredCourseCodes: [...value.requiredCourseCodes],
      requiresAccountManagerVerification: value.requiresAccountManagerVerification,
      allowedPriceTierIds: [...value.allowedPriceTierIds],
    };
  }

  private createPriceRow(tier: MajorEventPriceTier, option: TicketPriceOption | null): TicketPriceRow {
    return this.formBuilder.nonNullable.group({
      id: option?.id ?? `ticket-tier-${tier.id}`,
      priceTierId: tier.id,
      label: option?.label ?? tier.name,
      amount: this.formBuilder.nonNullable.control(
        option ? (option.amountCents / 100).toFixed(2) : '',
        [Validators.required, Validators.min(0.01)],
      ),
    }) as TicketPriceRow;
  }

  private createPolicyGroup() {
    return this.formBuilder.nonNullable.group({
      subscriptionRequirement: this.formBuilder.nonNullable.control<TicketSubscriptionRequirement>(TicketSubscriptionRequirement.Any),
      requiresUnesp: false,
      requiredAcademicIdPrefixes: '',
      requiredCourseCodes: this.formBuilder.nonNullable.control<string[]>([]),
      requiresAccountManagerVerification: false,
      allowedPriceTierIds: this.formBuilder.nonNullable.control<string[]>([]),
    });
  }

  private eventSummaryFrom(event: Event): EventWorkspaceSummary {
    return {
      id: event.id,
      name: event.name,
      emoji: event.emoji,
      startDate: event.startDate,
      endDate: event.endDate,
      majorEventId: event.majorEventId ?? null,
    };
  }

  private toLocalDateTime(value: string): string {
    const date = new Date(value);
    const offset = date.getTimezoneOffset() * 60_000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 16);
  }

  private async openPersonActionDialog(data: TicketAdminPersonActionData): Promise<void> {
    const reference = this.dialog.open(TicketAdminPersonActionDialogComponent, {
      width: 'min(36rem, calc(100vw - 2rem))',
      maxWidth: 'calc(100vw - 2rem)',
      autoFocus: 'first-tabbable',
      data,
    });
    const result = await firstValueFrom(reference.afterClosed());
    if (!result) return;
    this.operationError.set(null);
    this.snackbar.open(data.action === 'ISSUE' ? 'Bilhete emitido.' : 'Transferência enviada para confirmação.', 'Fechar', { duration: 3500 });
    await this.resetTicketPage();
  }

  private showError(error: unknown, fallback: string): void {
    const message = getErrorMessage(error, fallback);
    this.operationError.set(message);
    this.feedback.showErrorMessage(message);
  }
}
