import { ADMIN_SHELL_CONTEXT } from './admin-shell-context';
import { Component, DestroyRef, effect, inject, input, output, signal, untracked } from '@angular/core';
import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { TwemojiComponent } from '@cacic-fct/shared-angular';
import { Permission } from '@cacic-fct/shared-permissions';
import type { AdminEventContextKind, AdminEventContextNode, AdminEventContextPage, AdminEventContextPageOptions } from '@cacic-fct/event-manager-admin-contracts';
import { firstValueFrom } from 'rxjs';
import { AdminEventContextApiService } from '../graphql/admin-event-context-api.service';
import { EventGroupApiService } from '../graphql/event-group-api.service';
import { EventApiService } from '../graphql/event-api.service';
import { MajorEventApiService } from '../graphql/major-event-api.service';
import { PermissionsService } from '../permissions/permissions.service';
import { bindLiveSearch } from '../search/live-search';
import { WorkspaceRecordComponent } from './workspace-record.component';
import { WorkspaceScopeComponent } from './workspace-scope.component';
import { EventFilterPanelComponent } from '../event-filters/event-filter-panel.component';
import { buildEventListFilters, resetEventFiltersForm, type EventFiltersForm } from '../event-filters/event-list-filters';

export interface EventContextRef { kind: 'event' | 'major-event' | 'group'; id: string; }
interface SelectedContext extends EventContextRef { name: string; emoji: string; }
interface ContextBranch {
  nodes: AdminEventContextNode[];
  expanded: boolean;
  loaded: boolean;
  loading: boolean;
  error: string;
  request: number;
}
const apiKinds: Record<EventContextRef['kind'], AdminEventContextKind> = {event:'EVENT',group:'EVENT_GROUP','major-event':'MAJOR_EVENT'};
const refKinds: Record<AdminEventContextKind, EventContextRef['kind']> = {EVENT:'event',EVENT_GROUP:'group',MAJOR_EVENT:'major-event'};
let nextPickerId = 0;

