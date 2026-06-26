import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { AuditLogApiService } from '../../graphql/audit-log-api.service';
import { AuditLogEntry, AuditLogEntityType, AuditLogOperation, AuditLogRevertMode } from '../../graphql/models';
import { ConfirmationDialogComponent, ConfirmationDialogData } from '../../shared/components/confirmation-dialog.component';
import { auditLogOperationIcon, auditLogOperationLabel } from '../tabs/audit-logs/workspace-audit-log-utils';

export interface AuditLogDialogData {
  entityType: AuditLogEntityType;
  entityId: string;
  entityLabel?: string | null;
}

@Component({
  selector: 'app-audit-log-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, MatButtonModule, MatDialogModule, MatIconModule, MatProgressSpinnerModule],
  template: `
    <h2 mat-dialog-title>Histórico</h2>

    <mat-dialog-content class="history-content">
      <header class="history-header">
        <div>
          <span>Registro auditado</span>
          <strong>{{ title() }}</strong>
        </div>
        <div>
          <span>ID</span>
          <strong>{{ data.entityId }}</strong>
        </div>
      </header>

      @if (loading()) {
        <div class="loading-state">
          <mat-spinner diameter="36" />
          <span>Carregando histórico...</span>
        </div>
      } @else if (error()) {
        <div class="empty-state">
          <mat-icon>error</mat-icon>
          <h3>Não foi possível carregar o histórico</h3>
          <p>{{ error() }}</p>
          <button mat-stroked-button type="button" (click)="load()">
            <mat-icon>refresh</mat-icon>
            Tentar novamente
          </button>
        </div>
      } @else {
        <section class="timeline" aria-label="Histórico de alterações">
          @for (entry of entries(); track entry.id) {
            <article class="history-entry" [class.reverted]="entry.revertedAt">
              <div class="entry-marker">
                <mat-icon>{{ operationIcon(entry.operation) }}</mat-icon>
              </div>

              <div class="entry-body">
                <header class="entry-heading">
                  <div>
                    <span class="operation-label">{{ operationLabel(entry.operation) }}</span>
                    <h3>{{ entry.summary || fallbackSummary(entry) }}</h3>
                  </div>
                  <time [attr.datetime]="entry.createdAt">{{ entry.createdAt | date: 'short' }}</time>
                </header>

                <div class="entry-meta">
                  <span>
                    <mat-icon>person</mat-icon>
                    {{ entry.actorName }}
                  </span>
                  @if (entry.actorEmail) {
                    <span>{{ entry.actorEmail }}</span>
                  }
                  @if (entry.permission) {
                    <span>{{ entry.permission }}</span>
                  }
                  @if (entry.groupedCount > 1) {
                    <span>{{ entry.groupedCount }} alterações agrupadas</span>
                  }
                </div>

                @if (entry.groupedCount > 1) {
                  <p class="grouping-note">
                    Agrupado de {{ entry.firstRecordedAt | date: 'short' }} até
                    {{ entry.lastRecordedAt | date: 'short' }} para reduzir ruído operacional.
                  </p>
                }

                @if (entry.revertedAt) {
                  <p class="reverted-note">
                    Desfeito por {{ entry.revertedByName || 'sistema' }} em
                    {{ entry.revertedAt | date: 'short' }}.
                  </p>
                }

                @if (entry.changes.length > 0) {
                  <div class="change-list">
                    @for (change of entry.changes; track change.field) {
                      <div class="change-row">
                        <strong>{{ change.label }}</strong>
                        <div class="change-values">
                          <span>{{ valueLabel(change.beforeValue) }}</span>
                          <mat-icon>arrow_forward</mat-icon>
                          <span>{{ valueLabel(change.afterValue) }}</span>
                        </div>
                      </div>
                    }
                  </div>
                } @else {
                  <p class="grouping-note">Este registro não tem campos alterados para exibir.</p>
                }

                @if (entry.canRevert && !entry.revertedAt) {
                  <div class="entry-actions">
                    <button
                      mat-stroked-button
                      type="button"
                      [disabled]="busyEntryId() === entry.id"
                      (click)="requestRevert(entry, 'ENTRY_ONLY')">
                      <mat-icon>undo</mat-icon>
                      Desfazer alteração
                    </button>
                    <button
                      mat-stroked-button
                      type="button"
                      [disabled]="busyEntryId() === entry.id"
                      (click)="requestRevert(entry, 'ENTRY_AND_AFTER')">
                      <mat-icon>history</mat-icon>
                      Desfazer daqui em diante
                    </button>
                  </div>
                }
              </div>
            </article>
          } @empty {
            <div class="empty-state">
              <mat-icon>history_toggle_off</mat-icon>
              <h3>Nenhum histórico encontrado</h3>
              <p>As próximas alterações desse registro aparecerão aqui.</p>
            </div>
          }
        </section>
      }
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close type="button">Fechar</button>
    </mat-dialog-actions>
  `,
  styles: `
    .history-content {
      display: grid;
      gap: 1rem;
      min-width: min(44rem, 100%);
    }

    .history-header {
      display: grid;
      gap: 0.75rem;
      grid-template-columns: minmax(0, 1.25fr) minmax(0, 0.75fr);
    }

    .history-header div,
    .history-entry,
    .empty-state {
      border: 1px solid color-mix(in srgb, currentColor 16%, transparent);
      border-radius: 8px;
    }

    .history-header div {
      display: grid;
      gap: 0.25rem;
      padding: 0.75rem;
    }

    .history-header span,
    .entry-meta,
    .grouping-note,
    .reverted-note {
      color: color-mix(in srgb, currentColor 68%, transparent);
      font: var(--mat-sys-body-small);
    }

    .history-header strong,
    .entry-heading h3,
    .change-row strong,
    .change-values span {
      overflow-wrap: anywhere;
    }

    .loading-state,
    .empty-state {
      align-items: center;
      display: grid;
      gap: 0.75rem;
      justify-items: center;
      padding: 2rem;
      text-align: center;
    }

    .empty-state h3,
    .empty-state p,
    .entry-heading h3,
    .grouping-note,
    .reverted-note {
      margin: 0;
    }

    .timeline {
      display: grid;
      gap: 0.875rem;
    }

    .history-entry {
      display: grid;
      gap: 0.875rem;
      grid-template-columns: auto minmax(0, 1fr);
      padding: 0.875rem;
    }

    .entry-marker {
      align-items: center;
      background: var(--mat-sys-primary-container);
      border-radius: 999px;
      color: var(--mat-sys-on-primary-container);
      display: inline-flex;
      height: 2.25rem;
      justify-content: center;
      width: 2.25rem;
    }

    .entry-body {
      display: grid;
      gap: 0.75rem;
      min-width: 0;
    }

    .entry-heading,
    .entry-meta,
    .change-values,
    .entry-actions {
      display: flex;
      gap: 0.75rem;
    }

    .entry-heading {
      align-items: flex-start;
      justify-content: space-between;
    }

    .operation-label {
      color: var(--mat-sys-primary);
      display: block;
      font: var(--mat-sys-label-medium);
      margin-bottom: 0.25rem;
    }

    .entry-meta,
    .entry-actions {
      flex-wrap: wrap;
    }

    .entry-meta span,
    .change-values {
      align-items: center;
      display: inline-flex;
      min-width: 0;
    }

    .entry-meta mat-icon {
      font-size: 1rem;
      height: 1rem;
      margin-right: 0.25rem;
      width: 1rem;
    }

    .change-list {
      border-top: 1px solid color-mix(in srgb, currentColor 12%, transparent);
      display: grid;
    }

    .change-row {
      display: grid;
      gap: 0.75rem;
      grid-template-columns: minmax(8rem, 0.65fr) minmax(0, 1.35fr);
      padding: 0.75rem 0;
    }

    .change-row + .change-row {
      border-top: 1px solid color-mix(in srgb, currentColor 12%, transparent);
    }

    .change-values {
      justify-content: space-between;
    }

    .change-values span {
      border-radius: 6px;
      flex: 1 1 0;
      min-width: 0;
      padding: 0.5rem;
    }

    .change-values mat-icon {
      color: color-mix(in srgb, currentColor 62%, transparent);
      flex: 0 0 auto;
      font-size: 1.125rem;
      height: 1.125rem;
      width: 1.125rem;
    }

    @media (max-width: 720px) {
      .history-header,
      .history-entry,
      .change-row {
        grid-template-columns: 1fr;
      }

      .entry-heading,
      .change-values {
        align-items: stretch;
        flex-direction: column;
      }

      .change-values mat-icon {
        transform: rotate(90deg);
      }
    }
  `,
})
export class AuditLogDialogComponent {
  protected readonly data = inject<AuditLogDialogData>(MAT_DIALOG_DATA);
  private readonly api = inject(AuditLogApiService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly entries = signal<AuditLogEntry[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly confirmingEntryId = signal<string | null>(null);
  protected readonly revertingEntryId = signal<string | null>(null);
  protected readonly title = computed(() => this.data.entityLabel || this.data.entityId);
  protected readonly busyEntryId = computed(() => this.confirmingEntryId() ?? this.revertingEntryId());

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const entries = await firstValueFrom(
        this.api.listEntityHistory({
          entityType: this.data.entityType,
          entityId: this.data.entityId,
        }),
      );
      this.entries.set(entries);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Erro desconhecido.');
    } finally {
      this.loading.set(false);
    }
  }

