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
  AdminMcpCommandPreview,
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
import {
  CommandReviewDialogComponent,
  type CommandArgumentEdit,
  type CommandArgumentEditResult,
} from './command-review-dialog.component';
import { buildCommandArguments, commandArguments, serializeArgument, type CommandArgument } from './command-arguments';
import { CommandArgumentsComponent } from './command-arguments.component';

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
    CommandArgumentsComponent,
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
  readonly selectedCommands = signal<string[]>([]);
  readonly previews = signal<Record<string, AdminMcpCommandPreview>>({});
  readonly drafts = signal<Record<string, CommandArgument[]>>({});
  readonly attempted = signal<string[]>([]);
  readonly selectableCommands = computed(() => this.result().items.filter((command) => this.selectable(command)));
  readonly allCommandsSelected = computed(
    () =>
      this.selectableCommands().length > 0 &&
      this.selectableCommands().every((command) => this.selectedCommands().includes(command.id)),
  );
  readonly confirming = computed(() => Object.keys(this.previews()).length > 0);
  private readonly reviewButton = viewChild<ElementRef<HTMLButtonElement>>('reviewButton');
  private readonly confirmationHeading = viewChild<ElementRef<HTMLHeadingElement>>('confirmationHeading');
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
    if (this.busy() || this.creating() || this.confirming()) {
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
      if (this.busy() || this.creating() || this.confirming()) {
        this.pendingRefresh = true;
        return;
      }
      this.settings.set(settings);
      this.catalog.set(catalog);
      this.delegations.set(delegations);
      const previous = this.result().items;
      const drafts = this.drafts();
      this.drafts.set(
        Object.fromEntries(
          result.items.map((command) => [
            command.id,
            previous.some((item) => item.id === command.id && item.fingerprint === command.fingerprint)
              ? (drafts[command.id] ?? buildCommandArguments(command))
              : buildCommandArguments(command),
          ]),
        ),
      );
      this.result.set(result);
      this.selectedCommands.update((ids) =>
        ids.filter((id) => result.items.some((command) => command.id === id && this.selectable(command))),
      );
      this.page.set(page);
    } catch (error) {
      this.showError(error, 'Não foi possível carregar as operações. Tente novamente.');
    } finally {
      this.loading.set(false);
      void this.refreshIfIdle();
    }
  }
  private async refreshIfIdle(): Promise<void> {
    if (
      this.destroyRef.destroyed ||
      !this.pendingRefresh ||
      this.loading() ||
      this.busy() ||
      this.creating() ||
      this.confirming()
    )
      return;
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
  selectable(command: AdminMcpCommand): boolean {
    return (
      this.approvable(command) &&
      !this.attempted().includes(command.id) &&
      !!this.settings()?.enabled &&
      !!this.settings()?.proposalsEnabled
    );
  }
  toggleCommand(command: AdminMcpCommand, checked: boolean): void {
    if (this.busy() || this.loading() || this.confirming() || !this.selectable(command)) return;
    this.selectedCommands.update((ids) =>
      checked ? [...new Set([...ids, command.id])] : ids.filter((id) => id !== command.id),
    );
  }
  toggleAllCommands(checked: boolean): void {
    if (this.busy() || this.loading() || this.confirming()) return;
    this.selectedCommands.set(checked ? this.selectableCommands().map((command) => command.id) : []);
  }
  includeArgument(change: { field: CommandArgument; included: boolean }): void {
    if (this.busy() || this.confirming() || change.field.required || change.field.locked) return;
    change.field.included = change.included;
    this.drafts.update((drafts) => structuredClone(drafts));
  }
  async editArgument(command: AdminMcpCommand, field: CommandArgument, event?: Event): Promise<void> {
    if (!this.selectable(command) || field.locked || !field.included || this.confirming()) return;
    await this.run(async () => {
      const result = await firstValueFrom(
        this.dialog
          .open<CommandReviewDialogComponent, CommandArgumentEdit, CommandArgumentEditResult>(
            CommandReviewDialogComponent,
            {
              data: { field: structuredClone(field), targets: command.targets },
              width: '36rem',
              maxWidth: 'calc(100vw - 2rem)',
              restoreFocus: false,
            },
          )
          .afterClosed(),
      );
      if (result) {
        field.value = result.value;
        this.drafts.update((drafts) => structuredClone(drafts));
      }
    }, event?.currentTarget);
  }
  async prepareSelected(event?: Event): Promise<void> {
    if (this.confirming()) return;
    const commands = this.result().items.filter((command) => this.selectedCommands().includes(command.id));
    if (!commands.length || commands.some((command) => !this.selectable(command))) return;
    await this.run(async () => {
      const previews: Record<string, AdminMcpCommandPreview> = {};
      for (const command of commands) {
        previews[command.id] = await this.api.review(command.id, {
          arguments: commandArguments(this.drafts()[command.id]),
          expectedFingerprint: command.fingerprint,
        });
      }
      this.previews.set(previews);
      afterNextRender(() => this.confirmationHeading()?.nativeElement.focus(), { injector: this.injector });
    }, event?.currentTarget);
  }
  async cancelConfirmation(): Promise<void> {
    this.previews.set({});
    await this.refreshIfIdle();
    afterNextRender(() => this.reviewButton()?.nativeElement.focus(), { injector: this.injector });
  }
  async approveSelected(event?: Event): Promise<void> {
    const reviews = this.previews();
    const commands = this.result().items.filter((command) => reviews[command.id]);
    if (!commands.length) return;
    if (commands.some((command) => !this.selectable(command))) {
      this.showError(new Error('Uma operação não pode mais ser executada. Volte à revisão e atualize a fila.'), '');
      return;
    }
    await this.run(async () => {
      let applied = 0;
      try {
        for (const command of commands) {
          this.attempted.update((ids) => [...ids, command.id]);
          const result = await this.api.decide(command.id, {
            decision: 'APPROVE',
            expectedFingerprint: command.fingerprint,
            review: reviews[command.id],
          });
          if (result.state !== 'APPLIED') {
            throw new Error(
              'O resultado da execução é incerto. Não repita a operação. Confira a fila e o histórico antes de continuar.',
            );
          }
          applied++;
          this.selectedCommands.update((ids) => ids.filter((id) => id !== command.id));
        }
      } catch (error) {
        const detail = mcpErrorMessage(error, 'A execução não foi confirmada.');
        throw new Error(
          `${applied} ${applied === 1 ? 'operação aplicada' : 'operações aplicadas'}. ${detail} A execução das demais operações foi interrompida. Confira a fila e o histórico.`,
        );
      } finally {
        this.previews.set({});
        this.pendingRefresh = true;
      }
      this.feedback.set(
        `${applied} ${applied === 1 ? 'operação aprovada e executada' : 'operações aprovadas e executadas'}.`,
      );
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
          else if (this.confirming()) this.confirmationHeading()?.nativeElement.focus();
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
