import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  PLATFORM_ID,
  ViewEncapsulation,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { firstValueFrom } from 'rxjs';
import {
  PublicContentNode,
  PublicContentWorkspace,
  PublicationApiService,
  PublicationBulkOperation,
  PublicContentWorkspaceFilters,
} from '../../../graphql/publishing-api.service';
import { PublicationState, PublicationTargetType } from '../../../graphql/models';
import {
  defaultScheduledPublicationDate,
  flattenPublicationListItems,
  flattenPublicationNodes,
  localDateTimeInputToIso,
  publicationChildCountLabel,
  publicationErrorMessage,
  publicationTargetIcon,
  publicationTargetLabel,
  toDateTimeInputValue,
} from './workspace-publishing-utils';

@Component({
  selector: 'app-workspace-publishing-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatListModule,
    MatProgressBarModule,
    MatTooltipModule,
  ],
  templateUrl: './workspace-publishing-tab.component.html',
  styleUrl: './workspace-publishing-tab.component.scss',
  encapsulation: ViewEncapsulation.None,
})
export class WorkspacePublicationTabComponent {
  private readonly api = inject(PublicationApiService);
  private readonly formBuilder = inject(FormBuilder);
  private readonly snackbar = inject(MatSnackBar);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly platformId = inject(PLATFORM_ID);

  readonly loading = signal(false);
  readonly workspace = signal<PublicContentWorkspace | null>(null);
  readonly selectedNode = signal<PublicContentNode | null>(null);
  readonly pageIndex = signal(0);
  readonly pageSize = 50;
  readonly query = signal('');
  private readonly requestedNode = signal<Pick<PublicContentNode, 'targetType' | 'id'> | null>(null);
  readonly workspaceTree = computed(() => this.workspace()?.tree ?? this.workspace()?.items ?? []);
  readonly workspaceItems = computed(() => flattenPublicationNodes(this.workspaceTree()));
  readonly workspaceListItems = computed(() => flattenPublicationListItems(this.workspaceTree()));
  readonly hasPreviousPage = computed(() => this.pageIndex() > 0);
  readonly hasNextPage = computed(() => this.workspace()?.hasMore ?? false);
  readonly paginationLabel = computed(() => {
    const workspace = this.workspace();
    if (!workspace || workspace.totalCount === 0) {
      return 'Nenhum item';
    }
    const firstItem = workspace.skip + 1;
    const lastItem = Math.min(workspace.skip + workspace.take, workspace.totalCount);
    return `${firstItem}-${lastItem} de ${workspace.totalCount}`;
  });
  readonly selectedWarnings = computed(() => {
    const selected = this.selectedNode();
    if (!selected) {
      return this.workspace()?.warnings ?? [];
    }
    return (this.workspace()?.warnings ?? []).filter(
      (warning) => warning.targetId === selected.id || warning.eventId === selected.id,
    );
  });

  readonly filterForm = this.formBuilder.nonNullable.group({
    query: [''],
  });