  protected async requestRevert(entry: AuditLogEntry, mode: AuditLogRevertMode): Promise<void> {
    if (this.busyEntryId()) {
      return;
    }

    this.confirmingEntryId.set(entry.id);

    try {
      const confirmed = await firstValueFrom(
        this.dialog
          .open(ConfirmationDialogComponent, {
            data: this.revertConfirmationData(entry, mode),
            width: 'min(560px, calc(100vw - 32px))',
          })
          .afterClosed(),
      );

      if (confirmed === true) {
        await this.revert(entry, mode);
      }
    } finally {
      this.confirmingEntryId.set(null);
    }
  }

  private async revert(entry: AuditLogEntry, mode: AuditLogRevertMode): Promise<void> {
    this.revertingEntryId.set(entry.id);

    try {
      await firstValueFrom(this.api.revertEntry({ entryId: entry.id, mode }));
      this.snackBar.open('Alteração desfeita e registrada no histórico.', 'OK', { duration: 5000 });
      await this.load();
    } catch (error) {
      this.snackBar.open(
        error instanceof Error ? error.message : 'Não foi possível desfazer a alteração.',
        'OK',
        { duration: 7000 },
      );
    } finally {
      this.revertingEntryId.set(null);
    }
  }

  protected valueLabel(value: string | null | undefined): string {
    if (value === null || value === undefined || value === '') {
      return 'Vazio';
    }

    return value;
  }

