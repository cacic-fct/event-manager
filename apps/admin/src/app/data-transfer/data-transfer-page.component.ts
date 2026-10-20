import { HttpErrorResponse } from '@angular/common/http';
import { DatePipe, DOCUMENT, isPlatformBrowser, NgTemplateOutlet } from '@angular/common';
import {
  Component,
  DestroyRef,
  PLATFORM_ID,
  TemplateRef,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import type { MatButton } from '@angular/material/button';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatTabsModule } from '@angular/material/tabs';
import {
  createTransferTemplate,
  parseTransferJson,
  TransferValidationError,
  type TransferApplyRequest,
  type TransferBatchSummary,
  type TransferExportRequest,
  type TransferIssue,
  type TransferItem,
  type TransferPreview,
  type TransferPersonDecision,
  type TransferPersonPrompt,
  type TransferResourceKind,
  type TransferResult,
  type TransferTarget,
  TRANSFER_MAX_BYTES,
} from '@cacic-fct/shared-data-transfer';
import { Permission } from '@cacic-fct/shared-permissions';
import { firstValueFrom } from 'rxjs';
import { TransferPersonReviewComponent } from './transfer-person-review.component';
import { DataTransferApiService } from './data-transfer-api.service';
import { EventContextPickerComponent, type EventContextRef } from '../shared/event-context-picker.component';
import { WorkspacePendingChangesService } from '../app-shell/workspace-pending-changes.service';
import { PermissionsService } from '../permissions/permissions.service';
import { transferFieldLabel } from './data-transfer-field-labels';

const resourceLabels: Record<TransferResourceKind, string> = {
  'major-event': 'Grande evento',
  group: 'Grupo de eventos',
  event: 'Evento',
  'major-event-price': 'Preço do grande evento',
  'price-tier': 'Faixa de pagamento',
  'place-preset': 'Local',
  'event-form': 'Formulário',
  'form-link': 'Vínculo de formulário',
  'certificate-config': 'Configuração de certificado',
  'ticket-config': 'Configuração de bilhetes',
  'ticket-price-option': 'Opção de preço de bilhete',
  'sports-tournament': 'Torneio',
  'sports-category': 'Categoria esportiva',
  'sports-venue': 'Local esportivo',
  'sports-stage': 'Etapa esportiva',
  'sports-match': 'Partida',
  'event-subscription': 'Inscrição em evento',
  'group-subscription': 'Inscrição em grupo de eventos',
  'major-event-subscription': 'Inscrição em grande evento',
  'event-attendance': 'Presença em evento',
  'ticket-purchase': 'Compra avulsa de bilhete',
  'event-ticket': 'Bilhete emitido',
};

const actionLabels: Record<TransferItem['action'], string> = {
  create: 'Criar',
  update: 'Atualizar',
  unchanged: 'Sem alterações',
  skip: 'Ignorar',
};

const statusLabels: Record<TransferItem['status'], string> = {
  ready: 'Pronto para aplicar',
  blocked: 'Bloqueado',
  applied: 'Aplicado',
  unchanged: 'Sem alterações',
};

const templateKinds: Array<{ value: TransferTarget['kind']; label: string }> = [
  { value: 'major-event', label: 'Grande evento' },
  { value: 'group', label: 'Grupo de eventos' },
  { value: 'event', label: 'Evento' },
];

@Component({
  selector: 'app-data-transfer-page',
  imports: [
    DatePipe,
    NgTemplateOutlet,
    TransferPersonReviewComponent,
    EventContextPickerComponent,
    MatButtonModule,
    MatCheckboxModule,
    MatDialogModule,
    MatExpansionModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatSelectModule,
    MatTabsModule,
  ],
  templateUrl: './data-transfer-page.component.html',
  styleUrls: [
    '../app-shell/layout/page-layout.shared.scss',
    '../app-shell/layout/forms-feedback.shared.scss',
    '../app-shell/layout/workspace-tabs.shared.scss',
    './data-transfer-page.component.scss',
    './data-transfer-page.feedback.scss',
    './data-transfer-page.review.scss',
  ],
  host: { '(window:beforeunload)': 'protectPendingApply($event)' },
})
export class DataTransferPageComponent {
  private readonly api = inject(DataTransferApiService);
  private readonly dialog = inject(MatDialog);
  private readonly undoConfirmationTemplate = viewChild.required<TemplateRef<unknown>>('undoConfirmation');
  private undoDialogRef: MatDialogRef<unknown> | null = null;
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly document = inject(DOCUMENT);
  private readonly permissions = inject(PermissionsService);
  private readonly pendingChanges = inject(WorkspacePendingChangesService);
  private readonly pendingRegistration = this.pendingChanges.register(() => this.clearImport());
  private readonly objectUrls = new Set<string>();
  private fileRequest = 0;
  private previewRequest = 0;
  private applyRequest = 0;
  private historyRequest = 0;
  private allocationExpiryTimer: number | null = null;

