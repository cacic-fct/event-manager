import { DatePipe } from '@angular/common';
import {
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialog } from '@angular/material/dialog';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import type {
  AdminMcpCommand,
  AdminMcpCommandPage,
  AdminMcpDelegation,
  AdminMcpOperationInfo,
  AdminMcpScope,
  McpAdminSettings,
} from '@cacic-fct/event-manager-mcp-contracts';
import { RouterLink } from '@angular/router';
import { auditTime, firstValueFrom } from 'rxjs';
import { ConfirmationDialogComponent } from '../../app-shell/dialogs/confirmation-dialog.component';
import { RealtimeApiService } from '../../graphql/realtime-api.service';
import { EventContextPickerComponent, type EventContextRef } from '../../shared/event-context-picker.component';
import { ReviewQueuePaginationComponent } from '../../shared/review-queue/review-queue-pagination.component';
import { mcpErrorMessage } from '../mcp-api.service';
import { adminOperationDomainLabel, normalizeOperationSearch } from './admin-operation-labels';
import { CommandTargetsComponent } from './command-targets.component';
import { AdminOperationsApi } from './admin-operations-api.service';
import { CommandReviewDialogComponent, serializeArgument } from './command-review-dialog.component';

@Component({
  selector: 'app-admin-operations-page',
  imports: [
    DatePipe,
    ReactiveFormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatExpansionModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatProgressBarModule,
    EventContextPickerComponent,
    ReviewQueuePaginationComponent,
    RouterLink,
    CommandTargetsComponent,
  ],
  templateUrl: './admin-operations-page.component.html',
  styleUrl: './admin-operations-page.component.scss',
})
export class AdminOperationsPageComponent {
  private readonly api = inject(AdminOperationsApi);
  private readonly dialog = inject(MatDialog);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  private readonly heading = viewChild<ElementRef<HTMLHeadingElement>>('heading');
  private readonly alert = viewChild<ElementRef<HTMLParagraphElement>>('alert');
  private pendingRefresh = false;
  private request = 0;
  readonly settings = signal<McpAdminSettings | null>(null);
  readonly catalog = signal<AdminMcpOperationInfo[]>([]);
  readonly delegations = signal<AdminMcpDelegation[]>([]);
  readonly result = signal<AdminMcpCommandPage>({ items: [], hasMore: false });
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly feedback = signal('');
  readonly page = signal(0);
  readonly serialize = serializeArgument;
  readonly creating = signal(false);
  readonly scope = signal<AdminMcpScope | null>(null);
  readonly selectedContext = signal<EventContextRef | null>(null);
  readonly selected = signal<string[]>([]);
  readonly search = new FormControl('', { nonNullable: true });
  readonly query = signal('');
  readonly domainLabel = adminOperationDomainLabel;
  readonly groups = computed(() => {
    const query = normalizeOperationSearch(this.query().trim());
    const operations = this.catalog().filter((operation) => {
      const searchable = [operation.label, operation.description, this.domainLabel(operation.domain), operation.field];
      return !query || searchable.some((value) => normalizeOperationSearch(value).includes(query));
    });
    return [...new Set(operations.map((operation) => operation.domain))].map((domain) => ({
      domain,
      operations: operations.filter((operation) => operation.domain === domain),
    }));
  });
  readonly matchingOperations = computed(() =>
    this.groups().reduce((total, group) => total + group.operations.length, 0),
  );
  readonly form = new FormGroup({
    clientId: new FormControl('', { nonNullable: true, validators: Validators.required }),
    scopeMode: new FormControl<'RESOURCE' | 'ALL_AUTHORIZED'>('RESOURCE', { nonNullable: true }),
    broadConsent: new FormControl(false, { nonNullable: true }),
    personalData: new FormControl(false, { nonNullable: true }),
    hours: new FormControl(1, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(1), Validators.max(24)],
    }),
    maxProposals: new FormControl(5, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(1), Validators.max(20), Validators.pattern(/^\d+$/)],
    }),
  });
  constructor() {
    this.search.valueChanges.pipe(takeUntilDestroyed()).subscribe((value) => this.query.set(value));
    this.form.controls.scopeMode.valueChanges.pipe(takeUntilDestroyed()).subscribe((mode) => {
      if (mode === 'ALL_AUTHORIZED') return;
      const scopedOperations = new Set(
        this.catalog()
          .filter((operation) => !operation.requiresAllAuthorized)
          .map((operation) => operation.field),
      );
      const previous = this.selected();
      const selected = previous.filter((field) => scopedOperations.has(field));
      this.selected.set(selected);
      if (selected.length !== previous.length) {
        this.feedback.set('Operações que exigem todos os recursos foram removidas da seleção.');
      }
    });
    inject(RealtimeApiService)
      .watchMcpReviews()
      .pipe(auditTime(250), takeUntilDestroyed())
      .subscribe(() => {
        this.pendingRefresh = true;
        void this.refreshIfIdle();
      });
    void this.load();
  }
  async load(page = this.page()): Promise<void> {
    if (this.busy() || this.creating()) {
      this.pendingRefresh = true;
      return;
    }
    const request = ++this.request;
    this.loading.set(true);
    this.pendingRefresh = false;
    try {
      const [settings, catalog, delegations, result] = await Promise.all([
        this.api.settings(),
        this.api.catalog(),
        this.api.delegations(),
        this.api.proposals(page),
      ]);
      if (request !== this.request) return;
      if (this.busy() || this.creating()) {
        this.pendingRefresh = true;
        return;
      }
      this.settings.set(settings);
      this.catalog.set(catalog);
      this.delegations.set(delegations);
      this.result.set(result);
      this.page.set(page);
    } catch (error) {
      this.showError(error, 'Não foi possível carregar as operações. Tente novamente.');
    } finally {
      this.loading.set(false);
      void this.refreshIfIdle();
    }
  }
  private async refreshIfIdle(): Promise<void> {
    if (this.destroyRef.destroyed || !this.pendingRefresh || this.loading() || this.busy() || this.creating()) return;
    await this.load();
  }
  toggleCreation(open: boolean): void {
    this.creating.set(open);
    if (!open) void this.refreshIfIdle();
  }
  chooseScope(context: EventContextRef): void {
    this.selectedContext.set(context);
    const kinds = { event: 'EVENT', group: 'EVENT_GROUP', 'major-event': 'MAJOR_EVENT' } as const;
    this.scope.set({ mode: 'RESOURCE', kind: kinds[context.kind], id: context.id });
  }
  operationUnavailable(operation: AdminMcpOperationInfo): boolean {
    return (
      (operation.requiresAllAuthorized === true && this.form.controls.scopeMode.value === 'RESOURCE') ||
      (operation.kind === 'mutation' && !this.settings()?.proposalsEnabled)
    );
  }
  toggleOperation(field: string, checked: boolean): void {
    const operation = this.catalog().find((item) => item.field === field);
    if (checked && (!operation || this.operationUnavailable(operation))) return;
    this.selected.update((selected) =>
      checked ? [...new Set([...selected, field])].slice(0, 300) : selected.filter((value) => value !== field),
    );
  }
  toggleDomain(operations: AdminMcpOperationInfo[], checked: boolean): void {
    for (const operation of operations) this.toggleOperation(operation.field, checked);
  }
  operationLabel(field: string): string {
    return this.catalog().find((operation) => operation.field === field)?.label ?? field;
  }
  scopeKind(kind: 'EVENT' | 'EVENT_GROUP' | 'MAJOR_EVENT'): string {
    return { EVENT: 'Evento', EVENT_GROUP: 'Grupo de eventos', MAJOR_EVENT: 'Grande evento' }[kind];
  }
  clientName(id: string): string {
    return this.settings()?.clients.find((client) => client.id === id)?.name ?? id;
  }
  active(delegation: AdminMcpDelegation): boolean {
    return !delegation.revokedAt && Date.parse(delegation.expiresAt) > Date.now();
  }
  status(command: AdminMcpCommand): string {
    return {
      PENDING: 'Pendente',
      APPLYING: 'Em execução',
      APPLIED: 'Aplicada',
      REJECTED: 'Rejeitada',
      UNCERTAIN: 'Resultado incerto',
    }[command.state];
  }
  expired(command: AdminMcpCommand): boolean {
    return Date.parse(command.expiresAt) <= Date.now();
  }
  approvable(command: AdminMcpCommand): boolean {
    return command.state === 'PENDING' && command.canApprove && !this.expired(command);
  }
  async createDelegation(): Promise<void> {
    this.form.markAllAsTouched();
    const fields = this.form.getRawValue();
    if (this.busy() || this.form.invalid || !this.settings()?.enabled || !this.selected().length) return;
    const scope = fields.scopeMode === 'ALL_AUTHORIZED' ? ({ mode: 'ALL_AUTHORIZED' } as const) : this.scope();
    if (!scope || (scope.mode === 'ALL_AUTHORIZED' && !fields.broadConsent)) return;
    if (!this.settings()?.clients.some((client) => client.id === fields.clientId)) return;
    if (
      this.catalog().some(
        (operation) => this.selected().includes(operation.field) && this.operationUnavailable(operation),
      )
    ) {
      this.showError(
        new Error(
          'Há operações incompatíveis com a abrangência escolhida. Remova-as ou escolha todos os recursos já permitidos.',
        ),
        '',
      );
      return;
    }
    if (
      !fields.personalData &&
      this.catalog().some((operation) => this.selected().includes(operation.field) && operation.personalData)
    ) {
      this.showError(
        new Error(
          'As operações selecionadas acessam dados pessoais. Autorize esse acesso explicitamente ou remova essas operações.',
        ),
        '',
      );
      return;
    }
    this.busy.set(true);
    this.error.set('');
    try {
      await this.api.create({
        clientId: fields.clientId,
        operations: this.selected(),
        scope,
        personalData: fields.personalData,
        expiresAt: new Date(Date.now() + fields.hours * 3600000).toISOString(),
        maxProposals: fields.maxProposals,
      });
      this.creating.set(false);
      this.form.reset();
      this.selected.set([]);
      this.scope.set(null);
      this.selectedContext.set(null);
      this.feedback.set('Autorização criada.');
      this.pendingRefresh = true;
    } catch (error) {
      this.showError(error, 'Não foi possível criar a autorização. Revise os campos.');
    } finally {
      this.busy.set(false);
      void this.refreshIfIdle();
    }
  }
  async review(command: AdminMcpCommand, event?: Event): Promise<void> {
    if (this.busy() || !this.approvable(command)) return;
    await this.run(async () => {
      const applied = await firstValueFrom(
        this.dialog
          .open<CommandReviewDialogComponent, AdminMcpCommand, boolean>(CommandReviewDialogComponent, {
            data: structuredClone(command),
            width: '48rem',
            maxWidth: 'calc(100vw - 2rem)',
            autoFocus: 'first-heading',
            restoreFocus: false,
          })
          .afterClosed(),
      );
      if (applied) this.feedback.set('Operação aprovada e executada.');
      // Closing also reloads after an execution whose response was lost.
      this.pendingRefresh = true;
    }, event?.currentTarget);
  }
  async reject(command: AdminMcpCommand, event?: Event): Promise<void> {
    if (command.state !== 'PENDING') return;
    await this.confirm(
      'Rejeitar operação?',
      'Esta proposta será encerrada sem executar a operação.',
      'Rejeitar',
      async () => {
        await this.api.decide(command.id, { decision: 'REJECT', expectedFingerprint: command.fingerprint });
        this.feedback.set('Operação rejeitada.');
      },
      event?.currentTarget,
    );
  }
  async revoke(delegation: AdminMcpDelegation, event?: Event): Promise<void> {
    if (!this.active(delegation)) return;
    await this.confirm(
      'Revogar autorização?',
      'O aplicativo perderá este acesso. As propostas pendentes deixarão de poder ser aprovadas.',
      'Revogar',
      async () => {
        await this.api.revoke(delegation.id);
        this.feedback.set('Autorização revogada.');
      },
      event?.currentTarget,
    );
  }
  private async confirm(
    title: string,
    message: string,
    confirmLabel: string,
    action: () => Promise<void>,
    trigger?: EventTarget | null,
  ): Promise<void> {
    await this.run(async () => {
      const confirmed = await firstValueFrom(
        this.dialog
          .open(ConfirmationDialogComponent, {
            restoreFocus: false,
            data: { title, message, confirmLabel, cancelLabel: 'Cancelar', tone: 'danger' },
          })
          .afterClosed(),
      );
      if (confirmed) {
        await action();
        this.pendingRefresh = true;
      }
    }, trigger);
  }
  private async run(action: () => Promise<void>, trigger?: EventTarget | null): Promise<void> {
    if (this.busy() || this.loading()) return;
    this.busy.set(true);
    this.error.set('');
    this.feedback.set('');
    try {
      await action();
    } catch (error) {
      this.pendingRefresh = true;
      this.showError(error, 'Não foi possível concluir. Atualize a fila e confira o estado da operação.');
    } finally {
      this.busy.set(false);
      await this.refreshIfIdle();
      afterNextRender(
        () => {
          if (this.error()) this.alert()?.nativeElement.focus();
          else if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus();
          else this.heading()?.nativeElement.focus();
        },
        { injector: this.injector },
      );
    }
  }
  private showError(error: unknown, fallback: string): void {
    this.error.set(mcpErrorMessage(error, fallback));
    afterNextRender(() => this.alert()?.nativeElement.focus(), { injector: this.injector });
  }
}
