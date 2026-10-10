import { DatePipe } from '@angular/common';
import {
  afterNextRender,
  Component,
  ElementRef,
  Injector,
  computed,
  inject,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';

type AuditCategory = 'all' | 'event' | 'receipt' | 'permission' | 'certificate';

interface AuditFilterOption {
  id: AuditCategory;
  label: string;
}

interface AuditFieldChange {
  field: string;
  beforeValue: string;
  afterValue: string;
}

interface AuditRecord {
  id: string;
  category: Exclude<AuditCategory, 'all'>;
  operationLabel: string;
  operationIcon: string;
  entityTypeLabel: string;
  entityLabel: string;
  summary: string;
  actorName: string;
  recordedAt: Date;
  changes: readonly AuditFieldChange[];
}

function minutesAgo(referenceDate: Date, minutes: number): Date {
  return new Date(referenceDate.getTime() - minutes * 60_000);
}

function hoursAgo(referenceDate: Date, hours: number): Date {
  return new Date(referenceDate.getTime() - hours * 3_600_000);
}

function daysAgo(referenceDate: Date, days: number): Date {
  const date = new Date(referenceDate);
  date.setDate(date.getDate() - days);
  return date;
}

function createAuditRecords(referenceDate: Date): readonly AuditRecord[] {
  return [
    {
      id: 'receipt-approval',
      category: 'receipt',
      operationLabel: 'Aprovação',
      operationIcon: 'check_circle',
      entityTypeLabel: 'Validação de comprovante',
      entityLabel: 'Inscrição de Ana Souza na Jornada de Inovação',
      summary: 'Comprovante aprovado',
      actorName: 'Rafael Almeida',
      recordedAt: minutesAgo(referenceDate, 38),
      changes: [
        { field: 'Situação', beforeValue: 'Em análise', afterValue: 'Aprovado' },
        { field: 'Valor conferido', beforeValue: 'Pendente', afterValue: 'R$ 35,00' },
      ],
    },
    {
      id: 'event-edit',
      category: 'event',
      operationLabel: 'Alteração',
      operationIcon: 'edit',
      entityTypeLabel: 'Evento',
      entityLabel: 'Semana de Tecnologia: Interfaces que incluem',
      summary: 'Evento atualizado pelo painel administrativo.',
      actorName: 'Marina Costa',
      recordedAt: hoursAgo(referenceDate, 3),
      changes: [
        { field: 'Vagas', beforeValue: '40', afterValue: '60' },
        { field: 'Horário', beforeValue: '13h30', afterValue: '14h' },
      ],
    },
    {
      id: 'permission-change',
      category: 'permission',
      operationLabel: 'Alteração',
      operationIcon: 'manage_accounts',
      entityTypeLabel: 'Permissão concedida',
      entityLabel: 'Beatriz Lima na Semana de Tecnologia',
      summary: 'Papel de acesso alterado',
      actorName: 'Rafael Almeida',
      recordedAt: daysAgo(referenceDate, 1),
      changes: [
        { field: 'Papel', beforeValue: 'Facilitadora', afterValue: 'Organizadora' },
        { field: 'Escopo', beforeValue: 'Interfaces que incluem', afterValue: 'Semana de Tecnologia' },
      ],
    },
    {
      id: 'certificate-issue',
      category: 'certificate',
      operationLabel: 'Emissão',
      operationIcon: 'workspace_premium',
      entityTypeLabel: 'Certificado',
      entityLabel: 'Marina Costa no evento Interfaces que incluem',
      summary: 'Certificado emitido',
      actorName: 'Beatriz Lima',
      recordedAt: daysAgo(referenceDate, 4),
      changes: [
        { field: 'Situação', beforeValue: 'Pendente', afterValue: 'Emitido' },
        { field: 'Nome no certificado', beforeValue: 'M. Costa', afterValue: 'Marina Costa' },
      ],
    },
  ];
}

@Component({
  selector: 'app-landing-audit-log-demo',
  imports: [DatePipe, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule],
  templateUrl: './audit-log-demo.html',
  styleUrl: './audit-log-demo.scss',
})
export class AuditLogDemoComponent {
  readonly filters: readonly AuditFilterOption[] = [
    { id: 'all', label: 'Tudo' },
    { id: 'event', label: 'Eventos' },
    { id: 'receipt', label: 'Comprovantes' },
    { id: 'permission', label: 'Permissões' },
    { id: 'certificate', label: 'Certificados' },
  ];
  private readonly referenceDate = new Date();
  readonly records = createAuditRecords(this.referenceDate);
  readonly searchQuery = signal('');
  readonly selectedCategory = signal<AuditCategory>('all');
  readonly selectedRecordId = signal<string | null>(null);
  readonly selectedRecord = computed(
    () => this.records.find((record) => record.id === this.selectedRecordId()) ?? null,
  );
  readonly visibleRecords = computed(() => {
    const category = this.selectedCategory();
    const query = this.searchQuery().trim().toLocaleLowerCase('pt-BR');

    return this.records.filter((record) => {
      if (category !== 'all' && record.category !== category) {
        return false;
      }

      if (!query) {
        return true;
      }

      const searchableText = [
        record.summary,
        record.entityTypeLabel,
        record.entityLabel,
        record.actorName,
        record.operationLabel,
        ...record.changes.flatMap((change) => [change.field, change.beforeValue, change.afterValue]),
      ]
        .join(' ')
        .toLocaleLowerCase('pt-BR');

      return searchableText.includes(query);
    });
  });
  readonly recordCountLabel = computed(() => {
    const count = this.visibleRecords().length;
    return `${count} ${count === 1 ? 'registro' : 'registros'}`;
  });
  readonly resultCountLabel = computed(() => {
    const count = this.visibleRecords().length;
    return `${count} ${count === 1 ? 'encontrado' : 'encontrados'}`;
  });
  readonly hasActiveFilters = computed(() => this.selectedCategory() !== 'all' || !!this.searchQuery().trim());

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  updateSearch(event: Event): void {
    if (event.target instanceof HTMLInputElement) {
      this.searchQuery.set(event.target.value);
    }
  }

  setCategory(category: AuditCategory): void {
    this.selectedCategory.set(category);
  }

  clearFilters(): void {
    this.searchQuery.set('');
    this.selectedCategory.set('all');
  }

  actorInitials(actorName: string): string {
    return actorName
      .split(' ')
      .filter(Boolean)
      .map((namePart) => namePart[0] ?? '')
      .slice(0, 2)
      .join('')
      .toLocaleUpperCase('pt-BR');
  }

  relativeTimeLabel(date: Date): string {
    const elapsedMinutes = Math.max(1, Math.floor((this.referenceDate.getTime() - date.getTime()) / 60_000));
    const relative = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' });

    if (elapsedMinutes < 60) {
      return relative.format(-elapsedMinutes, 'minute');
    }

    const elapsedHours = Math.floor(elapsedMinutes / 60);
    if (elapsedHours < 24) {
      return relative.format(-elapsedHours, 'hour');
    }

    const elapsedDays = Math.floor(elapsedHours / 24);
    if (elapsedDays < 30) {
      return relative.format(-elapsedDays, 'day');
    }

    return relative.format(-Math.floor(elapsedDays / 30), 'month');
  }

  openRecord(id: string): void {
    if (this.records.some((record) => record.id === id)) {
      this.selectedRecordId.set(id);
      this.focusAfterRender('#audit-log-detail-title');
    }
  }

  returnToList(): void {
    this.selectedRecordId.set(null);
    this.focusAfterRender('#audit-log-list-title');
  }

  private focusAfterRender(selector: string): void {
    afterNextRender(
      () => this.host.nativeElement.querySelector<HTMLElement>(selector)?.focus({ preventScroll: true }),
      { injector: this.injector },
    );
  }
}