  protected readonly Permission = Permission;
  protected readonly templateKinds = computed(() => {
    const scopedKind = this.routeScope()?.kind;
    return scopedKind ? templateKinds.filter((kind) => kind.value === scopedKind) : templateKinds;
  });
  protected readonly templateKind = signal<TransferTarget['kind']>('major-event');
  protected readonly routeScope = signal<TransferTarget | null>(null);
  protected readonly selectedContext = signal<TransferTarget | null>(null);
  protected readonly useSelectedContextForImport = signal(false);
  protected readonly includeDescendants = signal(true);
  protected readonly includeConfiguration = signal(true);
  protected readonly includeSubscriptions = signal(false);
  protected readonly includeAttendances = signal(false);
  protected readonly includeTickets = signal(false);
  protected readonly includePublishingState = signal(false);
  protected readonly includeAudienceInvitations = signal(false);
  protected readonly includeChildSubscriptions = signal(false);
  protected readonly includeChildAttendances = signal(false);
  protected readonly jsonText = signal('');
  protected readonly fileName = signal('');
  protected readonly sourceDocument = signal<ReturnType<typeof parseTransferJson> | null>(null);
  protected readonly validationIssues = signal<TransferIssue[]>([]);
  protected readonly serverIssues = signal<TransferIssue[]>([]);
  protected readonly personPrompts = signal<TransferPersonPrompt[]>([]);
  protected readonly personDecisions = signal<TransferPersonDecision[]>([]);
  protected readonly preview = signal<TransferPreview | null>(null);
  protected readonly result = signal<TransferResult | null>(null);
  protected readonly committedResult = signal<TransferResult | null>(null);
  protected readonly batchHistory = signal<TransferBatchSummary[]>([]);
  protected readonly exportIssues = signal<TransferIssue[]>([]);
  protected readonly exportLoading = signal(false);
  protected readonly schemaLoading = signal(false);
  protected readonly fileLoading = signal(false);
  protected readonly previewLoading = signal(false);
  protected readonly applyLoading = signal(false);
  protected readonly pendingApplyRequest = signal<TransferApplyRequest | null>(null);
  protected readonly hasPendingImport = computed(
    () =>
      this.pendingApplyRequest() !== null ||
      this.fileLoading() ||
      (Boolean(this.jsonText()) && !this.result()?.applied),
  );
  protected readonly importLocked = computed(() => this.applyLoading() || this.pendingApplyRequest() !== null);
  protected readonly exportError = signal('');
  protected readonly schemaError = signal('');
  protected readonly importError = signal('');
  protected readonly importSuccessMessage = signal('');
  protected readonly exportSuccessMessage = signal('');
  protected readonly allowPartial = signal(false);
  protected readonly offerPartialApproval = signal(false);
  protected readonly allocationExpired = signal(false);
  protected readonly undoConfirmationOpen = signal(false);
  protected readonly undoLoading = signal(false);
  protected readonly undoError = signal('');
  protected readonly undoSuccessMessage = signal('');
  protected readonly undoAuditEntryId = signal('');
  protected readonly undoTarget = signal<Pick<TransferBatchSummary, 'batchId'> | null>(null);
  protected readonly historyLoading = signal(false);
  protected readonly historyError = signal('');
  protected readonly undoneBatchIds = signal<Set<string>>(new Set());

