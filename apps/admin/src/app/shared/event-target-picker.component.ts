import { DatePipe } from '@angular/common';
import { Component, DestroyRef, ElementRef, effect, inject, input, output, signal, viewChild } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Event, MajorEvent } from '@cacic-fct/event-manager-admin-contracts';
import { TwemojiComponent } from '@cacic-fct/shared-angular';
import { isBefore, isValid, parseISO } from 'date-fns';
import { firstValueFrom } from 'rxjs';
import { EventApiService } from '../graphql/event-api.service';
import { MajorEventApiService } from '../graphql/major-event-api.service';
import { bindLiveSearch } from '../search/live-search';
import {
  applyPagedResult,
  createWorkspaceListPagination,
  resetPagination,
} from '../pagination/list-pagination';
import { WorkspaceRecordComponent } from '../shared/workspace-record.component';
export interface EventTargetSelection { id: string; name: string; emoji?: string | null; }

export type EventTargetType = 'EVENT' | 'MAJOR_EVENT';

const TARGET_PAGE_SIZE = 20;

@Component({
  selector: 'app-event-target-picker',
  imports: [
    DatePipe,
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatTooltipModule,
    TwemojiComponent,
    WorkspaceRecordComponent,
  ],
  template: `
    <div class="form-target-picker">
      <div class="selection-row">
        <div class="selection-summary">
          @if (selectedEmoji(); as emoji) { <lib-twemoji [emoji]="emoji" /> }
          <span>{{ selectedName() || (selectedId() ? 'Alvo selecionado' : emptyLabel()) }}</span>
        </div>
        <button
          #toggleButton
          mat-button
          type="button"
          [disabled]="disabled()"
          [attr.aria-expanded]="expanded()"
          (click)="toggle()">
          <mat-icon>{{ expanded() ? 'expand_less' : 'search' }}</mat-icon>
          {{ expanded() ? 'Fechar busca' : (selectedId() ? 'Trocar' : 'Escolher') }}
        </button>
      </div>

      @if (expanded()) {
        <div class="picker-panel">
          <mat-form-field appearance="outline">
            <mat-label>{{ label() }}</mat-label>
            <mat-icon matPrefix>search</mat-icon>
            <input matInput type="search" [formControl]="query" autocomplete="off" [readonly]="disabled()" />
          </mat-form-field>

          @if (loading()) { <mat-progress-bar mode="indeterminate" [attr.aria-label]="'Buscando ' + label().toLowerCase()" /> }
          @if (error()) {
            <div class="picker-error" role="alert">
              <span>{{ error() }}</span>
              <button mat-button type="button" [disabled]="disabled()" (click)="search()">Tentar novamente</button>
            </div>
          }

          <div class="target-results" role="group" [attr.aria-label]="'Resultados de ' + label().toLowerCase()">
            @for (target of results(); track target.id) {
              <app-workspace-record
                [title]="target.name"
                [label]="'Selecionar ' + target.name"
                [selected]="selectedId() === target.id"
                [disabled]="disabled()"
                (activate)="select(target)">
                <lib-twemoji recordIcon [emoji]="target.emoji" />
                <span recordDescription>{{ target.startDate | date: 'short' }}</span>
              </app-workspace-record>
            } @empty {
              @if (!loading() && !error()) { <p class="empty-note">Nenhum resultado encontrado.</p> }
            }
          </div>

          <nav class="target-pager" [attr.aria-label]="'Paginação de ' + label().toLowerCase()">
            <span>Itens {{ pagination.label() }}</span>
            <div>
              <button
                mat-icon-button
                type="button"
                aria-label="Página anterior"
                matTooltip="Anterior"
                [disabled]="disabled() || !pagination.hasPreviousPage() || loading()"
                (click)="previousPage()">
                <mat-icon>chevron_left</mat-icon>
              </button>
              <button
                mat-icon-button
                type="button"
                aria-label="Próxima página"
                matTooltip="Próxima"
                [disabled]="disabled() || !pagination.hasNextPage() || loading()"
                (click)="nextPage()">
                <mat-icon>chevron_right</mat-icon>
              </button>
            </div>
          </nav>
        </div>
      }
    </div>
  `,
  styles: `
    :host { display: block; min-width: 0; }
    .form-target-picker { display: grid; gap: 0.5rem; min-width: 0; }
    .selection-row { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; min-width: 0; }
    .selection-summary { display: flex; align-items: center; gap: 0.5rem; min-width: 0; overflow-wrap: anywhere; }
    .selection-summary span { min-width: 0; overflow-wrap: anywhere; }
    .picker-panel { display: grid; gap: 0.5rem; border-top: 1px solid var(--mat-sys-outline-variant); padding-top: 0.75rem; }
    .picker-panel mat-form-field { width: 100%; }
    .target-results { display: grid; gap: 0.125rem; max-height: 18rem; overflow: auto; }
    .target-pager { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; color: var(--mat-sys-on-surface-variant); font: var(--mat-sys-body-small); }
    .target-pager > div { display: flex; }
    .picker-error { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; color: var(--mat-sys-error); }
    .empty-note { margin: 0; color: var(--mat-sys-on-surface-variant); }
    @media (max-width: 480px) { .selection-row { align-items: stretch; flex-direction: column; } }
  `,
})
export class EventTargetPickerComponent {
  readonly targetType = input.required<EventTargetType>();
  readonly selectedId = input<string | null>(null);
  readonly selectedName = input('');
  readonly selectedEmoji = input<string | null | undefined>(null);
  readonly label = input.required<string>();
  readonly emptyLabel = input('Nenhum alvo selecionado');
  readonly disabled = input(false);
  readonly includePast = input(false);
  readonly targetChange = output<EventTargetSelection>();