  protected fallbackSummary(entry: AuditLogEntry): string {
    if (entry.changes.length === 1) {
      return `${entry.changes[0].label} alterado.`;
    }

    if (entry.changes.length > 1) {
      return `${entry.changes.length} campos alterados.`;
    }

    return 'Registro de auditoria criado.';
  }

  protected operationLabel(operation: AuditLogOperation): string {
    return auditLogOperationLabel(operation);
  }

  protected operationIcon(operation: AuditLogOperation): string {
    return auditLogOperationIcon(operation);
  }

  private revertConfirmationData(entry: AuditLogEntry, mode: AuditLogRevertMode): ConfirmationDialogData {
    const affectsFuture = mode === 'ENTRY_AND_AFTER';

    return {
      title: affectsFuture ? 'Desfazer deste ponto em diante?' : 'Desfazer esta alteração?',
      message: affectsFuture
        ? 'O sistema vai registrar uma reversão auditada para este registro e para alterações posteriores do mesmo item.'
        : 'O sistema vai registrar uma reversão auditada para este registro.',
      details: [
        `Item auditado: ${this.title()}`,
        `Alteração: ${entry.summary || this.fallbackSummary(entry)}`,
        `Autor original: ${entry.actorName}`,
        `Registro: ${entry.id}`,
      ],
      confirmLabel: 'Desfazer',
      tone: 'danger',
    };
  }
}