  protected readonly canExport = computed(() => this.permissions.has(Permission.DataTransfer.Export));
  protected readonly canImport = computed(() => this.permissions.has(Permission.DataTransfer.Import));
  protected readonly canUndoPermission = computed(() => this.permissions.has(Permission.DataTransfer.Undo));
  protected readonly canExportSubscriptions = computed(() => this.permissions.has(Permission.Subscription.Read));
  protected readonly canExportTickets = computed(() => this.permissions.has(Permission.Ticket.Read));
  protected readonly canExportAttendances = computed(() => this.permissions.has(Permission.EventAttendance.Read));
  protected readonly canImportSubscriptions = computed(() => this.permissions.has(Permission.Subscription.Import));
  protected readonly canImportAttendances = computed(() => this.permissions.has(Permission.EventAttendance.Import));
  protected readonly canViewHistory = computed(() => this.canImport() || this.canUndoPermission());
  private readonly selectedTask = signal<'import' | 'export' | 'history'>('import');
  protected readonly activeTask = computed(() => {
    const task = this.selectedTask();
    if (task === 'import' && this.canImport()) return task;
    if (task === 'export' && this.canExport()) return task;
    if (task === 'history' && this.canViewHistory()) return task;
    return this.canImport() ? 'import' : this.canExport() ? 'export' : 'history';
  });
  protected readonly taskSwitchLocked = computed(
    () =>
      this.importLocked() ||
      this.previewLoading() ||
      this.fileLoading() ||
      this.exportLoading() ||
      this.undoLoading() ||
      this.undoConfirmationOpen(),
  );
  protected readonly canUndoBatch = computed(() => {
    const current = this.committedResult();
    return Boolean(current?.batchId && current.applied && this.canUndoBatchId(current.batchId));
  });
  protected readonly exportTarget = computed(() => this.routeScope() ?? this.selectedContext());
  protected readonly importTarget = computed(
    () => this.routeScope() ?? (this.useSelectedContextForImport() ? this.selectedContext() : null),
  );
  protected readonly isScoped = computed(() => this.routeScope() !== null);
  protected readonly hasChildTransferScope = computed(() => {
    const target = this.exportTarget();
    return target !== null && target.kind !== 'event';
  });
  protected readonly hasRootAttendanceScope = computed(() => this.exportTarget()?.kind === 'event');
  protected readonly hasBlockedItems = computed(() => {
    const current = this.preview();
    return Boolean(current?.items.some((item) => item.status === 'blocked' || item.action === 'skip'));
  });
  protected readonly hasImportableChanges = computed(() => {
    const current = this.preview();
    return Boolean(
      current?.items.some(
        (item) =>
          item.status === 'ready' &&
          (item.action === 'create' || item.action === 'update') &&
          this.canImportResource(item.kind),
      ),
    );
  });
  protected readonly canApplyPlan = computed(() => {
    const current = this.preview();
    if (
      !current ||
      !this.canImport() ||
      this.applyLoading() ||
      this.pendingApplyRequest() !== null ||
      this.undoLoading() ||
      this.previewLoading() ||
      this.allocationExpired() ||
      !!current.personPrompts?.length ||
      !this.hasImportableChanges()
    ) {
      return false;
    }
    const needsPartialApproval = this.hasBlockedItems() || current.summary.skip > 0;
    return needsPartialApproval ? this.allowPartial() : current.canApply;
  });
  protected readonly participationPermissionWarnings = computed(() => {
    const document = this.sourceDocument();
    if (!document) {
      return [];
    }
    const warnings: string[] = [];
    if (
      document.resources.some((resource) =>
        ['event-subscription', 'group-subscription', 'major-event-subscription'].includes(resource.kind),
      ) &&
      !this.canImportSubscriptions()
    ) {
      warnings.push('Você precisa da permissão de importação de inscrições para alterar os registros deste grupo.');
    }
    if (document.resources.some((resource) => resource.kind === 'event-attendance') && !this.canImportAttendances()) {
      warnings.push('Você precisa da permissão de importação de presenças para alterar os registros deste grupo.');
    }
    return warnings;
  });

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const kind = params.get('kind');
      const id = params.get('targetId');
      const target: TransferTarget | null =
        id && (kind === 'event' || kind === 'group' || kind === 'major-event') ? { kind, id } : null;
      if (!sameTarget(target, this.routeScope())) {
        this.routeScope.set(target);
        this.templateKind.set(target?.kind ?? 'major-event');
        this.resetParticipationOptions();
        this.invalidatePreview(true);
      }
    });

    effect(() => {
      this.pendingRegistration.set(this.hasPendingImport());
    });

    this.destroyRef.onDestroy(() => {
      this.pendingRegistration.destroy();
      this.undoDialogRef?.close();
      const browserWindow = this.document.defaultView;
      if (browserWindow && this.allocationExpiryTimer !== null) {
        browserWindow.clearTimeout(this.allocationExpiryTimer);
      }
      if (browserWindow) {
        for (const url of this.objectUrls) {
          browserWindow.URL.revokeObjectURL(url);
        }
      }
    });
    if (this.canViewHistory()) {
      void this.loadHistory();
    }
  }

  protected setSelectedContext(context: EventContextRef): void {
    if (this.importLocked() || this.undoLoading()) return;
    const target = { kind: context.kind, id: context.id } satisfies TransferTarget;
    if (sameTarget(target, this.selectedContext())) {
      return;
    }
    this.selectedContext.set(target);
    this.resetParticipationOptions();
    this.resetUndoState();
    this.invalidatePreview(true);
  }

  protected selectTask(task: 'import' | 'export' | 'history'): void {
    if (this.taskSwitchLocked()) return;
    this.selectedTask.set(task);
  }

  protected clearSelectedContext(): void {
    if (this.importLocked() || this.undoLoading()) return;
    if (this.selectedContext()) {
      this.selectedContext.set(null);
      this.resetParticipationOptions();
      this.resetUndoState();
      this.invalidatePreview(true);
    }
  }

  protected setUseSelectedContextForImport(enabled: boolean): void {
    if (this.importLocked() || this.undoLoading()) return;
    if (this.useSelectedContextForImport() === enabled) {
      return;
    }
    this.useSelectedContextForImport.set(enabled);
    this.invalidatePreview(true);
  }

  protected setExportOption(
    option:
      | 'includeDescendants'
      | 'includeConfiguration'
      | 'includeSubscriptions'
      | 'includeTickets'
      | 'includePublishingState'
      | 'includeAudienceInvitations'
      | 'includeAttendances'
      | 'includeChildSubscriptions'
      | 'includeChildAttendances',
    enabled: boolean,
  ): void {
    if (this.importLocked() || this.undoLoading()) return;
    if (option === 'includeTickets' && enabled && !this.canExportTickets()) return;
    if (option === 'includeSubscriptions' && enabled && !this.canExportSubscriptions()) {
      return;
    }
    if (option === 'includeAttendances' && enabled && !this.canExportAttendances()) {
      return;
    }
    if (
      (option === 'includeChildSubscriptions' || option === 'includeChildAttendances') &&
      enabled &&
      (!this.canExport() || !this.hasChildTransferScope())
    ) {
      return;
    }
    if (option === 'includeChildSubscriptions' && enabled && !this.canExportSubscriptions()) {
      return;
    }
    if (option === 'includeChildAttendances' && enabled && !this.canExportAttendances()) {
      return;
    }
    this[option].set(enabled);
    this.invalidatePreview(true);
  }

  protected setAllowPartial(enabled: boolean): void {
    if (this.importLocked() || this.undoLoading()) return;
    if (this.allowPartial() === enabled) {
      return;
    }
    this.allowPartial.set(enabled);
    this.invalidatePreview(false);
  }

  protected setTemplateKind(kind: TransferTarget['kind']): void {
    if (this.importLocked() || this.undoLoading()) return;
    if (this.routeScope() || this.templateKind() === kind) {
      return;
    }
    this.templateKind.set(kind);
    this.invalidatePreview(true);
  }

  protected onTextInput(event: Event): void {
    if (this.importLocked() || this.undoLoading()) return;
    const text = (event.target as HTMLTextAreaElement).value;
    this.jsonText.set(text);
    this.fileName.set('');
    this.sourceDocument.set(null);
    this.validationIssues.set([]);
    this.serverIssues.set([]);
    this.importError.set('');
    this.importSuccessMessage.set('');
    this.resetUndoState();
    this.invalidatePreview(true);
  }

  protected async onFileSelected(event: Event, focusTarget: MatButton): Promise<void> {
    if (this.importLocked() || this.undoLoading()) return;
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      this.returnFocusToFilePicker(focusTarget);
      return;
    }
    const request = ++this.fileRequest;
    this.jsonText.set('');
    this.fileName.set('');
    this.sourceDocument.set(null);
    this.validationIssues.set([]);
    this.serverIssues.set([]);
    this.importError.set('');
    this.importSuccessMessage.set('');
    this.resetUndoState();
    this.invalidatePreview(true);
    if (!file.name.toLowerCase().endsWith('.json')) {
      this.validationIssues.set([{ message: 'Selecione um arquivo .json.' }]);
      this.returnFocusToFilePicker(focusTarget);
      return;
    }
    if (file.size > TRANSFER_MAX_BYTES) {
      this.validationIssues.set([{ message: 'O arquivo excede o limite de 5 MiB.' }]);
      this.returnFocusToFilePicker(focusTarget);
      return;
    }

    this.fileLoading.set(true);
    try {
      const text = await file.text();
      if (request !== this.fileRequest || this.destroyRef.destroyed) {
        return;
      }
      this.fileName.set(file.name);
      this.jsonText.set(text);
      this.validateDocument(text);
    } catch {
      if (request === this.fileRequest && !this.destroyRef.destroyed) {
        this.validationIssues.set([
          { message: 'Não foi possível ler o arquivo. Escolha outro arquivo ou cole o JSON.' },
        ]);
      }
    } finally {
      if (request === this.fileRequest && !this.destroyRef.destroyed) {
        this.fileLoading.set(false);
        this.returnFocusToFilePicker(focusTarget);
      }
    }
  }

  protected returnFocusToFilePicker(focusTarget: MatButton): void {
    const browserWindow = this.document.defaultView;
    if (!isPlatformBrowser(this.platformId) || !browserWindow) {
      return;
    }

    browserWindow.requestAnimationFrame(() => {
      if (!this.destroyRef.destroyed) {
        focusTarget.focus('keyboard');
      }
    });
  }

  protected async exportJson(): Promise<void> {
    const target = this.exportTarget();
    if (!this.canExport() || !target || this.exportLoading()) {
      return;
    }
    this.exportLoading.set(true);
    this.exportError.set('');
    this.exportSuccessMessage.set('');
    this.exportIssues.set([]);
    const request: TransferExportRequest = {
      target,
      includeDescendants: this.includeDescendants(),
      includeConfiguration: this.includeConfiguration(),
      includeSubscriptions: this.includeSubscriptions() && this.canExportSubscriptions(),
      includeTickets: this.includeTickets() && this.canExportTickets(),
      includePublishingState: this.includePublishingState(),
      includeAudienceInvitations: this.includeAudienceInvitations(),
      includeAttendances: target.kind === 'event' && this.includeAttendances() && this.canExportAttendances(),
      includeChildSubscriptions:
        target.kind !== 'event' && this.includeChildSubscriptions() && this.canExportSubscriptions(),
      includeChildAttendances: target.kind !== 'event' && this.includeChildAttendances() && this.canExportAttendances(),
    };
    try {
      const exported = await firstValueFrom(this.api.export(request));
      this.exportIssues.set(exported.issues);
      this.downloadJson(`cacic-eventos-${target.kind}-${target.id}.json`, exported.document);
      this.exportSuccessMessage.set(
        'Arquivo JSON exportado. Revise os avisos antes de compartilhar ou importar os dados.',
      );
    } catch (error: unknown) {
      this.exportError.set(firstIssueMessage(error, 'Não foi possível exportar este contexto. Tente novamente.'));
    } finally {
      this.exportLoading.set(false);
    }
  }

  protected async downloadSchema(): Promise<void> {
    if (this.schemaLoading() || (!this.canExport() && !this.canImport())) {
      return;
    }
    this.schemaLoading.set(true);
    this.schemaError.set('');
    try {
      const schema = await firstValueFrom(this.api.getSchema());
      this.downloadJson('cacic-event-data.schema.json', schema);
    } catch (error: unknown) {
      this.schemaError.set(firstIssueMessage(error, 'Não foi possível baixar o schema. Tente novamente.'));
    } finally {
      this.schemaLoading.set(false);
    }
  }

  protected downloadTemplate(): void {
    const kind = this.templateKind();
    const template = createTransferTemplate(kind, new Date(), this.routeScope() ?? undefined);
    this.downloadJson(`modelo-cacic-${kind}.json`, template);
  }

  protected choosePerson(decision: TransferPersonDecision): void {
    if (this.importLocked() || this.previewLoading() || this.undoLoading()) return;
    this.personDecisions.update((choices) => [...choices.filter((choice) => choice.key !== decision.key), decision]);
    this.invalidatePreview(false);
  }

  protected editPerson(key: string): void {
    if (this.importLocked() || !this.personDecisions().some((decision) => decision.key === key)) return;
    this.personDecisions.update((choices) => choices.filter((choice) => choice.key !== key));
    this.invalidatePreview(false);
  }

  protected async previewImport(): Promise<void> {
    if (!this.canImport() || this.previewLoading() || this.importLocked() || this.undoLoading()) {
      return;
    }
    this.importError.set('');
    this.importSuccessMessage.set('');
    this.serverIssues.set([]);
    this.result.set(null);
    const document = this.validateDocument(this.jsonText());
    if (!document) {
      return;
    }
    if (!this.routeScope() && this.useSelectedContextForImport() && !this.selectedContext()) {
      this.importError.set('Escolha um contexto antes de revisar a importação.');
      return;
    }

    const request = ++this.previewRequest;
    const requestScope = this.importTarget();
    this.preview.set(null);
    this.scheduleAllocationExpiry(undefined);
    this.previewLoading.set(true);
    try {
      const preview = await firstValueFrom(
        this.api.preview({
          document,
          ...(requestScope ? { scope: requestScope } : {}),
          ...(this.personDecisions().length ? { personDecisions: this.personDecisions() } : {}),
        }),
      );
      if (request !== this.previewRequest || this.destroyRef.destroyed) {
        return;
      }
      this.preview.set(preview);
      this.personPrompts.set(preview.personPrompts ?? []);
      this.scheduleAllocationExpiry(preview.allocation?.expiresAt);
      this.offerPartialApproval.set(
        preview.items.some((item) => item.status === 'blocked' || item.action === 'skip') || preview.summary.skip > 0,
      );
    } catch (error: unknown) {
      if (request === this.previewRequest && !this.destroyRef.destroyed) {
        this.preview.set(null);
        this.scheduleAllocationExpiry(undefined);
        this.serverIssues.set(issuesFromError(error));
        this.importError.set(this.serverIssues().length ? '' : 'Não foi possível revisar o JSON. Tente novamente.');
      }
    } finally {
      if (request === this.previewRequest && !this.destroyRef.destroyed) {
        this.previewLoading.set(false);
      }
    }
  }

  protected async applyImport(): Promise<void> {
    const preview = this.preview();
    const document = this.sourceDocument();
    if (!preview || !document || !this.canApplyPlan() || this.applyLoading()) {
      return;
    }
    const target = this.importTarget();
    const requestBody: TransferApplyRequest = {
      document,
      ...(target ? { scope: target } : {}),
      ...(this.personDecisions().length ? { personDecisions: this.personDecisions() } : {}),
      planHash: preview.planHash,
      allowPartial: this.allowPartial(),
      ...(preview.allocation ? { allocationToken: preview.allocation.token } : {}),
    };
    this.pendingApplyRequest.set(requestBody);
    await this.submitApply(requestBody, false);
  }

  protected async retryApply(): Promise<void> {
    const requestBody = this.pendingApplyRequest();
    if (!requestBody || !this.canImport() || this.applyLoading() || this.undoLoading()) return;
    await this.submitApply(requestBody, true);
  }

  private async submitApply(requestBody: TransferApplyRequest, recovering: boolean): Promise<void> {
    const request = ++this.applyRequest;
    this.applyLoading.set(true);
    this.importError.set('');
    this.importSuccessMessage.set('');
    this.serverIssues.set([]);
    this.resetUndoState();
    try {
      const result = await firstValueFrom(this.api.apply(requestBody));
      if (request !== this.applyRequest || this.destroyRef.destroyed) {
        return;
      }
      if (!result.applied) {
        this.pendingApplyRequest.set(null);
        this.result.set(result);
        this.preview.set(result);
        this.scheduleAllocationExpiry(result.allocation?.expiresAt);
        this.offerPartialApproval.set(
          result.items.some((item) => item.status === 'blocked' || item.action === 'skip') || result.summary.skip > 0,
        );
        this.importError.set('A aplicação não foi concluída. Confira o resultado e gere uma nova revisão.');
        return;
      }
      this.pendingApplyRequest.set(null);
      this.result.set(result);
      this.committedResult.set(result);
      this.resetUndoResult();
      this.preview.set(result);
      this.scheduleAllocationExpiry(result.allocation?.expiresAt);
      if (result.document) {
        this.sourceDocument.set(result.document);
        this.jsonText.set(JSON.stringify(result.document, null, 2));
        this.fileName.set('');
      }
      const resolvedCopyNote = result.document ? ' O editor foi atualizado com o JSON resolvido.' : '';
      this.importSuccessMessage.set(
        result.summary.skip > 0
          ? `Importação concluída. ${result.summary.skip} registros foram ignorados conforme sua confirmação.${resolvedCopyNote}`
          : `Importação concluída. Confira os registros aplicados e os que permaneceram sem alterações.${resolvedCopyNote}`,
      );
      if (this.canViewHistory()) {
        void this.loadHistory();
      }
    } catch (error: unknown) {
      if (request === this.applyRequest && !this.destroyRef.destroyed) {
        if (
          isUncertainApplyError(error) ||
          (recovering && error instanceof HttpErrorResponse && (error.status === 401 || error.status === 403))
        ) {
          this.importError.set(
            'O resultado ainda não foi confirmado. A importação pode ter sido salva. Verifique o resultado usando a mesma solicitação antes de iniciar outra importação.',
          );
          return;
        }
        this.pendingApplyRequest.set(null);
        this.preview.set(null);
        this.scheduleAllocationExpiry(undefined);
        this.offerPartialApproval.set(false);
        this.allowPartial.set(false);
        this.serverIssues.set(issuesFromError(error));
        this.importError.set(
          this.serverIssues().length ? '' : 'A aplicação falhou. Gere uma nova revisão antes de tentar novamente.',
        );
      }
    } finally {
      if (request === this.applyRequest && !this.destroyRef.destroyed) {
        this.applyLoading.set(false);
      }
    }
  }

  protected downloadResult(): void {
    const result = this.committedResult();
    if (result) {
      this.downloadJson('relatorio-importacao-cacic.json', result);
    }
  }

  protected downloadResolvedDocument(): void {
    const document = this.committedResult()?.document;
    if (document) {
      this.downloadJson('cacic-eventos-com-ids-gerados.json', document);
    }
  }

  protected requestUndo(batchId?: string): void {
    const targetBatchId = batchId ?? this.committedResult()?.batchId;
    if (
      !targetBatchId ||
      !this.canUndoBatchId(targetBatchId) ||
      this.undoLoading() ||
      this.undoConfirmationOpen() ||
      this.importLocked() ||
      this.previewLoading()
    ) {
      return;
    }
    this.undoSuccessMessage.set('');
    this.undoAuditEntryId.set('');
    this.undoError.set('');
    this.undoTarget.set({ batchId: targetBatchId });
    this.undoConfirmationOpen.set(true);
    const dialogRef = this.dialog.open(this.undoConfirmationTemplate(), {
      width: 'min(560px, calc(100vw - 32px))',
      autoFocus: '[data-undo-cancel]',
      ariaDescribedBy: 'undo-confirmation-description',
    });
    this.undoDialogRef = dialogRef;
    dialogRef
      .afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        if (this.undoDialogRef === dialogRef) {
          this.undoDialogRef = null;
          this.resetUndoState();
        }
      });
  }

  protected cancelUndo(): void {
    if (!this.undoLoading()) {
      this.resetUndoState();
    }
  }

  protected async confirmUndo(): Promise<void> {
    const batchId = this.undoTarget()?.batchId;
    if (
      !batchId ||
      !this.undoConfirmationOpen() ||
      !this.undoDialogRef ||
      !this.canUndoBatchId(batchId) ||
      this.undoLoading() ||
      this.importLocked() ||
      this.previewLoading()
    ) {
      return;
    }
    this.undoLoading.set(true);
    this.undoDialogRef.disableClose = true;
    this.undoError.set('');
    try {
      const response = await firstValueFrom(this.api.undo(batchId));
      if (response.batchId !== batchId || !response.undone) {
        throw new Error('O servidor não confirmou a reversão deste lote. Tente novamente.');
      }
      this.undoAuditEntryId.set(response.auditEntryId);
      this.undoneBatchIds.update((batchIds) => new Set(batchIds).add(batchId));
      this.undoSuccessMessage.set('Importação revertida. Edições feitas depois do lote foram preservadas.');
      this.resetUndoState();
      void this.loadHistory();
    } catch (error: unknown) {
      this.undoError.set(firstIssueMessage(error, 'Não foi possível desfazer esta importação. Tente novamente.'));
    } finally {
      this.undoLoading.set(false);
      if (this.undoDialogRef) this.undoDialogRef.disableClose = false;
    }
  }

  protected canUndoHistoryBatch(batch: TransferBatchSummary): boolean {
    return (
      !batch.undone &&
      this.canUndoBatchId(batch.batchId) &&
      !this.undoLoading() &&
      !this.importLocked() &&
      !this.previewLoading()
    );
  }

  protected retryHistory(): void {
    void this.loadHistory();
  }

  private canUndoBatchId(batchId: string): boolean {
    return this.permissions.has(Permission.DataTransfer.Undo) && !this.undoneBatchIds().has(batchId);
  }

  private async loadHistory(): Promise<void> {
    if (!this.canViewHistory()) {
      return;
    }
    const request = ++this.historyRequest;
    this.historyLoading.set(true);
    this.historyError.set('');
    try {
      const batches = await firstValueFrom(this.api.history());
      if (request === this.historyRequest && !this.destroyRef.destroyed) {
        this.batchHistory.set(batches);
      }
    } catch (error: unknown) {
      if (request === this.historyRequest && !this.destroyRef.destroyed) {
        this.historyError.set(firstIssueMessage(error, 'Não foi possível carregar as importações recentes.'));
      }
    } finally {
      if (request === this.historyRequest && !this.destroyRef.destroyed) {
        this.historyLoading.set(false);
      }
    }
  }

  protected clearImport(): void {
    if (this.importLocked()) return;
    this.fileRequest++;
    this.fileLoading.set(false);
    this.jsonText.set('');
    this.fileName.set('');
    this.sourceDocument.set(null);
    this.validationIssues.set([]);
    this.serverIssues.set([]);
    this.importError.set('');
    this.importSuccessMessage.set('');
    this.result.set(null);
    this.resetUndoState();
    this.allowPartial.set(false);
    this.offerPartialApproval.set(false);
    this.invalidatePreview(true);
  }

  protected resourceLabel(kind: TransferResourceKind): string {
    return resourceLabels[kind];
  }

  protected itemLabel(item: TransferItem): string {
    return item.label ? `${this.resourceLabel(item.kind)} · ${item.label}` : this.resourceLabel(item.kind);
  }

  protected fieldLabel(field: string): string {
    return transferFieldLabel(field);
  }

  protected actionLabel(action: TransferItem['action']): string {
    return actionLabels[action];
  }

  protected statusLabel(status: TransferItem['status']): string {
    return statusLabels[status];
  }

  protected rootSubscriptionLabel(): string {
    switch (this.exportTarget()?.kind) {
      case 'event':
        return 'Incluir inscrições deste evento';
      case 'group':
        return 'Incluir inscrições deste grupo de eventos';
      case 'major-event':
        return 'Incluir inscrições deste grande evento';
      default:
        return 'Incluir inscrições do contexto';
    }
  }

  protected childSubscriptionLabel(): string {
    return this.exportTarget()?.kind === 'major-event'
      ? 'Incluir inscrições dos eventos e grupos filhos'
      : 'Incluir inscrições dos eventos filhos';
  }

  protected childAttendanceLabel(): string {
    return this.exportTarget()?.kind === 'major-event'
      ? 'Incluir presenças dos eventos filhos'
      : 'Incluir presenças dos eventos deste grupo';
  }

  protected hasReadyRecords(preview: TransferPreview): boolean {
    return preview.items.some((item) => item.status === 'ready' && item.action !== 'unchanged');
  }

  protected itemReference(item: TransferItem): string {
    return item.key ? `Chave ${item.key} · ID ${item.id}` : `ID ${item.id}`;
  }

  protected generatedIdFor(item: TransferItem): string | null {
    if (!item.key) {
      return null;
    }
    return this.preview()?.allocation?.ids[item.key] ?? (this.result()?.applied ? item.id : null);
  }

  protected jsonLabel(value: TransferItem['changes'][number]['before']): string {
    if (value === null) {
      return 'Vazio';
    }
    if (typeof value === 'string') {
      return value || 'Vazio';
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    return JSON.stringify(value, null, 2);
  }

  canDeactivate(): Promise<boolean> {
    if (this.pendingApplyRequest()) {
      this.importError.set('Verifique o resultado da importação antes de sair para evitar uma aplicação duplicada.');
      return Promise.resolve(false);
    }
    if (this.applyLoading() || this.undoLoading()) {
      this.importError.set('Aguarde a conclusão da operação antes de sair desta página.');
      return Promise.resolve(false);
    }
    return this.pendingChanges.canDeactivate();
  }

  protected protectPendingApply(event: BeforeUnloadEvent): void {
    if (this.hasPendingImport() || this.applyLoading() || this.undoLoading()) {
      event.preventDefault();
      event.returnValue = '';
    }
  }

  private scheduleAllocationExpiry(expiresAt: string | undefined): void {
    const browserWindow = this.document.defaultView;
    if (browserWindow && this.allocationExpiryTimer !== null) {
      browserWindow.clearTimeout(this.allocationExpiryTimer);
    }
    this.allocationExpiryTimer = null;
    this.allocationExpired.set(false);
    if (!expiresAt) {
      return;
    }

    const remainingMs = Date.parse(expiresAt) - Date.now();
    if (!Number.isFinite(remainingMs) || remainingMs <= 0) {
      this.allocationExpired.set(true);
      return;
    }
    if (isPlatformBrowser(this.platformId) && browserWindow) {
      this.allocationExpiryTimer = browserWindow.setTimeout(() => {
        this.allocationExpired.set(true);
        this.allocationExpiryTimer = null;
      }, remainingMs);
    }
  }

  private validateDocument(text: string): ReturnType<typeof parseTransferJson> | null {
    try {
      const document = parseTransferJson(text);
      this.sourceDocument.set(document);
      this.validationIssues.set([]);
      return document;
    } catch (error: unknown) {
      this.sourceDocument.set(null);
      this.validationIssues.set(issuesFromError(error));
      return null;
    }
  }

  private invalidatePreview(resetPartialApproval: boolean): void {
    this.previewRequest++;
    this.previewLoading.set(false);
    this.preview.set(null);
    this.scheduleAllocationExpiry(undefined);
    this.result.set(null);
    this.importError.set('');
    this.serverIssues.set([]);
    this.importSuccessMessage.set('');
    if (resetPartialApproval) {
      this.personPrompts.set([]);
      this.personDecisions.set([]);
      this.allowPartial.set(false);
      this.offerPartialApproval.set(false);
    }
  }

  private resetParticipationOptions(): void {
    this.includeSubscriptions.set(false);
    this.includeAttendances.set(false);
    this.includeTickets.set(false);
    this.includePublishingState.set(false);
    this.includeAudienceInvitations.set(false);
    this.includeChildSubscriptions.set(false);
    this.includeChildAttendances.set(false);
  }

  private resetUndoState(): void {
    const dialogRef = this.undoDialogRef;
    this.undoDialogRef = null;
    dialogRef?.close();
    this.undoConfirmationOpen.set(false);
    this.undoError.set('');
    this.undoTarget.set(null);
  }

  private resetUndoResult(): void {
    this.undoSuccessMessage.set('');
    this.undoAuditEntryId.set('');
  }

  private canImportResource(kind: TransferResourceKind): boolean {
    if (kind === 'event-subscription' || kind === 'group-subscription' || kind === 'major-event-subscription') {
      return this.canImportSubscriptions();
    }
    if (kind === 'event-attendance') {
      return this.canImportAttendances();
    }
    return true;
  }

  private downloadJson(fileName: string, value: unknown): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    const browserWindow = this.document.defaultView;
    if (!browserWindow || !this.document.body) {
      return;
    }
    const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = browserWindow.URL.createObjectURL(blob);
    this.objectUrls.add(url);
    const anchor = this.document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.hidden = true;
    this.document.body.append(anchor);
    anchor.click();
    anchor.remove();
    browserWindow.setTimeout(() => {
      browserWindow.URL.revokeObjectURL(url);
      this.objectUrls.delete(url);
    }, 0);
  }
}