  readonly query = new FormControl('', { nonNullable: true });
  readonly results = signal<Array<Event | MajorEvent>>([]);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly expanded = signal(false);
  readonly pagination = createWorkspaceListPagination(TARGET_PAGE_SIZE);

  private readonly eventApi = inject(EventApiService);
  private readonly majorEventApi = inject(MajorEventApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly toggleButton = viewChild<ElementRef<HTMLButtonElement>, ElementRef<HTMLButtonElement>>(
    'toggleButton',
    { read: ElementRef },
  );
  private requestId = 0;
  private activeTargetType: EventTargetType | null = null;
  private targetCache: {
    targetType: EventTargetType;
    query?: string;
    items: Array<Event | MajorEvent>;
    nextSkip: number;
    exhausted: boolean;
    seenIds: Set<string>;
  } | null = null;

  constructor() {
    bindLiveSearch({
      control: this.query,
      destroyRef: this.destroyRef,
      search: () => this.applySearch(),
    });
    effect(() => {
      const targetType = this.targetType();
      if (this.activeTargetType === null) {
        this.activeTargetType = targetType;
        return;
      }
      if (this.activeTargetType === targetType) {
        return;
      }
      this.activeTargetType = targetType;
      this.query.setValue('', { emitEvent: false });
      resetPagination(this.pagination);
      this.results.set([]);
      this.targetCache = null;
      if (this.expanded()) void this.search();
    });
  }

  toggle(): void {
    if (this.disabled()) return;
    const expanded = !this.expanded();
    this.expanded.set(expanded);
    if (expanded && this.results().length === 0) void this.search();
  }

  async search(): Promise<void> {
    const requestId = ++this.requestId;
    const targetType = this.targetType();
    const query = this.query.value.trim() || undefined;
    const pageIndex = this.pagination.pageIndex();
    this.loading.set(true);
    this.error.set('');
    try {
      const requiredCount = (pageIndex + 1) * TARGET_PAGE_SIZE + 1;
      const items = await this.collectVisibleTargets(targetType, query, requiredCount, requestId);
      if (!items) return;
      if (
        requestId !== this.requestId ||
        targetType !== this.targetType() ||
        pageIndex !== this.pagination.pageIndex() ||
        query !== (this.query.value.trim() || undefined)
      ) {
        return;
      }
      const pageItems = items.slice(pageIndex * TARGET_PAGE_SIZE, requiredCount);
      this.results.set(applyPagedResult(pageItems, this.pagination, TARGET_PAGE_SIZE));
    } catch {
      if (requestId === this.requestId) this.error.set(`Não foi possível buscar ${this.label().toLowerCase()}.`);
    } finally {
      if (requestId === this.requestId) this.loading.set(false);
    }
  }

  async applySearch(): Promise<void> {
    this.targetCache = null;
    resetPagination(this.pagination);
    await this.search();
  }

  async previousPage(): Promise<void> {
    if (!this.pagination.hasPreviousPage() || this.loading()) return;
    this.pagination.pageIndex.update((page) => Math.max(0, page - 1));
    await this.search();
  }

  async nextPage(): Promise<void> {
    if (!this.pagination.hasNextPage() || this.loading()) return;
    this.pagination.pageIndex.update((page) => page + 1);
    await this.search();
  }

  select(target: Event | MajorEvent): void {
    if (this.disabled()) return;
    this.requestId++;
    this.targetChange.emit({ id: target.id, name: target.name, emoji: target.emoji });
    this.expanded.set(false);
    this.query.setValue('', { emitEvent: false });
    resetPagination(this.pagination);
    this.results.set([]);
    this.targetCache = null;
    Promise.resolve().then(() => {
      const button = this.toggleButton()?.nativeElement;
      button?.focus();
    });
  }

  private async collectVisibleTargets(
    targetType: EventTargetType,
    query: string | undefined,
    requiredCount: number,
    requestId: number,
  ): Promise<Array<Event | MajorEvent> | null> {
    if (
      !this.targetCache ||
      this.targetCache.targetType !== targetType ||
      this.targetCache.query !== query
    ) {
      this.targetCache = {
        targetType,
        query,
        items: [],
        nextSkip: 0,
        exhausted: false,
        seenIds: new Set<string>(),
      };
    }

    while (this.targetCache.items.length < requiredCount && !this.targetCache.exhausted) {
      const filters = { query, skip: this.targetCache.nextSkip, take: TARGET_PAGE_SIZE + 1 };
      const rawItems = targetType === 'EVENT'
        ? await firstValueFrom(this.eventApi.listEvents(filters))
        : await firstValueFrom(this.majorEventApi.listMajorEvents(filters));
      if (requestId !== this.requestId) return null;

      for (const item of rawItems as Array<Event | MajorEvent>) {
        if (
          !this.targetCache.seenIds.has(item.id) &&
          (item.id === this.selectedId() || this.includePast() || this.isOngoingOrFuture(item.endDate))
        ) {
          this.targetCache.seenIds.add(item.id);
          this.targetCache.items.push(item);
        } else {
          this.targetCache.seenIds.add(item.id);
        }
      }
      this.targetCache.exhausted = rawItems.length < TARGET_PAGE_SIZE + 1;
      this.targetCache.nextSkip += TARGET_PAGE_SIZE;
    }

    return this.targetCache.items;
  }

  private isOngoingOrFuture(value: string | null | undefined): boolean {
    if (!value) return true;
    const date = parseISO(value);
    return !isValid(date) || !isBefore(date, new Date());
  }
}