  readonly actionForm = this.formBuilder.nonNullable.group({
    scheduledPublishAt: [toDateTimeInputValue(defaultScheduledPublicationDate()), [Validators.required]],
    previewAt: [toDateTimeInputValue(new Date()), [Validators.required]],
  });

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const targetType = params.get('targetType');
      const targetId = params.get('targetId');
      this.requestedNode.set(this.parseRequestedNode(targetType, targetId));
      this.selectRequestedNode();
    });
    void this.refresh();
  }

  async refresh(): Promise<void> {
    this.loading.set(true);
    try {
      const workspace = await firstValueFrom(this.api.getWorkspace(this.workspaceFilters()));
      this.workspace.set(workspace);
      const currentSelection = this.selectedNode();
      const requestedSelection = this.findRequestedNode(workspace);
      const nextSelection =
        requestedSelection ??
        (currentSelection
          ? this.workspaceItems().find(
              (node) => node.id === currentSelection.id && node.targetType === currentSelection.targetType,
            )
          : null) ??
        this.workspaceItems()[0] ??
        null;
      this.selectedNode.set(nextSelection ?? this.workspaceItems()[0] ?? null);
    } catch (error) {
      this.snackbar.open(publicationErrorMessage(error), 'Fechar', { duration: 6000 });
    } finally {
      this.loading.set(false);
    }
  }

  selectNode(node: PublicContentNode): void {
    this.selectedNode.set(node);
  }

  async applySearch(): Promise<void> {
    this.query.set(this.filterForm.controls.query.value.trim());
    this.pageIndex.set(0);
    await this.refresh();
  }

  async clearSearch(): Promise<void> {
    this.filterForm.controls.query.setValue('');
    this.query.set('');
    this.pageIndex.set(0);
    await this.refresh();
  }

  async previousPage(): Promise<void> {
    if (!this.hasPreviousPage()) {
      return;
    }
    this.pageIndex.update((page) => Math.max(0, page - 1));
    await this.refresh();
  }

  async nextPage(): Promise<void> {
    if (!this.hasNextPage()) {
      return;
    }
    this.pageIndex.update((page) => page + 1);
    await this.refresh();
  }

  async publishSelected(): Promise<void> {
    await this.setSelectedState('PUBLISHED');
  }

  async draftSelected(): Promise<void> {
    await this.setSelectedState('DRAFT');
  }

  async scheduleSelected(): Promise<void> {
    const scheduledPublishAtControl = this.actionForm.controls.scheduledPublishAt;
    scheduledPublishAtControl.markAsTouched();
    if (scheduledPublishAtControl.invalid) {
      return;
    }

    const scheduledPublishAt = scheduledPublishAtControl.value;
    await this.setSelectedState('SCHEDULED', scheduledPublishAt);
  }

  async unpublishSelected(): Promise<void> {
    await this.setSelectedState('UNPUBLISHED');
  }

  async scheduleBundle(): Promise<void> {
    const scheduledPublishAtControl = this.actionForm.controls.scheduledPublishAt;
    scheduledPublishAtControl.markAsTouched();
    if (scheduledPublishAtControl.invalid) {
      return;
    }

    await this.runBulkOperation('SCHEDULE_BUNDLE');
  }

  async publishMissingChildren(): Promise<void> {
    await this.runBulkOperation('PUBLISH_MISSING_CHILDREN');
  }

  async unpublishBundle(): Promise<void> {
    await this.runBulkOperation('UNPUBLISH_BUNDLE');
  }

  async previewSelected(): Promise<void> {
    const previewAtControl = this.actionForm.controls.previewAt;
    previewAtControl.markAsTouched();
    if (previewAtControl.invalid) {
      return;
    }

    const selected = this.selectedNode();
    if (!selected) {
      return;
    }

    this.loading.set(true);
    try {
      const result = await firstValueFrom(
        this.api.createPreview({
          targetType: selected.targetType,
          targetId: selected.id,
          previewAt: localDateTimeInputToIso(previewAtControl.value),
        }),
      );
      this.snackbar.open(result.message, 'Fechar', { duration: 5000 });
      if (isPlatformBrowser(this.platformId)) {
        window.open(result.url, '_blank', 'noopener');
      }
    } catch (error) {
      this.snackbar.open(publicationErrorMessage(error), 'Fechar', { duration: 6000 });
    } finally {
      this.loading.set(false);
    }
  }

  openEditor(): void {
    const selected = this.selectedNode();
    if (!selected) {
      return;
    }

    if (selected.targetType === 'MAJOR_EVENT') {
      void this.router.navigate(['/major-events', selected.id]);
      return;
    }

    if (selected.targetType === 'EVENT_GROUP') {
      void this.router.navigate(['/groups', selected.id]);
      return;
    }

    void this.router.navigate(['/events', selected.id]);
  }

  targetIcon(targetType: PublicationTargetType): string {
    return publicationTargetIcon(targetType);
  }

  targetLabel(targetType: PublicationTargetType): string {
    return publicationTargetLabel(targetType);
  }

  targetDescription(node: PublicContentNode, level = 0): string {
    const hiddenFromUsers = node.publiclyVisible === false && !node.statusLabel.toLowerCase().includes('oculto');
    const targetLabel = level > 0 && node.targetType === 'EVENT_GROUP' ? 'Conjunto' : publicationTargetLabel(node.targetType);
    const parentLabel = node.parentLabel
      ? node.targetType === 'EVENT_GROUP'
        ? `Conjunto de ${node.parentLabel}`
        : `Dentro de ${node.parentLabel}`
      : null;
    return [
      targetLabel,
      node.statusLabel,
      parentLabel,
      node.childCount > 0 ? publicationChildCountLabel(node.childCount) : null,
      hiddenFromUsers ? 'Oculto dos usuários' : null,
    ]
      .filter((item): item is string => item != null)
      .join(' · ');
  }

  childCountLabel(count: number): string {
    return publicationChildCountLabel(count);
  }

  isSelected(node: PublicContentNode): boolean {
    const selected = this.selectedNode();
    return selected?.id === node.id && selected.targetType === node.targetType;
  }

  isWarning(node: PublicContentNode): boolean {
    return node.publicationState !== 'PUBLISHED' || node.publiclyVisible === false;
  }

  private parseRequestedNode(
    targetType: string | null,
    targetId: string | null,
  ): Pick<PublicContentNode, 'targetType' | 'id'> | null {
    if (!targetId) {
      return null;
    }

    const normalizedTargetType = this.normalizeTargetType(targetType);
    if (!normalizedTargetType) {
      return null;
    }

    return {
      targetType: normalizedTargetType,
      id: targetId,
    };
  }

  private normalizeTargetType(targetType: string | null): PublicationTargetType | null {
    if (targetType === 'event' || targetType === 'EVENT') {
      return 'EVENT';
    }

    if (targetType === 'event-group' || targetType === 'EVENT_GROUP') {
      return 'EVENT_GROUP';
    }

    if (targetType === 'major-event' || targetType === 'MAJOR_EVENT') {
      return 'MAJOR_EVENT';
    }

    return null;
  }

  private selectRequestedNode(): void {
    const workspace = this.workspace();
    if (!workspace) {
      return;
    }

    const requested = this.findRequestedNode(workspace);
    if (requested) {
      this.selectedNode.set(requested);
    }
  }

  private findRequestedNode(workspace: PublicContentWorkspace): PublicContentNode | null {
    const requested = this.requestedNode();
    if (!requested) {
      return null;
    }

    return (
      flattenPublicationNodes(workspace.tree ?? workspace.items).find(
        (node) => node.id === requested.id && node.targetType === requested.targetType,
      ) ?? null
    );
  }

  private workspaceFilters(): PublicContentWorkspaceFilters {
    const requested = this.requestedNode();
    return {
      query: this.query() || null,
      skip: this.pageIndex() * this.pageSize,
      take: this.pageSize,
      focusTargetType: requested?.targetType ?? null,
      focusTargetId: requested?.id ?? null,
    };
  }

  private async setSelectedState(state: PublicationState, scheduledPublishAt?: string): Promise<void> {
    const selected = this.selectedNode();
    if (!selected) {
      return;
    }

    if (state === 'SCHEDULED' && !scheduledPublishAt) {
      this.actionForm.controls.scheduledPublishAt.markAsTouched();
      return;
    }

    this.loading.set(true);
    try {
      const result = await firstValueFrom(
        this.api.setPublicationState({
          targetType: selected.targetType,
          targetId: selected.id,
          state,
          scheduledPublishAt: scheduledPublishAt ? localDateTimeInputToIso(scheduledPublishAt) : null,
        }),
      );
      this.snackbar.open(result.message, 'Fechar', { duration: 4000 });
      await this.refresh();
    } catch (error) {
      this.snackbar.open(publicationErrorMessage(error), 'Fechar', { duration: 6000 });
    } finally {
      this.loading.set(false);
    }
  }

  private async runBulkOperation(operation: PublicationBulkOperation): Promise<void> {
    const selected = this.selectedNode();
    if (!selected) {
      return;
    }

    const scheduledPublishAtControl = this.actionForm.controls.scheduledPublishAt;
    if (operation === 'SCHEDULE_BUNDLE') {
      scheduledPublishAtControl.markAsTouched();
      if (scheduledPublishAtControl.invalid) {
        return;
      }
    }

    this.loading.set(true);
    try {
      const result = await firstValueFrom(
        this.api.runBulkOperation({
          targetType: selected.targetType,
          targetId: selected.id,
          operation,
          scheduledPublishAt:
            operation === 'SCHEDULE_BUNDLE'
              ? localDateTimeInputToIso(scheduledPublishAtControl.value)
              : null,
        }),
      );
      this.snackbar.open(result.message, 'Fechar', { duration: 4000 });
      await this.refresh();
    } catch (error) {
      this.snackbar.open(publicationErrorMessage(error), 'Fechar', { duration: 6000 });
    } finally {
      this.loading.set(false);
    }
  }
}