function sameTarget(left: TransferTarget | null, right: TransferTarget | null): boolean {
  return left?.kind === right?.kind && left?.id === right?.id;
}

function isUncertainApplyError(error: unknown): boolean {
  return !(error instanceof HttpErrorResponse) || error.status === 0 || error.status >= 500 || error.status === 408;
}

function firstIssueMessage(error: unknown, fallback: string): string {
  const issues = issuesFromError(error);
  return issues[0]?.message ?? fallback;
}

function issuesFromError(error: unknown): TransferIssue[] {
  if (error instanceof TransferValidationError) {
    return error.issues;
  }
  if (error instanceof HttpErrorResponse) {
    const body = error.error;
    if (isRecord(body)) {
      const issues = body['issues'];
      if (Array.isArray(issues)) {
        const validIssues = issues.filter(isTransferIssue);
        if (validIssues.length > 0) {
          return validIssues;
        }
      }
      const message = body['message'];
      if (typeof message === 'string') {
        return [{ message }];
      }
    }
    if (error.status === 0) {
      return [{ message: 'Não foi possível acessar o servidor. Verifique a conexão e tente novamente.' }];
    }
  }
  if (error instanceof Error && error.message) {
    return [{ message: error.message }];
  }
  return [{ message: 'Não foi possível processar a solicitação. Tente novamente.' }];
}

function isTransferIssue(value: unknown): value is TransferIssue {
  return isRecord(value) && typeof value['message'] === 'string';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
