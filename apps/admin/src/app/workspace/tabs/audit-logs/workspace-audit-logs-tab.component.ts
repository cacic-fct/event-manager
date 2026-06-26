import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { firstValueFrom } from 'rxjs';
import { AuditLogApiService, AuditLogExplorerInput } from '../../../graphql/audit-log-api.service';
import {
  AuditLogEntityType,
  AuditLogExplorerEntry,
  AuditLogExplorerResult,
  AuditLogExplorerRevertedStatus,
  AuditLogOperation,
} from '../../../graphql/models';
import { getErrorMessage } from '../../../shared/error-message';
import {
  AUDIT_LOG_ENTITY_TYPE_OPTIONS,
  AUDIT_LOG_OPERATION_OPTIONS,
  AUDIT_LOG_PAGE_SIZE_OPTIONS,
  AUDIT_LOG_REVERTED_STATUS_OPTIONS,
  auditLogActorTypeLabel,
  auditLogEntityTypeLabel,
  auditLogOperationIcon,
  auditLogOperationLabel,
} from './workspace-audit-log-utils';

type AuditLogFilterForm = {
  query: FormControl<string>;
  actor: FormControl<string>;
  entity: FormControl<string>;
  entityType: FormControl<AuditLogEntityType | ''>;
  operation: FormControl<AuditLogOperation | ''>;
  dateFrom: FormControl<string>;
  dateTo: FormControl<string>;
  revertedStatus: FormControl<AuditLogExplorerRevertedStatus>;
};

@Component({
  selector: 'app-workspace-audit-logs-tab',
  imports: [
    DatePipe,
    ReactiveFormsModule,
    MatButtonModule,
    MatChipsModule,
    MatExpansionModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatSelectModule,
    MatTooltipModule,
  ],
  templateUrl: './workspace-audit-logs-tab.component.html',
  styleUrls: ['../workspace-tab.shared.scss', './workspace-audit-logs-tab.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkspaceAuditLogsTabComponent {
  private readonly api = inject(AuditLogApiService);

  protected readonly filters = new FormGroup<AuditLogFilterForm>({
    query: new FormControl('', { nonNullable: true }),
    actor: new FormControl('', { nonNullable: true }),
    entity: new FormControl('', { nonNullable: true }),
    entityType: new FormControl('', { nonNullable: true }),
    operation: new FormControl('', { nonNullable: true }),
    dateFrom: new FormControl('', { nonNullable: true }),
    dateTo: new FormControl('', { nonNullable: true }),
    revertedStatus: new FormControl('ALL', { nonNullable: true }),
  });

  protected readonly entityTypeOptions = AUDIT_LOG_ENTITY_TYPE_OPTIONS;
  protected readonly operationOptions = AUDIT_LOG_OPERATION_OPTIONS;
  protected readonly pageSizeOptions = AUDIT_LOG_PAGE_SIZE_OPTIONS;
  protected readonly revertedStatusOptions = AUDIT_LOG_REVERTED_STATUS_OPTIONS;

  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly result = signal<AuditLogExplorerResult | null>(null);
  protected readonly skip = signal(0);
  protected readonly take = signal<(typeof AUDIT_LOG_PAGE_SIZE_OPTIONS)[number]>(25);

  protected readonly rangeStart = computed(() => {
    const result = this.result();
    return result && result.total > 0 ? result.skip + 1 : 0;
  });
  protected readonly rangeEnd = computed(() => {
    const result = this.result();
    return result ? Math.min(result.skip + result.entries.length, result.total) : 0;
  });
  protected readonly canGoPrevious = computed(() => this.skip() > 0 && !this.loading());
  protected readonly canGoNext = computed(() => {
    const result = this.result();
    return Boolean(result && result.skip + result.take < result.total && !this.loading());
  });

  constructor() {
    void this.load();
  }

  protected async applyFilters(): Promise<void> {
    this.skip.set(0);
    await this.load();
  }

  protected async clearFilters(): Promise<void> {
    this.filters.reset({
      query: '',
      actor: '',
      entity: '',
      entityType: '',
      operation: '',
      dateFrom: '',
      dateTo: '',
      revertedStatus: 'ALL',
    });
    this.skip.set(0);
    await this.load();
  }

  protected async previousPage(): Promise<void> {
    this.skip.update((value) => Math.max(0, value - this.take()));
    await this.load();
  }

  protected async nextPage(): Promise<void> {
    this.skip.update((value) => value + this.take());
    await this.load();
  }

  protected async setPageSize(take: (typeof AUDIT_LOG_PAGE_SIZE_OPTIONS)[number]): Promise<void> {
    this.take.set(take);
    this.skip.set(0);
    await this.load();
  }

  protected trackEntry(_: number, entry: AuditLogExplorerEntry): string {
    return entry.id;
  }

  protected entityTypeLabel(entityType: AuditLogEntityType): string {
    return auditLogEntityTypeLabel(entityType);
  }

  protected operationLabel(operation: AuditLogOperation): string {
    return auditLogOperationLabel(operation);
  }

  protected actorTypeLabel = auditLogActorTypeLabel;

  protected operationIcon(operation: AuditLogOperation): string {
    return auditLogOperationIcon(operation);
  }

  protected fallbackSummary(entry: AuditLogExplorerEntry): string {
    if (entry.changes.length === 1) {
      return `${entry.changes[0].label} alterado.`;
    }

    if (entry.changes.length > 1) {
      return `${entry.changes.length} campos alterados.`;
    }

    return 'Registro de auditoria criado.';
  }

  protected changeSummary(entry: AuditLogExplorerEntry): string {
    if (entry.changes.length === 0) {
      return 'Sem campos alterados';
    }

    const labels = entry.changes.slice(0, 3).map((change) => change.label);
    const remainder = entry.changes.length - labels.length;
    return remainder > 0 ? `${labels.join(', ')} +${remainder}` : labels.join(', ');
  }

  protected jsonLabel(value: string | null | undefined): string {
    return value?.trim() ? value : 'null';
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      this.result.set(await firstValueFrom(this.api.searchExplorer(this.buildInput())));
    } catch (error) {
      this.error.set(getErrorMessage(error, 'Não foi possível carregar os logs de auditoria.'));
    } finally {
      this.loading.set(false);
    }
  }

  private buildInput(): AuditLogExplorerInput {
    const value = this.filters.getRawValue();

    return {
      query: this.normalized(value.query),
      actor: this.normalized(value.actor),
      entity: this.normalized(value.entity),
      entityType: value.entityType || undefined,
      operation: value.operation || undefined,
      dateFrom: this.dateBoundary(value.dateFrom, 'start'),
      dateTo: this.dateBoundary(value.dateTo, 'end'),
      revertedStatus: value.revertedStatus,
      skip: this.skip(),
      take: this.take(),
    };
  }

  private normalized(value: string): string | undefined {
    const normalized = value.trim();
    return normalized || undefined;
  }

  private dateBoundary(value: string, boundary: 'start' | 'end'): string | undefined {
    if (!value) {
      return undefined;
    }

    const suffix = boundary === 'start' ? 'T00:00:00.000' : 'T23:59:59.999';
    return new Date(`${value}${suffix}`).toISOString();
  }
}