@Component({
  selector: 'app-event-context-picker',
  imports: [DatePipe, NgTemplateOutlet, ReactiveFormsModule, MatButtonModule, MatFormFieldModule,
    MatInputModule, MatIconModule, MatProgressBarModule, TwemojiComponent, WorkspaceRecordComponent, WorkspaceScopeComponent, EventFilterPanelComponent],
  template: `
    @if (!hideInShell() || !inShell) {
      @if (searchOnly()) {
        <ng-container [ngTemplateOutlet]="contextSearch" />
      } @else {
        <app-workspace-scope [disabled]="disabled()" [scopeId]="context()?.id ?? null"
          [title]="selected()?.name ?? (context() ? (detailError() ? 'Contexto indisponível' : 'Carregando contexto…') : '')"
          [emoji]="selected()?.emoji" emptyLabel="Escolher contexto" changeLabel="Trocar contexto">
          <ng-container [ngTemplateOutlet]="contextSearch" />
        </app-workspace-scope>
      }
      @if (!searchOnly() && detailError()) { <p role="status">{{ detailError() }}</p> }
    }
    <ng-template #contextSearch>
      @if (childKind() !== 'group' && !disabled()) {
        <app-event-filter-panel [form]="filters" [queryLabel]="parentContext() ? 'Buscar eventos deste contexto' : 'Buscar contexto'"
          queryPlaceholder="Nome, local, descrição ou emoji" applyLabel="Buscar contextos"
          filterHint="Os filtros abaixo mostram somente eventos."
          (applyFilters)="search()" (resetFilters)="resetFilters()" />
      } @else {
        <form (submit)="$event.preventDefault(); search()">
        <mat-form-field>
          <mat-label>{{ parentContext() ? (childKind() === 'group' ? 'Buscar grupos deste contexto' : 'Buscar eventos deste contexto') : 'Buscar contexto' }}</mat-label>
          <mat-icon matPrefix>search</mat-icon>
          <input matInput type="search" placeholder="Nome, local, descrição ou emoji" [readonly]="disabled()" [formControl]="query" />
        </mat-form-field>
        </form>
      }
        @if (loading()) { <mat-progress-bar mode="indeterminate" aria-label="Carregando contextos" /> }
        @if (error()) {
          <p role="status">{{ error() }}</p>
          <button mat-button type="button" [disabled]="disabled()" (click)="retryPage()">Tentar novamente</button>
        }
        <div class="context-results" [attr.aria-busy]="loading()">
          <ul class="context-tree" [attr.aria-label]="appliedQuery() || hasAppliedFilters() ? 'Resultados da busca' : 'Hierarquia de contextos'">
            @for (node of results(); track nodeKey(node)) {
              <ng-container [ngTemplateOutlet]="treeNode" [ngTemplateOutletContext]="{$implicit:node}" />
            } @empty {
              @if (!loading() && !error()) { <li class="empty-result">Nenhum contexto encontrado. Revise a busca ou volte à página anterior.</li> }
            }
          </ul>
        </div>
        @if (!parentContext()) {
          <div class="context-pager" aria-label="Paginação de contextos">
            <button mat-icon-button type="button" aria-label="Página anterior de contextos"
              [disabled]="disabled() || loading() || !cursorHistory().length" (click)="previousPage()"><mat-icon>chevron_left</mat-icon></button>
            <span aria-live="polite">Página {{ cursorHistory().length + 1 }}@if (!loading() && !error()) { · {{ results().length }} nesta página }</span>
            <button mat-icon-button type="button" aria-label="Próxima página de contextos"
              [disabled]="disabled() || loading() || !nextCursor()" (click)="nextPage()"><mat-icon>chevron_right</mat-icon></button>
          </div>
        }
    </ng-template>
    <ng-template #treeNode let-node>
      <li class="context-tree-entry">
        <div class="context-node-row">
          @if (canExpand(node)) {
            <button mat-icon-button class="disclosure" type="button" [disabled]="disabled()"
              [attr.aria-label]="(branch(node)?.expanded ? 'Recolher ' : 'Expandir ') + node.name"
              [attr.aria-expanded]="branch(node)?.expanded ?? false" [attr.aria-controls]="branchId(node)"
              (click)="toggleBranch(node)">
              <mat-icon>{{ branch(node)?.expanded ? 'expand_more' : 'chevron_right' }}</mat-icon>
            </button>
          } @else { <span class="disclosure-spacer" aria-hidden="true"></span> }
          @if (canSelect(node)) {
            <app-workspace-record [title]="node.name" [label]="'Selecionar ' + node.name" [disabled]="disabled()"
              [selected]="isSelected(node)" (activate)="choose(node)">
              <lib-twemoji recordIcon [emoji]="node.emoji" />
              <span recordDescription><ng-container [ngTemplateOutlet]="nodeMetadata" [ngTemplateOutletContext]="{$implicit:node}" /></span>
            </app-workspace-record>
          } @else {
            <div class="container-node"><strong><lib-twemoji [emoji]="node.emoji" /> {{ node.name }}</strong>
              <ng-container [ngTemplateOutlet]="nodeMetadata" [ngTemplateOutletContext]="{$implicit:node}" />
              <small>{{ canExpand(node) ? 'Expanda para escolher uma atividade.' : node.hasChildren ? 'Seleção indisponível para esta operação.' : 'Nenhuma atividade disponível.' }}</small>
            </div>
          }
        </div>
        @if (canExpand(node)) {
          <ul class="context-tree-children" [id]="branchId(node)" [hidden]="!branch(node)?.expanded">
            @if (branch(node); as children) {
            @if (children.loading) { <li><mat-progress-bar mode="indeterminate" [attr.aria-label]="'Carregando atividades de ' + node.name" /></li> }
            @if (children.error) {
              <li><p role="status">{{ children.error }}</p><button mat-button type="button" [disabled]="disabled()" (click)="retryBranch(node)">Tentar novamente</button></li>
            }
            @for (child of children.nodes; track nodeKey(child)) {
              <ng-container [ngTemplateOutlet]="treeNode" [ngTemplateOutletContext]="{$implicit:child}" />
            } @empty {
              @if (children.loaded && !children.loading && !children.error) { <li class="empty-result">Nenhuma atividade disponível.</li> }
            }
            }
          </ul>
        }
      </li>
    </ng-template>
    <ng-template #nodeMetadata let-node>
      <span class="node-meta">{{ kindLabel(node.kind) }}@if (node.eventType) { · {{ eventTypeLabel(node.eventType) }} }@if (node.startDate) { · {{ node.startDate | date:'short' }} }@if (node.publicationState) { · {{ publicationLabel(node.publicationState) }} }</span>
      @if (node.locationDescription) { <span class="node-meta">{{ node.locationDescription }}</span> }
      @if ((appliedQuery() || hasAppliedFilters()) && node.ancestors.length) {
        <span class="node-ancestry">Em: @for (ancestor of node.ancestors; track ancestor.kind + ':' + ancestor.id; let last = $last) {
          <lib-twemoji [emoji]="ancestor.emoji" /> {{ ancestor.name }}@if (!last) { › }
        }</span>
      }
    </ng-template>
  `,
  styles: `
    :host { display:block; min-width:0; } mat-form-field { width:100%; }
    .context-pager { display:flex; align-items:center; flex-wrap:wrap; gap:0.5rem; margin-block:0.5rem; }
    .context-pager { justify-content:space-between; font:var(--mat-sys-body-small); }
    .context-results { max-height:min(30rem, 50dvh); overflow:auto; }
    .context-tree, .context-tree-children { list-style:none; margin:0; padding:0; }
    .context-tree-children { position:relative; margin-inline-start:1rem; }
    .context-tree-children:has(> .context-tree-entry)::before {
      content:''; position:absolute; inset-block:0.125rem; inset-inline-start:0.375rem;
      border-inline-start:1px solid var(--mat-sys-outline-variant); pointer-events:none;
    }
    .context-node-row { display:grid; grid-template-columns:44px minmax(0,1fr); align-items:start; }
    .disclosure { margin-block-start:0.5rem; } .disclosure-spacer { width:44px; }
    .container-node { display:grid; gap:0.25rem; min-width:0; padding:0.75rem; overflow-wrap:anywhere; }
    .container-node strong { font:var(--mat-sys-title-small); }
    .node-meta, .node-ancestry, .container-node small { display:block; font:var(--mat-sys-body-small); overflow-wrap:anywhere; }
    .node-ancestry { margin-block-start:0.25rem; }
    .empty-result { padding:0.75rem; font:var(--mat-sys-body-medium); }
    @media(max-width:480px) {
      .context-tree-children { margin-inline-start:0.5rem; }
      .context-tree-children:has(> .context-tree-entry)::before { inset-inline-start:0.875rem; }
    }
  `,
})
export class EventContextPickerComponent {
  readonly parentContext = input<EventContextRef | null>(null);
  readonly childKind = input<'event' | 'group' | null>(null);
  readonly searchOnly = input(false);
  readonly context = input<EventContextRef | null>(null);
  readonly disabled = input(false);
  readonly hideInShell = input(false);
  protected readonly inShell = inject(ADMIN_SHELL_CONTEXT, {optional:true}) ?? false;
  readonly allowGroups = input(false);
  readonly contextChange = output<EventContextRef>();
  readonly query = new FormControl('', {nonNullable:true});
  readonly filters: EventFiltersForm = new FormGroup({
    query: this.query,
    startDateFrom: new FormControl<Date | null>(null),
    startDateUntil: new FormControl<Date | null>(null),
    isInGroup: new FormControl('ALL', { nonNullable: true }),
    isInMajorEvent: new FormControl('ALL', { nonNullable: true }),
  });
  private readonly appliedFilters = signal<Pick<AdminEventContextPageOptions, 'startDateFrom' | 'startDateUntil' | 'isInGroup' | 'isInMajorEvent'>>({});
  readonly results = signal<AdminEventContextNode[]>([]);
  readonly selected = signal<SelectedContext | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly detailError = signal('');
  readonly appliedQuery = signal('');
  readonly nextCursor = signal<string | null>(null);
  readonly cursorHistory = signal<(string | null)[]>([]);
  readonly branches = signal<Record<string,ContextBranch>>({});
  protected readonly permissions = inject(PermissionsService);
  private readonly explorer = inject(AdminEventContextApiService);
  private readonly groups = inject(EventGroupApiService);
  private readonly events = inject(EventApiService);
  private readonly majorEvents = inject(MajorEventApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly treeId = `context-explorer-${nextPickerId++}`;
  private cursor: string | null = null;
  private searchRequest = 0;
  private detailRequest = 0;
  private branchRequest = 0;

  constructor() {
    bindLiveSearch({control:this.filters,destroyRef:this.destroyRef,search:()=>this.search()});
    effect(()=>{if(!this.hideInShell() || !this.inShell) void this.loadSelection(this.searchOnly()?null:this.context());});
    effect(()=>{if(!this.hideInShell() || !this.inShell) {this.parentContext();this.childKind();untracked(()=>{void this.search();});}});
  }

  async search(): Promise<void> {
    this.appliedQuery.set(this.query.value.trim());
    const filters = buildEventListFilters(this.filters.getRawValue());
    this.appliedFilters.set(this.childKind() === 'group' ? {} : {
      ...(filters.startDateFrom ? { startDateFrom: filters.startDateFrom } : {}),
      ...(filters.startDateUntil ? { startDateUntil: filters.startDateUntil } : {}),
      ...(filters.isInGroup !== undefined ? { isInGroup: filters.isInGroup } : {}),
      ...(filters.isInMajorEvent !== undefined ? { isInMajorEvent: filters.isInMajorEvent } : {}),
    });
    this.cursor=null;
    this.cursorHistory.set([]);
    await this.loadPage();
  }

  async retryPage(): Promise<void> { if(!this.disabled()) await this.search(); }
  async resetFilters(): Promise<void> {
    resetEventFiltersForm(this.filters);
    await this.search();
  }
  hasAppliedFilters(): boolean { return Object.keys(this.appliedFilters()).length > 0; }
  async nextPage(): Promise<void> {
    const next=this.nextCursor();
    if(this.parentContext() || !next || this.loading() || this.disabled()) return;
    this.cursorHistory.update((history)=>[...history,this.cursor]);
    this.cursor=next;
    await this.loadPage();
  }
  async previousPage(): Promise<void> {
    const history=this.cursorHistory();
    if(this.parentContext() || !history.length || this.loading() || this.disabled()) return;
    this.cursor=history[history.length-1];
    this.cursorHistory.set(history.slice(0,-1));
    await this.loadPage();
  }

  private async loadPage(): Promise<void> {
    const request=++this.searchRequest;
    this.loading.set(true);this.error.set('');this.results.set([]);this.nextCursor.set(null);this.branches.set({});
    const collectAllPages = this.parentContext() !== null;
    let cursor=this.cursor;
    const nodes: AdminEventContextNode[] = [];
    try {
      await this.permissions.evaluateWorkspacePermissions();
      do {
        const page=await firstValueFrom(this.explorer.listPage(this.pageOptions(cursor)));
        if(request!==this.searchRequest || this.destroyRef.destroyed) return;
        nodes.push(...page.nodes);
        cursor=page.nextCursor;
      } while (collectAllPages && cursor);
      if(request!==this.searchRequest || this.destroyRef.destroyed) return;
      this.results.set(nodes);this.nextCursor.set(collectAllPages ? null : cursor);
    } catch {
      if(request===this.searchRequest) this.error.set('Não foi possível carregar os contextos. Tente novamente para recomeçar pela primeira página.');
    } finally { if(request===this.searchRequest) this.loading.set(false); }
  }

  private pageOptions(cursor: string | null): AdminEventContextPageOptions {
    const parent=this.parentContext();
    const child=this.childKind();
    return {take:20,...this.appliedFilters(),...(this.appliedQuery()?{query:this.appliedQuery()}:{}),...(cursor?{cursor}:{}),
      ...(parent?{parentKind:apiKinds[parent.kind],parentId:parent.id}:{}),
      ...(parent && child?{childKind:apiKinds[child]}:{})};
  }

  nodeKey(node: AdminEventContextNode): string { return `${node.kind}:${node.id}`; }
  branchId(node: AdminEventContextNode): string { return `${this.treeId}-${node.kind}-${encodeURIComponent(node.id)}`; }
  branch(node: AdminEventContextNode): ContextBranch | undefined { return this.branches()[this.nodeKey(node)]; }
  canExpand(node: AdminEventContextNode): boolean { return node.hasChildren && !this.appliedQuery() && !this.hasAppliedFilters() && !(this.parentContext() && this.childKind()); }
  canSelect(node: AdminEventContextNode): boolean {
    const permission=node.kind==='EVENT'?Permission.Event.Read:node.kind==='EVENT_GROUP'?Permission.EventGroup.Read:Permission.MajorEvent.Read;
    return this.permissions.has(permission) && (node.kind!=='EVENT_GROUP' || this.allowGroups() || this.childKind()==='group');
  }
  isSelected(node: AdminEventContextNode): boolean { return this.context()?.id===node.id && this.context()?.kind===refKinds[node.kind]; }

  async toggleBranch(node: AdminEventContextNode): Promise<void> {
    if(this.disabled() || !this.canExpand(node)) return;
    const current=this.branch(node);
    if(current?.expanded) {
      this.setBranch(node,{...current,expanded:false,loading:false,request:++this.branchRequest});return;
    }
    if(current?.loaded) {this.setBranch(node,{...current,expanded:true});return;}
    await this.loadBranch(node);
  }
  async retryBranch(node: AdminEventContextNode): Promise<void> {
    if(!this.disabled()) await this.loadBranch(node);
  }
  private async loadBranch(node: AdminEventContextNode): Promise<void> {
    const generation=this.searchRequest;
    const request=++this.branchRequest;
    this.setBranch(node,{nodes:[],expanded:true,loaded:false,loading:true,error:'',request});
    const nodes: AdminEventContextNode[] = [];
    let cursor: string | null = null;
    try {
      do {
        const page: AdminEventContextPage = await firstValueFrom(this.explorer.listPage({parentKind:node.kind,parentId:node.id,take:20,...(cursor?{cursor}:{})}));
        if(!this.isCurrentBranchRequest(node,generation,request)) return;
        nodes.push(...page.nodes);
        cursor=page.nextCursor;
      } while (cursor);
      if(!this.isCurrentBranchRequest(node,generation,request)) return;
      this.setBranch(node,{nodes,expanded:true,loaded:true,loading:false,error:'',request});
    } catch {
      if(!this.isCurrentBranchRequest(node,generation,request)) return;
      this.setBranch(node,{nodes:[],expanded:true,loaded:false,loading:false,error:'Não foi possível carregar estas atividades.',request});
    }
  }
  private isCurrentBranchRequest(node: AdminEventContextNode,generation:number,request:number): boolean {
    return !this.destroyRef.destroyed && generation===this.searchRequest && this.branch(node)?.request===request;
  }
  private setBranch(node: AdminEventContextNode,branch:ContextBranch): void {this.branches.update((branches)=>({...branches,[this.nodeKey(node)]:branch}));}

  choose(node: AdminEventContextNode): void {
    if(this.disabled() || !this.canSelect(node)) return;
    const ref={kind:refKinds[node.kind],id:node.id};
    this.selected.set({...ref,name:node.name,emoji:node.emoji});this.contextChange.emit(ref);
  }
  kindLabel(kind: AdminEventContextKind): string { return {EVENT:'Evento',EVENT_GROUP:'Grupo de eventos',MAJOR_EVENT:'Grande evento'}[kind]; }
  eventTypeLabel(type: string): string { return ({MINICURSO:'Minicurso',PALESTRA:'Palestra',OTHER:'Outro'} as Record<string,string>)[type] ?? type; }
  publicationLabel(state: string): string { return ({DRAFT:'Rascunho',PUBLISHED:'Publicado',SCHEDULED:'Agendado',UNPUBLISHED:'Fora do ar'} as Record<string,string>)[state] ?? state; }

  private async loadSelection(context: EventContextRef | null): Promise<void> {
    const request=++this.detailRequest;
    this.selected.set(null);this.detailError.set('');
    if(!context) return;
    try {
      const item=context.kind==='event'?await firstValueFrom(this.events.getEvent(context.id))
        :context.kind==='group'?await firstValueFrom(this.groups.getEventGroup(context.id)):await firstValueFrom(this.majorEvents.getMajorEvent(context.id));
      if(request===this.detailRequest && !this.destroyRef.destroyed) this.selected.set({...context,name:item.name,emoji:item.emoji});
    } catch { if(request===this.detailRequest) this.detailError.set('O contexto selecionado não está disponível. Escolha outro.'); }
  }
}
