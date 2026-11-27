import { DatePipe } from '@angular/common';
import {
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { ActivatedRoute, RouterLink } from '@angular/router';
import type {
  McpAdminCapability,
  McpAdminDelegation,
  McpAdminProposal,
  McpAdminProposalPage,
  McpAdminSettings,
  McpProposalChange,
  McpProposalStatus,
} from '@cacic-fct/event-manager-mcp-contracts';
import { auditTime, firstValueFrom, map } from 'rxjs';
import { ConfirmationDialogComponent } from '../app-shell/dialogs/confirmation-dialog.component';
import { RealtimeApiService } from '../graphql/realtime-api.service';
import { ReviewTextComparisonComponent } from '../shared/review-queue/review-text-comparison.component';
import { ReviewQueuePaginationComponent } from '../shared/review-queue/review-queue-pagination.component';
import { EventApiService } from '../graphql/event-api.service';
import type { EventContextRef } from '../shared/event-context-picker.component';
import { McpEventDialogComponent } from './mcp-event-dialog.component';
import { McpEventReviewDialogComponent } from './mcp-event-review-dialog.component';
import { McpApi, mcpErrorMessage } from './mcp-api.service';

const STATUS_LABELS: Record<McpProposalStatus, string> = {
  PENDING: 'Pendente',
  APPLIED: 'Aplicada',
  REJECTED: 'Rejeitada',
  EXPIRED: 'Expirada',
  REVOKED: 'Revogada',
  STALE: 'Desatualizada',
};

@Component({
  selector: 'app-mcp-page',
  imports: [
    DatePipe,
    ReactiveFormsModule,
    MatButtonModule,
    MatExpansionModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressBarModule,
    MatSelectModule,
    ReviewTextComparisonComponent,
    ReviewQueuePaginationComponent,
    RouterLink,
  ],
  templateUrl: './mcp-page.component.html',
  styleUrl: './mcp-page.component.scss',
})
export class McpPageComponent {
  private readonly api = inject(McpApi);
  private readonly dialog = inject(MatDialog);
  private readonly events = inject(EventApiService);
  private readonly injector = inject(Injector);
  private readonly heading = viewChild<ElementRef<HTMLHeadingElement>>('heading');
  private readonly alert = viewChild<ElementRef<HTMLParagraphElement>>('alert');
  private readonly destroyRef = inject(DestroyRef);
  private request = 0;
  private refreshing = false;
  private refreshPending = false;
  readonly proposalId = toSignal(inject(ActivatedRoute).queryParamMap.pipe(map((params) => params.get('id'))), {
    initialValue: null,
  });

  readonly settings = signal<McpAdminSettings | null>(null);
  readonly delegations = signal<McpAdminDelegation[]>([]);
  readonly result = signal<McpAdminProposalPage>({ items: [], hasMore: false });
  readonly page = signal(0);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly loadError = signal('');
  readonly actionError = signal('');
  readonly feedback = signal('');
  readonly selectedEvents = signal<{ id: string; name: string }[]>([]);
  readonly capabilityOptions: { value: McpAdminCapability; label: string }[] = [
    { value: 'EVENT_READ', label: 'Consultar eventos' },
    { value: 'ATTENDANCE_READ', label: 'Consultar totais de presença' },
    { value: 'PREPARATION_READ', label: 'Consultar instruções privadas de preparação' },
    { value: 'MATERIALS_READ', label: 'Consultar materiais e seus endereços de acesso' },
    { value: 'SUBSCRIPTIONS_READ', label: 'Consultar totais de inscrições' },
    { value: 'FORMS_READ', label: 'Consultar formulários do evento' },
    { value: 'CONTENT_REVIEWS_READ', label: 'Consultar revisões de materiais' },
    { value: 'DESCRIPTION_PROPOSE', label: 'Propor alterações de descrição' },
    { value: 'EVENT_CONTENT_PROPOSE', label: 'Propor alterações de conteúdo do evento' },
    { value: 'LOCATION_PROPOSE', label: 'Propor alterações de local' },
    { value: 'PREPARATION_PROPOSE', label: 'Propor alterações de preparação' },
    { value: 'LIVESTREAM_PROPOSE', label: 'Propor alterações de transmissão' },
  ];
  readonly form = new FormGroup({
    clientId: new FormControl('', { nonNullable: true, validators: Validators.required }),
    capabilities: new FormControl<McpAdminCapability[]>(['EVENT_READ'], {
      nonNullable: true,
      validators: Validators.required,
    }),
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
    inject(RealtimeApiService)
      .watchMcpReviews()
      .pipe(auditTime(250), takeUntilDestroyed())
      .subscribe(() => {
        this.refreshPending = true;
        void this.refreshIfIdle();
      });
    effect(() => {
      this.proposalId();
      void this.load(0);
    });
  }

  async load(page = this.page()): Promise<void> {
    this.refreshPending = false;
    this.loading.set(true);
    this.loadError.set('');
    await this.loadPage(page, false);
  }

  private async loadPage(page: number, background: boolean): Promise<void> {
    const request = ++this.request;
    try {
      const [settings, delegations, result] = await Promise.all([
        this.api.settings(),
        this.api.delegations(),
        this.api.proposals(page, this.proposalId()),
      ]);
      if (request !== this.request) return;
      if (background && this.busy()) {
        this.refreshPending = true;
        return;
      }
      this.settings.set(settings);
      this.delegations.set(delegations);
      this.result.set(result);
      this.page.set(page);
      this.loadError.set('');
    } catch (error) {
      if (request === this.request && !background) {
        this.loadError.set(mcpErrorMessage(error, 'Não foi possível carregar a fila. Tente novamente.'));
      }
    } finally {
      if (request === this.request) this.loading.set(false);
      if (background) this.refreshing = false;
      void this.refreshIfIdle();
    }
  }

  private async refreshIfIdle(): Promise<void> {
    if (this.destroyRef.destroyed || !this.refreshPending || this.refreshing || this.loading() || this.busy()) return;
    this.refreshPending = false;
    this.refreshing = true;
    await this.loadPage(this.page(), true);
  }

  clientName(id: string): string {
    return this.settings()?.clients.find((client) => client.id === id)?.name ?? id;
  }

  capabilityLabel(value: McpAdminCapability): string {
    return this.capabilityOptions.find((option) => option.value === value)?.label ?? value;
  }

  isProposalCapability(value: McpAdminCapability): boolean {
    return value.endsWith('_PROPOSE');
  }

  invalidCapabilities(): boolean {
    const capabilities = this.form.controls.capabilities.value;
    return (
      !capabilities.includes('EVENT_READ') ||
      (!this.settings()?.proposalsEnabled && capabilities.some((value) => this.isProposalCapability(value)))
    );
  }

  proposalChanges(proposal: McpAdminProposal): McpProposalChange[] {
    return (
      proposal.changes ?? [
        {
          field: 'description',
          label: 'Descrição',
          before: proposal.descriptionBefore,
          after: proposal.descriptionAfter,
        },
      ]
    );
  }

  statusLabel(status: McpProposalStatus): string {
    return STATUS_LABELS[status];
  }

  publicationLabel(state: string): string {
    return (
      (
        {
          PUBLISHED: 'Publicado',
          DRAFT: 'Rascunho',
          UNPUBLISHED: 'Não publicado',
          SCHEDULED: 'Publicação agendada',
        } as Record<string, string>
      )[state] ?? state
    );
  }

  isActive(delegation: McpAdminDelegation): boolean {
    return !delegation.revokedAt && new Date(delegation.expiresAt).getTime() > Date.now();
  }

  removeEvent(id: string): void {
    this.selectedEvents.update((events) => events.filter((event) => event.id !== id));
  }

  async addEvent(): Promise<void> {
    if (this.busy() || this.selectedEvents().length >= 20) return;
    this.busy.set(true);
    this.actionError.set('');
    try {
      const selected = await firstValueFrom(
        this.dialog
          .open<McpEventDialogComponent, unknown, EventContextRef>(McpEventDialogComponent, {
            width: '640px',
            maxWidth: 'calc(100vw - 2rem)',
          })
          .afterClosed(),
      );
      if (!selected || selected.kind !== 'event') return;
      if (this.selectedEvents().some(({ id }) => id === selected.id)) return;
      const event = await firstValueFrom(this.events.getEvent(selected.id));
      this.selectedEvents.update((events) => [...events, { id: event.id, name: event.name }]);
    } catch (error) {
      this.showError(error, 'Não foi possível selecionar o evento. Tente novamente.');
    } finally {
      this.busy.set(false);
      void this.refreshIfIdle();
    }
  }

  async createDelegation(): Promise<void> {
    if (this.busy() || this.loading() || !this.settings()?.enabled) return;
    this.form.markAllAsTouched();
    const fields = this.form.getRawValue();
    if (this.form.invalid || !this.selectedEvents().length || this.selectedEvents().length > 20) return;
    if (!this.settings()?.clients.some(({ id }) => id === fields.clientId)) return;
    if (this.invalidCapabilities()) return;
    this.busy.set(true);
    this.actionError.set('');
    this.feedback.set('');
    try {
      await this.api.create({
        clientId: fields.clientId,
        capabilities: fields.capabilities,
        eventIds: this.selectedEvents().map(({ id }) => id),
        expiresAt: new Date(Date.now() + fields.hours * 3600000).toISOString(),
        maxProposals: fields.maxProposals,
      });
      this.selectedEvents.set([]);
      this.feedback.set('Autorização criada.');
      await this.load();
    } catch (error) {
      this.showError(error, 'Não foi possível criar a autorização. Revise os campos e tente novamente.');
    } finally {
      this.busy.set(false);
      void this.refreshIfIdle();
    }
  }

  async revoke(delegation: McpAdminDelegation, event?: Event): Promise<void> {
    if (this.busy() || this.loading() || !this.isActive(delegation)) return;
    await this.confirmAction(
      'Revogar autorização?',
      `O aplicativo ${this.clientName(delegation.clientId)} perderá este acesso. As propostas pendentes desta autorização não poderão ser aprovadas.`,
      'Revogar',
      async () => {
        await this.api.revoke(delegation.id);
        this.feedback.set('Autorização revogada.');
      },
      event?.currentTarget,
    );
  }

  async review(proposal: McpAdminProposal, event?: Event): Promise<void> {
    if (
      this.busy() ||
      this.loading() ||
      proposal.status !== 'PENDING' ||
      !proposal.canApprove ||
      proposal.baseUpdatedAt !== proposal.currentUpdatedAt ||
      !proposal.reviewFields?.length
    )
      return;
    await this.runDialogAction(async () => {
      const applied = await firstValueFrom(
        this.dialog
          .open<McpEventReviewDialogComponent, McpAdminProposal, boolean>(McpEventReviewDialogComponent, {
            data: proposal,
            autoFocus: 'first-heading',
            restoreFocus: false,
            width: '54rem',
            maxWidth: 'calc(100vw - 2rem)',
          })
          .afterClosed(),
      );
      if (applied) this.feedback.set('Proposta aprovada e aplicada.');
      return !!applied;
    }, event?.currentTarget);
  }

  async reject(proposal: McpAdminProposal, event?: Event): Promise<void> {
    if (this.busy() || this.loading() || proposal.status !== 'PENDING') return;
    await this.confirmAction(
      'Rejeitar esta proposta?',
      `A proposta para ${proposal.eventName} será encerrada sem alterar o evento.`,
      'Rejeitar proposta',
      async () => {
        await this.api.decide(proposal.id, {
          decision: 'REJECT',
          expectedUpdatedAt: proposal.baseUpdatedAt,
          ...(proposal.operation ? { expectedOperation: proposal.operation } : {}),
        });
        this.feedback.set('Proposta rejeitada.');
      },
      event?.currentTarget,
    );
  }

  private async confirmAction(
    title: string,
    message: string,
    confirmLabel: string,
    action: () => Promise<void>,
    trigger?: EventTarget | null,
  ): Promise<void> {
    await this.runDialogAction(async () => {
      const confirmed = await firstValueFrom(
        this.dialog
          .open(ConfirmationDialogComponent, {
            restoreFocus: false,
            data: { title, message, confirmLabel, cancelLabel: 'Cancelar', tone: 'danger' },
          })
          .afterClosed(),
      );
      if (!confirmed) return false;
      await action();
      return true;
    }, trigger);
  }

  private async runDialogAction(action: () => Promise<boolean>, trigger?: EventTarget | null): Promise<void> {
    this.busy.set(true);
    this.actionError.set('');
    this.feedback.set('');
    let cancelled = false;
    try {
      cancelled = !(await action());
      if (cancelled) return;
      await this.load();
      afterNextRender(() => this.heading()?.nativeElement.focus(), { injector: this.injector });
    } catch (error) {
      this.showError(error, 'Não foi possível concluir a ação. Atualize a fila e tente novamente.');
    } finally {
      this.busy.set(false);
      await this.refreshIfIdle();
      if (cancelled) {
        afterNextRender(
          () => {
            if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus();
            else this.heading()?.nativeElement.focus();
          },
          { injector: this.injector },
        );
      }
    }
  }

  private showError(error: unknown, fallback: string): void {
    this.actionError.set(mcpErrorMessage(error, fallback));
    afterNextRender(() => this.alert()?.nativeElement.focus(), { injector: this.injector });
  }
}
